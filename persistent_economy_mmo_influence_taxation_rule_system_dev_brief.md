# Persistent Economy MMO — Minimal Spec (v0)

## 1) World Scale / Coordinates
**Hierarchy:** Tile → Map → District → World
- **Map:** 300×300 tiles (= 90,000).
- **District:** 5×5 maps (= 1,500×1,500 tiles = 2,250,000).
- **World:** 2×2 districts (= 3,000×3,000 tiles = 9,000,000).

**IDs / coords**
- `district_id = (dx, dy)` within world (0..1).
- `map_id = (mx, my)` within district (0..4).
- `tile_id = (x, y)` within map (0..299).
- `world_tile = (dx*1500 + mx*300 + x, dy*1500 + my*300 + y)`.

---

## 2) Entities
### 2.1 Entity types
- **Player**
- **Building**

### 2.2 Common fields
- `entity_id`
- `status` (string enum)
- `assets` (materials + money; where applicable)

---

## 3) State Model (Snapshots + Delta Events)
### 3.1 Representation
- Authoritative state = **latest snapshot** + **ordered delta events**.
- Events are append-only with a monotonically increasing `seq` per world.

### 3.2 Event envelope (minimum)
- `world_id, seq, tick, ts, type, data`

### 3.3 Visibility
- **No privacy on a map:** all events affecting a map are visible to any watcher subscribed to that map.

---

## 4) Player “Admin Outpost” Assets (per map)
### 4.1 Rule
- Each player can have **max 1 Admin Outpost per map**.
- Upgrade path later (e.g., Honorary Consulate → General Consulate → Embassy) = same concept, higher caps.

### 4.2 Storage decision
- The Admin Outpost exists as a building entity, but its **available money/materials are stored on the Player record** for fast access.

### 4.3 Player record fields (per map)
- `player.map_accounts[map_key]` where `map_key=(district_id,map_id)`:
  - `assets: { money, steel, ... }`  (spendable / “available”)
  - `admin_outpost_building_id`

---

## 5) Tick Model
- Minimum tick interval: **60 seconds**.
- Tick order (v0):
  1) apply queued player commands
  2) run production
  3) charge upkeep
  4) apply district taxes
  5) emit events, commit tick

---

## 6) Production Economy
### 6.1 Materials (base set)
- `money` (credits)
- `steel`
- + placeholder base raws: `silicon`, `polymer`, `rare_earth`, `carbon`

### 6.2 Resource tiles
- Some tiles contain a raw resource type.
- Resource tile data (v0): `{type, richness}`.

### 6.3 Buildings (v0)
All buildings:
- `owner_id`
- `location (district_id, map_id, tile_id)`
- `upkeep_per_tick (money)`
- `inventory {material -> amount}` (building-local stash)

**Mine**
- Placement: must be on matching resource tile.
- Per tick: produce into **mine.inventory**.

**Port**
- Export materials; triggers export tax.

### 6.4 Availability rule
- Materials in **building inventories are not spendable**.
- Materials become spendable only when moved into **player.map_accounts[map_key].assets** (Admin Outpost account).

### 6.5 Transfer rule (v0)
- Transfers move materials between:
  - `building.inventory ↔ player.map_account.assets`
  - `building.inventory ↔ building.inventory` (optional)
- Transfer timing can be instant for v0.

### 6.6 Upkeep rule
- Each tick, upkeep for all player buildings on a map is charged to `player.map_account.assets.money`.
- If insufficient funds: building `status` becomes `suspended` (no production) until funded.

---

## 7) Fiscal Economy (District Taxation)
### 7.1 District ownership via influence
- Each **district** has `owner_id` or `contested=true`.
- Ownership determined by influence buildings in that district.

**Influence building types (fixed values)**
- `Core HQ` (high)
- `Admin Hub` (medium)
- `Relay` (low)

**Influence total**
- `Influence(player, district) = Σ influence_value` (within district)

**Owner vs contested**
- Let `Top` and `RunnerUp` be influence totals.
- If `Top - RunnerUp < CONTEST_DELTA` → **contested**.
- If contested: **all district tax rates = 0**.

### 7.2 Tax bases (only when not contested)
Taxes are levied on:
1) **Buildings** (per tick)
2) **Materials held in buildings** (per tick; building inventories only)
3) **Materials exported via ports** (event-based)

### 7.3 Tax application (definitions)
**(A) Building tax (per tick)**
- `due = building_tax_rate[building_class]` per building.

**(B) Inventory tax (per tick)**
- `due = Σ(amount(material in building.inventory) * inv_tax_rate[material])`.

**(C) Export tax (on export event)**
- `due = Σ(exported_amount(material) * export_tax_rate[material])`.

### 7.4 Collection
- Taxes are deducted from the owning player’s `player.map_account.assets.money` for the map where the taxed activity occurs.
- Collected taxes credit to the **district owner** (destination account rule TBD; v0 can credit to owner’s account on the same map).

---

## 8) Required Components (v0)
- Entity store (players, buildings)
- World event log (append-only) + periodic snapshots
- Tick runner (60s)
- Map subscription stream (no privacy)
- Resource generator (seeded) + resource tile lookup
- Production/upkeep/tax calculators
- Transfer operations between building inventories and player map accounts

