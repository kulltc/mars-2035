import type {
  BuildingClass,
  Location,
  MaterialType,
} from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";
import { placeBuilding } from "../../systems/building.js";
import { transferToPlayer, transferToBuilding } from "../../systems/transfer.js";

export function processCommands(store: WorldStore) {
  const commands = store.commandQueue.splice(0);

  for (const cmd of commands) {
    const player = store.players.get(cmd.player_id);
    if (!player) continue;

    switch (cmd.type) {
      case "place_building": {
        const { building_class, location } = cmd.data as {
          building_class: BuildingClass;
          location: Location;
        };
        const result = placeBuilding(store, player, building_class, location);
        if (result.ok) {
          store.pushEvent(
            "building_placed",
            {
              building_id: result.building.entity_id,
              building_class,
              owner_id: player.entity_id,
              location,
            },
            result.building.map_key
          );
        }
        break;
      }

      case "transfer_to_player": {
        const { building_id, material, amount } = cmd.data as {
          building_id: string;
          material: MaterialType;
          amount: number;
        };
        const building = store.buildings.get(building_id);
        if (!building) break;
        const result = transferToPlayer(player, building, material, amount);
        if (result.ok) {
          store.pushEvent(
            "transfer",
            {
              direction: "to_player",
              building_id,
              material,
              amount,
              player_id: player.entity_id,
            },
            building.map_key
          );
        }
        break;
      }

      case "transfer_to_building": {
        const { building_id, material, amount } = cmd.data as {
          building_id: string;
          material: MaterialType;
          amount: number;
        };
        const building = store.buildings.get(building_id);
        if (!building) break;
        const result = transferToBuilding(player, building, material, amount);
        if (result.ok) {
          store.pushEvent(
            "transfer",
            {
              direction: "to_building",
              building_id,
              material,
              amount,
              player_id: player.entity_id,
            },
            building.map_key
          );
        }
        break;
      }

      case "export": {
        const { building_id, material, amount } = cmd.data as {
          building_id: string;
          material: MaterialType;
          amount: number;
        };
        const building = store.buildings.get(building_id);
        if (!building || building.class !== "port") break;
        if (building.owner_id !== player.entity_id) break;

        const available = building.inventory[material] ?? 0;
        if (available < amount) break;

        // Remove from building inventory
        building.inventory[material] = available - amount;

        // Convert to money (1:1 for v0)
        const account = player.map_accounts[building.map_key];
        if (!account) break;
        account.assets.money = (account.assets.money ?? 0) + amount;

        // Export tax handled in phase 04
        store.pushEvent(
          "export",
          {
            building_id,
            material,
            amount,
            player_id: player.entity_id,
          },
          building.map_key
        );
        break;
      }
    }
  }
}
