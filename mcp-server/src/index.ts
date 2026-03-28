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

  return mcp;
}

// ── HTTP Server ──

const app = express();

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

app.listen(MCP_PORT, "0.0.0.0", () => {
  console.log(
    `Mars 2035 MCP server listening on ${BASE_URL}/mcp`
  );
});
