import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import express from "express";
import { z } from "zod";
import {
  oauthProvider,
  handleAuthorizeCallback,
  getGameAuth,
} from "./auth.js";
import * as gameApi from "./gameApi.js";
import { computeMonitoringAggregates, type MonitoringAggregates } from "./aggregate.js";
import {
  BUILDING_DEFS,
  BUILDING_CLASSES,
  MATERIAL_TYPES,
  RESOURCE_TYPES,
  BASE_MARKET_PRICES,
  IMPORT_PRICE_MULTIPLIER,
  MARKET_VOLATILITY,
  MARKET_PRICE_MIN,
  MARKET_PRICE_MAX,
  SUPPLY_PRESSURE_FACTOR,
  SUPPLY_PRESSURE_DECAY,
  TERRITORY_BUILDINGS,
  TERRITORY_RADIUS,
  TAX_PER_BUILDING,
  WORKER_CAPACITY,
  WORKER_MONEY_CAPACITY,
  WORKER_UPKEEP,
  WORKER_COST,
  STARTING_WORKERS,
  STARTING_MONEY,
  MAP_EXPANSION_COST,
  TILES_PER_MAP,
  RESOURCE_DENSITY,
  NEW_PLAYER_PROTECTION_TICKS,
  AMBASSADOR_COOLDOWN_TICKS,
  AMBASSADOR_MAX_PERCENT_BY_TIER,
  TIER3_RESOURCES,
  type CommandType,
  type MapKey,
} from "@mars-2035/shared";
import { RESEARCH_TREE } from "@mars-2035/shared";

const MCP_PORT = Number(process.env.MCP_PORT ?? 3001);
const BASE_URL = process.env.MCP_BASE_URL ?? `http://localhost:${MCP_PORT}`;

// ── Tool Registration ──

function createServer(): McpServer {
  const mcp = new McpServer({
    name: "mars-2035",
    version: "0.1.0",
  });

  // ── get_event_trace ──

  mcp.tool(
    "get_event_trace",
    "Get recent game events for your player. Returns raw event trace showing what happened in the game.",
    {
      count: z
        .number()
        .min(1)
        .max(200)
        .default(50)
        .describe("Number of recent events to return"),
      event_type: z
        .string()
        .optional()
        .describe(
          "Filter by event type (e.g. production, auto_sell, processing, upkeep_charged)"
        ),
      map_key: z
        .string()
        .optional()
        .describe(
          "Filter by map key (e.g. '0:0:1:2'). Omit to get events from all maps."
        ),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);
      const events = await gameApi.getEvents(args.map_key);

      let filtered = events.filter((e) => {
        const pid =
          (e.data.player_id as string) ?? (e.data.owner_id as string);
        return !pid || pid === auth.playerId;
      });

      if (args.event_type) {
        filtered = filtered.filter((e) => e.type === args.event_type);
      }

      const result = filtered.slice(-args.count);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── get_monitoring ──

  mcp.tool(
    "get_monitoring",
    "Get aggregated monitoring data: production rates, consumption, financials, and trends — same as the in-game Monitoring panel. This tool collects live data over the requested number of ticks (1 tick ≈ 1 s). Expect ~10 s for 10 ticks, ~50 s for 50 ticks, ~100 s for 100 ticks. Set your client timeout to at least 120 s.",
    {
      window_size: z
        .union([z.literal(10), z.literal(50), z.literal(100)])
        .default(50)
        .describe("Number of ticks to collect and aggregate (10, 50, or 100). Takes ~N seconds."),
      map_key: z
        .string()
        .optional()
        .describe(
          "Filter by map key (e.g. '0:0:1:2'). Omit to get monitoring for all maps (results split per map)."
        ),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);

      // Get player data (for buildings list and map key)
      const playerData = await gameApi.getPlayer(
        auth.playerId,
        auth.gameToken
      );

      const allMapKeys = Object.keys(playerData.map_accounts);
      if (allMapKeys.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Player has no map account yet.",
            },
          ],
        };
      }

      const targetMapKeys = args.map_key ? [args.map_key] : allMapKeys;

      // Collect events for all target maps in parallel
      const eventsPerMap = await Promise.all(
        targetMapKeys.map(async (mk) => ({
          map_key: mk,
          events: await gameApi.collectEvents(mk, args.window_size, extra.signal),
        }))
      );

      // Compute aggregates per map
      const result: Record<string, MonitoringAggregates> = {};
      for (const { map_key: mk, events } of eventsPerMap) {
        const mapBuildings = playerData.buildings.filter((b) => b.map_key === mk);
        result[mk] = computeMonitoringAggregates(
          events,
          auth.playerId,
          mapBuildings,
          args.window_size
        );
      }

      // If a single map was requested, return just its aggregates directly
      const output = args.map_key ? result[args.map_key] : result;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }
  );

  // ── get_world_status ──

  mcp.tool(
    "get_world_status",
    "Get high-level game status: world info, market prices, and your player summary.",
    async (extra) => {
      const auth = getGameAuth(extra.authInfo);

      const [world, playerData] = await Promise.all([
        gameApi.getWorld(),
        gameApi.getPlayer(auth.playerId, auth.gameToken),
      ]);

      const buildingsByClass: Record<string, number> = {};
      for (const b of playerData.buildings) {
        buildingsByClass[b.class] = (buildingsByClass[b.class] ?? 0) + 1;
      }

      let totalMoney = 0;
      for (const b of playerData.buildings) {
        if (b.class === "admin_outpost" && b.inventory?.money) {
          totalMoney += b.inventory.money;
        }
      }

      const result = {
        world,
        player: {
          id: playerData.entity_id,
          name: playerData.name,
          status: playerData.status,
          research: playerData.research,
          maps: Object.keys(playerData.map_accounts),
        },
        buildings_by_class: buildingsByClass,
        total_money: totalMoney,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // ── get_buildings ──

  mcp.tool(
    "get_buildings",
    "Get detailed info about your buildings including inventory, routes, and auto-sell config.",
    {
      building_class: z
        .string()
        .optional()
        .describe(
          "Filter by building class (e.g. mine, port, smelter, warehouse)"
        ),
      status: z
        .string()
        .optional()
        .describe("Filter by status (active, suspended, constructing)"),
      map_key: z
        .string()
        .optional()
        .describe(
          "Filter by map key (e.g. '0:0:1:2'). Omit to get buildings from all maps."
        ),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);
      const playerData = await gameApi.getPlayer(
        auth.playerId,
        auth.gameToken
      );

      let buildings = playerData.buildings;
      if (args.map_key) {
        buildings = buildings.filter((b) => b.map_key === args.map_key);
      }
      if (args.building_class) {
        buildings = buildings.filter((b) => b.class === args.building_class);
      }
      if (args.status) {
        buildings = buildings.filter((b) => b.status === args.status);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(buildings, null, 2),
          },
        ],
      };
    }
  );

  // ── get_map_resources ──

  mcp.tool(
    "get_map_resources",
    "Get resource tiles on a map sector for building placement decisions. Returns only tiles with resources (not all 90k tiles). Use resource_type to filter to a specific resource.",
    {
      map_key: z
        .string()
        .describe("Map key (e.g. '0:0:1:2')"),
      resource_type: z
        .string()
        .optional()
        .describe("Filter to a specific resource type (e.g. 'steel', 'rare_earth')"),
      region: z
        .object({
          x1: z.number().describe("Left X coordinate"),
          y1: z.number().describe("Top Y coordinate"),
          x2: z.number().describe("Right X coordinate"),
          y2: z.number().describe("Bottom Y coordinate"),
        })
        .optional()
        .describe("Optional bounding box to limit results to a region of the map"),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);
      const data = await gameApi.getMapTiles(auth.gameToken, args.map_key as MapKey);

      let tiles = data.tiles;
      if (args.resource_type) {
        tiles = tiles.filter((t) => t.resource?.type === args.resource_type);
      }
      if (args.region) {
        const { x1, y1, x2, y2 } = args.region;
        tiles = tiles.filter((t) => t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2);
      }

      // Build summary counts
      const summary: Record<string, { count: number; avg_richness: number }> = {};
      for (const t of tiles) {
        const type = t.resource?.type;
        if (!type) continue;
        if (!summary[type]) summary[type] = { count: 0, avg_richness: 0 };
        summary[type].count++;
        summary[type].avg_richness += t.resource.richness;
      }
      for (const s of Object.values(summary)) {
        s.avg_richness = Math.round((s.avg_richness / s.count) * 100) / 100;
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            map_key: args.map_key,
            total_resource_tiles: tiles.length,
            summary,
            tiles: tiles.map((t) => ({
              x: t.x,
              y: t.y,
              type: t.resource?.type,
              richness: t.resource?.richness,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── get_workers ──

  mcp.tool(
    "get_workers",
    "Get your workers with state, position, current task, inventory, and work area assignment.",
    {
      map_key: z
        .string()
        .optional()
        .describe("Filter by map key. Omit to get workers from all maps."),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);
      const workers = await gameApi.getWorkers(auth.playerId, auth.gameToken);

      const filtered = args.map_key
        ? workers.filter((w) => w.map_key === args.map_key)
        : workers;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(filtered, null, 2),
        }],
      };
    }
  );

  // ── get_market ──

  mcp.tool(
    "get_market",
    "Get current market prices, base prices for comparison, and market config (import multiplier, volatility).",
    async (_extra) => {
      const currentPrices = await gameApi.getMarketPrices();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            current_prices: currentPrices,
            base_prices: BASE_MARKET_PRICES,
            import_multiplier: IMPORT_PRICE_MULTIPLIER,
            volatility: MARKET_VOLATILITY,
            price_range: { min: MARKET_PRICE_MIN, max: MARKET_PRICE_MAX },
          }, null, 2),
        }],
      };
    }
  );

  // ── get_diplomacy_status ──

  mcp.tool(
    "get_diplomacy_status",
    "Get your ambassadors, tax info, and embassy details for a map.",
    {
      map_key: z
        .string()
        .describe("Map key (e.g. '0:0:1:2')"),
    },
    async (args, extra) => {
      const auth = getGameAuth(extra.authInfo);
      const snapshot = await gameApi.getMapSnapshot(auth.gameToken, args.map_key as MapKey);

      const myAmbassadors = snapshot.ambassadors.filter((a) => a.owner_id === auth.playerId);
      const rivalAmbassadors = snapshot.ambassadors.filter((a) => a.owner_id !== auth.playerId);
      const embassies = snapshot.buildings.filter((b) => b.class === "embassy");

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            map_key: args.map_key,
            tax_info: snapshot.tax_info,
            my_ambassadors: myAmbassadors,
            rival_ambassadors: rivalAmbassadors,
            embassies,
          }, null, 2),
        }],
      };
    }
  );

  // ══════════════════════════════════════════════════════
  // ── Command Tools (7 grouped tools) ──
  // ══════════════════════════════════════════════════════
  //
  // Each tool groups related commands using a discriminated union on the
  // "command" field. Commands are submitted then the tool waits for the next
  // game tick to confirm success or return an error with details.

  // Helper: submit a command and return the result
  async function submitCmd(
    extra: { authInfo?: import("@modelcontextprotocol/sdk/server/auth/types.js").AuthInfo },
    commandType: CommandType,
    data: Record<string, unknown>
  ) {
    const auth = getGameAuth(extra.authInfo);
    const result = await gameApi.submitCommand(auth.gameToken, commandType, data);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  }

  // ── building_command ──

  mcp.tool(
    "building_command",
    "Place or sell buildings. Waits for the next game tick and returns the result event on success or an error message on failure.",
    {
      command: z.enum(["place_building", "sell_building"]).describe("Command type"),
      building_class: z
        .string()
        .optional()
        .describe("Building class to place (e.g. mine, port, smelter, warehouse). Required for place_building."),
      location: z
        .object({
          dx: z.number().describe("District X"),
          dy: z.number().describe("District Y"),
          mx: z.number().describe("Map X within district"),
          my: z.number().describe("Map Y within district"),
          x: z.number().describe("Tile X within map"),
          y: z.number().describe("Tile Y within map"),
        })
        .optional()
        .describe("Tile location for placement. Required for place_building."),
      building_id: z
        .string()
        .optional()
        .describe("Building entity ID. Required for sell_building."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ── trade_command ──

  mcp.tool(
    "trade_command",
    "Export resources at port for revenue, import raw materials, or transfer money between admin outposts. Waits for the next game tick and returns the result event on success or an error on failure.",
    {
      command: z.enum(["export", "import", "transfer"]).describe("Command type"),
      building_id: z
        .string()
        .optional()
        .describe("Port building ID for export/import."),
      material: z
        .string()
        .optional()
        .describe("Material type to trade (e.g. 'steel', 'morphic_core'). Required for export/import/transfer."),
      amount: z
        .number()
        .optional()
        .describe("Amount to trade. Required for export/import/transfer."),
      from_building_id: z
        .string()
        .optional()
        .describe("Source admin outpost ID. Required for transfer."),
      to_building_id: z
        .string()
        .optional()
        .describe("Destination admin outpost ID. Required for transfer."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ── route_command ──

  mcp.tool(
    "route_command",
    "Manage resource routes, auto-sell config, and stock limits. Routes transport resources between buildings each tick. Auto-sell configures ports to sell automatically. Buffer/max stock control inventory levels.",
    {
      command: z.enum([
        "configure_route", "delete_route",
        "configure_auto_sell",
        "set_buffer_stock", "set_max_stock",
      ]).describe("Command type"),
      from_building_id: z
        .string()
        .optional()
        .describe("Source building ID. Required for configure_route/delete_route."),
      to_building_id: z
        .string()
        .optional()
        .describe("Destination building ID. Required for configure_route/delete_route."),
      resource: z
        .string()
        .optional()
        .describe("Resource type or 'all' for routes. Resource type for auto_sell/buffer/max_stock."),
      building_id: z
        .string()
        .optional()
        .describe("Building ID. Required for configure_auto_sell/set_buffer_stock/set_max_stock."),
      rule: z
        .union([
          z.object({
            mode: z.enum(["any_rate", "min_rate"]).describe("Auto-sell mode"),
            min_price: z.number().optional().describe("Minimum price (for min_rate mode)"),
          }),
          z.null(),
        ])
        .optional()
        .describe("Auto-sell rule. Set to null to disable. Required for configure_auto_sell."),
      amount: z
        .number()
        .optional()
        .describe("Stock amount. Required for set_buffer_stock/set_max_stock."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ── worker_command ──

  mcp.tool(
    "worker_command",
    "Manage workers and work areas. Workers carry resources between buildings. Work areas define zones that workers can be assigned to. Worker cost: 75 money.",
    {
      command: z.enum([
        "buy_worker", "remove_worker", "configure_worker",
        "upsert_work_area", "delete_work_area", "assign_worker_work_area",
      ]).describe("Command type"),
      map_key: z
        .string()
        .optional()
        .describe("Map key (e.g. '0:0:1:0'). Required for buy_worker and upsert_work_area."),
      worker_id: z
        .string()
        .optional()
        .describe("Worker ID. Required for remove_worker/configure_worker/assign_worker_work_area."),
      task_filter: z
        .object({
          task_types: z.array(z.string()).optional().describe("Filter task types (e.g. ['pickup', 'dropoff', 'construct'])"),
          resources: z.array(z.string()).optional().describe("Filter resource types"),
          area: z.array(z.object({
            x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
            op: z.enum(["add", "sub"]),
          })).optional().describe("Area rectangles for spatial filtering"),
        })
        .nullable()
        .optional()
        .describe("Task filter config. Set to null to clear. For configure_worker."),
      id: z
        .string()
        .optional()
        .describe("Work area ID. Required for upsert_work_area/delete_work_area."),
      name: z
        .string()
        .optional()
        .describe("Work area name. Required for upsert_work_area."),
      rects: z
        .array(z.object({
          x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
          op: z.enum(["add", "sub"]),
        }))
        .optional()
        .describe("Work area rectangles. Required for upsert_work_area."),
      color: z
        .string()
        .optional()
        .describe("Work area color (hex). Required for upsert_work_area."),
      work_area_id: z
        .string()
        .nullable()
        .optional()
        .describe("Work area ID to assign. Set to null to unassign. For assign_worker_work_area."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ── research_command ──

  mcp.tool(
    "research_command",
    "Research technologies to unlock new buildings and upgrades. Use the mars2035://specs/research resource to see available research, costs, and prerequisites.",
    {
      research_id: z
        .string()
        .describe("Research ID to unlock (e.g. 'unlock_infra_tower', 'storage_buildings', 'foreign_affairs_1')"),
    },
    async (args, extra) => {
      return submitCmd(extra, "do_research", args as Record<string, unknown>);
    }
  );

  // ── quantum_command ──

  mcp.tool(
    "quantum_command",
    "Configure quantum relay rules for instant cross-sector material routing. Max 3 rules per relay. Requires logistics_quantum_routing research.",
    {
      command: z.enum(["configure_quantum_rule", "delete_quantum_rule"]).describe("Command type"),
      building_id: z
        .string()
        .describe("Source quantum relay building ID"),
      to_building_id: z
        .string()
        .describe("Destination quantum relay building ID"),
      materials: z
        .array(z.string())
        .optional()
        .describe("Material types to transport. Required for configure_quantum_rule."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ── diplomacy_command ──

  mcp.tool(
    "diplomacy_command",
    "Diplomacy and game management: send ambassadors, set auto-missions, expand to new maps, or forfeit/acknowledge bankruptcy.",
    {
      command: z.enum([
        "send_ambassador", "set_auto_mission",
        "initiate_expansion",
        "forfeit", "dismiss_tutorial", "acknowledge_bankrupt",
      ]).describe("Command type"),
      office_building_id: z
        .string()
        .optional()
        .describe("Embassy building ID. Required for send_ambassador/set_auto_mission."),
      target_building_id: z
        .string()
        .nullable()
        .optional()
        .describe("Target building to send ambassador to. Required for send_ambassador. For set_auto_mission, set to null to disable."),
      embassy_building_id: z
        .string()
        .optional()
        .describe("Embassy building ID. Required for initiate_expansion."),
      target_map_key: z
        .string()
        .optional()
        .describe("Target map key for expansion. Required for initiate_expansion."),
    },
    async (args, extra) => {
      const { command, ...data } = args;
      return submitCmd(extra, command as CommandType, data as Record<string, unknown>);
    }
  );

  // ══════════════════════════════════════════════════════
  // ── MCP Resources (static game specs) ──
  // ══════════════════════════════════════════════════════

  // ── Building Specs ──

  mcp.resource(
    "building_specs",
    "mars2035://specs/buildings",
    { description: "All 32 building definitions: costs, capacity, upkeep, recipes, build times" },
    async () => ({
      contents: [{
        uri: "mars2035://specs/buildings",
        mimeType: "application/json",
        text: JSON.stringify(
          Object.fromEntries(
            BUILDING_CLASSES.map((cls) => [cls, { class: cls, ...BUILDING_DEFS[cls] }])
          ),
          null, 2
        ),
      }],
    })
  );

  // ── Research Tree ──

  mcp.resource(
    "research_tree",
    "mars2035://specs/research",
    { description: "All 13 research options: costs, prerequisites, effects, unlocks" },
    async () => ({
      contents: [{
        uri: "mars2035://specs/research",
        mimeType: "application/json",
        text: JSON.stringify(RESEARCH_TREE, null, 2),
      }],
    })
  );

  // ── Materials & Processing Chains ──

  mcp.resource(
    "materials",
    "mars2035://specs/materials",
    { description: "All 34 material types organized by processing chain with production dependency graph" },
    async () => {
      // Build processing chain info from BUILDING_DEFS recipes
      const chains: Record<string, Array<{ building: string; inputs: Record<string, number>; output: string; output_amount: number }>> = {
        raw: RESOURCE_TYPES.map((r) => ({ building: "mine", inputs: {}, output: r, output_amount: 2 })),
        morphic: [],
        toroidin: [],
        cryogenic: [],
        psychophysical: [],
      };

      const chainMap: Record<string, string> = {
        smelter: "morphic", magnetic_press: "morphic", morphic_forge: "morphic",
        servo_assembly: "morphic", replication_chamber: "morphic",
        polymer_kiln: "toroidin", crystal_grower: "toroidin", toroidin_foundry: "toroidin",
        muphrid_lab: "toroidin", solar_loom: "toroidin",
        cryo_distillery: "cryogenic", phase_condenser: "cryogenic", xenotherm_reactor: "cryogenic",
        deep_freeze_synth: "cryogenic", iceworld_refinery: "cryogenic",
        resonance_tuner: "psychophysical", neural_loom: "psychophysical",
        psychophysical_amp: "psychophysical", dampening_forge: "psychophysical",
        consciousness_engine: "psychophysical",
      };

      for (const [cls, def] of Object.entries(BUILDING_DEFS)) {
        if (def.recipe && chainMap[cls]) {
          chains[chainMap[cls]].push({
            building: cls,
            inputs: def.recipe.inputs as Record<string, number>,
            output: def.recipe.output,
            output_amount: def.recipe.output_amount,
          });
        }
      }

      return {
        contents: [{
          uri: "mars2035://specs/materials",
          mimeType: "application/json",
          text: JSON.stringify({
            all_materials: MATERIAL_TYPES,
            raw_resources: RESOURCE_TYPES,
            processing_chains: chains,
          }, null, 2),
        }],
      };
    }
  );

  // ── Market Config ──

  mcp.resource(
    "market_config",
    "mars2035://specs/market",
    { description: "Base market prices, import multiplier, volatility, supply pressure" },
    async () => ({
      contents: [{
        uri: "mars2035://specs/market",
        mimeType: "application/json",
        text: JSON.stringify({
          base_prices: BASE_MARKET_PRICES,
          import_multiplier: IMPORT_PRICE_MULTIPLIER,
          volatility: MARKET_VOLATILITY,
          price_range: { min: MARKET_PRICE_MIN, max: MARKET_PRICE_MAX },
          supply_pressure: { factor: SUPPLY_PRESSURE_FACTOR, decay: SUPPLY_PRESSURE_DECAY },
        }, null, 2),
      }],
    })
  );

  // ── Game Rules ──

  mcp.resource(
    "game_rules",
    "mars2035://specs/rules",
    { description: "Territory, tax, worker, ambassador, and expansion rules" },
    async () => ({
      contents: [{
        uri: "mars2035://specs/rules",
        mimeType: "application/json",
        text: JSON.stringify({
          territory: {
            buildings: TERRITORY_BUILDINGS,
            radius: TERRITORY_RADIUS,
            tax_per_building: TAX_PER_BUILDING,
          },
          workers: {
            capacity: WORKER_CAPACITY,
            money_capacity: WORKER_MONEY_CAPACITY,
            upkeep_per_tick: WORKER_UPKEEP,
            cost: WORKER_COST,
            starting_workers: STARTING_WORKERS,
          },
          ambassadors: {
            cooldown_ticks: AMBASSADOR_COOLDOWN_TICKS,
            max_percent_by_tier: AMBASSADOR_MAX_PERCENT_BY_TIER,
          },
          map: {
            tiles_per_map: TILES_PER_MAP,
            resource_density: RESOURCE_DENSITY,
            expansion_cost: MAP_EXPANSION_COST,
            starting_money: STARTING_MONEY,
            new_player_protection_ticks: NEW_PLAYER_PROTECTION_TICKS,
          },
          tier3_resources: TIER3_RESOURCES,
        }, null, 2),
      }],
    })
  );

  return mcp;
}

// ── HTTP Server ──

const app = express();
app.set("trust proxy", 1);

// OAuth routes (registration, authorize, token, metadata) — must be at root
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(BASE_URL),
  })
);

// Login form callback (handles the POST from our authorize page)
app.post(
  "/login/callback",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    await handleAuthorizeCallback(req.body, res);
  }
);

// MCP endpoint — protected by bearer auth
const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

app.all("/mcp", express.json(), bearerAuth, async (req, res) => {
  const mcp = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

import { initTokenStore } from "./db.js";

initTokenStore()
  .then(() => {
    app.listen(MCP_PORT, "0.0.0.0", () => {
      console.log(`Mars 2035 MCP server listening on ${BASE_URL}/mcp`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize token store:", err);
    process.exit(1);
  });
