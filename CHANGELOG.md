# Changelog

All notable changes to Terminus are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning convention: since the game is pre-1.0, the **minor** number is the
feature release (`0.1`, `0.2`, …) and the **patch** number is the fix/hotfix
release. Breaking save-schema or balance overhauls bump the minor even when
they are small, because they invalidate existing save files.

Releasing:

1. Add your change under `[Unreleased]`, under the right category.
2. Decide the new version: `0.<minor>.<patch>`.
3. Bump it with `npm run version:patch` / `npm run version:minor`;
   `package.json` (and the in-game menu, which reads it) update together.
4. Move the `[Unreleased]` entries into a dated `## [x.y.z] – YYYY-MM-DD`
   section at the top of this file before tagging the release.

---

## [Unreleased]
### Added
- The Arms Factory and Protective Gear Factory now have **real, selectable
  production lines** that end in actual equipment, instead of research tree
  unlocks pointing at factories that could not manufacture the items (P0). The
  Arms Factory runs six lines — Ammunition Crates (Metal → Ammo, the stockpile
  line) plus five firearm lines (Pistol, Shotgun, Assault Rifle, Sniper Rifle,
  Heavy Machine Gun), each gated by its own research node and each with a
  distinct material cost. The Protective Gear Factory runs three armor lines
  (Protector Vest, Riot Gear, Plate Armor → the padded jacket / riot vest /
  tactical gear items). A gear line consumes its materials continuously while
  the crew works and, per full unit of progress, pushes **one real item into
  the colony armory** for squad/tower assignment (`craftProgress` per building
  per line, so switching recipes preserves partial work). Locked lines never
  run in the sim and render disabled with their required research in the
  production-recipe picker. This also fixes the Protective Gear Factory being a
  silent 5-Metal/day sink (it previously declared inputs with no production).
- The weapon catalog gains the endgame firearms the research tree already
  unlocks: **Sniper Rifle** (long-range precision) and **Heavy Machine Gun**
  (high-volume defensive firepower), both valid armory items for squads and
  tower mounting.
- Stranded field loot is now a real recoverable mechanic. When a resource
  gathering crew or demolition team brings a load home and the stockpile
  ceiling blocks part of it, the refused surplus is stranded **in the world at
  the worksite** (the resource node / demolition site) as a visible crate
  marker instead of being held forever at the depot. Select a squad and
  right-click the crate: the squad paths there, collects what fits into its
  backpack (one stack per member slot, like scavenged loot), and the remaining
  pile stays on the ground — deposit it at any Storage Depot / HQ through the
  normal unload flow. Gatherers and demolition crews are no longer stuck
  idle-carrying at a full depot; `overflowLootUnits` keeps counting the
  stranded units for the header warning. Vehicle Workshop dismantles behave
  the same: scrap that cannot fit storage is left as a recoverable pile at the
  workshop bay instead of merely incrementing the counter.
- A squad that falls in the field (all members dead) now strands its whole
  leftover backpack as a recoverable field-loot pile **at the death site**,
  then clears the squad's inventory so nothing is stranded twice. Anything the
  squad deposited at a depot before dying is already safe; only what it was
  still carrying is left on the ground. Piles can carry arbitrary stacks
  (food, water, fuel, ammo, meds, tools, weapons, armor) alongside wood/metal/
  bricks — a second squad right-clicks the crate and recovers the supplies
  through the normal backpack + depot-unload flow, so gear is never lost with
  the squad.

### Changed
- **Expedition Center re-roled as the strategic logistics HQ (audit #40, P0/P1).**
  It is no longer a scavenging-speed buff: the +30%/+30% powered search-speed
  multiplier is gone from the scavenging sim, and the building is now the
  gateway to long-range inter-colony operations. Each operational Expedition
  Center at the origin colony grants caravan coordination bonuses — **+12%
  convoy speed and −10% fuel per 100 km** (capped at three) — and dispatching a
  caravan on a **long-range route (≥150 km) now requires an operational
  Expedition Center** at the origin, surfacing a logistics error otherwise.
  The Caravan modal's telemetry card shows the expedition status (HQ active /
  required / local route), and the building copy, functions, and capacity
  labels now read as the logistics HQ (Expedition Logistics, Caravan
  Coordination, Long-Range Route Planning) instead of recon/scavenge buffs.
- **Repairmen Shop now obeys the player (audit #38).** The automated repair
  crews are no longer locked to the internal importance hierarchy — the
  Repairmen Shop's inspector exposes four **Automated Repair Bands**
  (Emergency = HQ/gates/towers/generators/hospital, High = warehouse/water/
  research, Normal = production, Low = housing). Disabling a band leaves those
  buildings unrepaired and conserves materials; crews still prioritise the
  most damaged structure within enabled bands. The config is settlement-wide,
  saved/loaded explicitly, and legacy saves without it behave exactly as
  before (all bands enabled).
- **Squad Quarters squad slots scale with barracks size (audit #2).** A fully
  converted Squad Quarters previously added a flat +1 squad regardless of
  size. It now uses the same footprint formula as the HQ — roughly one
  deployable squad per 64 m² of barracks (√area/8 × the type bonus) — so a
  small annex keeps the classic +1 while a large converted hall quarters
  several squads. Partial conversions still grant nothing.
- **Economy-fidelity corrections from the building audit (P1).** The **Bar** now
  matches IFZ: no research requirement (previously gated behind Fermentation)
  and the efficient 1 Grain → 8 Beer recipe (previously 4 → 4). The
  **Chemical Plant** exposes all four IFZ reference lines with the reference
  ratios — 2 Wood → 1 Fertilizer, 1 Fuel → 3 Fertilizer, 6 Wood → 1 Fuel, and
  3 Fertilizer → 1 Fuel — replacing the invented ratios and adding the missing
  fertilizer→fuel direction (selectable lines like the Cookhouse). The
  **Gathering Place** law-forum threshold follows current IFZ and drops from
  200 to **100 citizens**. An operational **House** now delivers the +15% mood
  boost its description advertises: the morale engine adds a Quality Family
  Housing factor scaled by the share of the population that can actually sleep
  in upgraded Houses (from +3 up to the full +15), so a token single House is
  no longer pure decoration. (Research Center's 1-Scientific-Material
  construction cost remains a separate pending item.)
- **Defences & towers now match their §IFZ roles (P1 audit).** Passive barriers
  are no longer staffed firing posts: `barbed_wire`, `wooden_palisade`,
  `metal_fence`, `brick_wall`, `fortified_wall`, and `floodlight_tower` are
  now `guardable: false`, so workers can no longer be assigned to stand on a
  palisade run — and the combat sim's defensive-fire loop only ever engages
  mannable structures (towers via `weaponMountable`, gates via
  `allowsFriendlyPassage` + guardable). Previously every wall/fence/wire that
  had a worker assigned silently fired 20-damage "gate shots" at 35m, and
  guard-labour demand treated the whole perimeter as firing posts
  (`getBuildingJobForType` now consults the guardable flag instead of the
  category, and the explicit job map no longer routes floodlight towers to
  guard). Guard labour now concentrates where it belongs: towers and gates.
  Defensive combat also **honours each tower's declared `attackRangeM`**
  (120 m wooden / 160 m metal / 200 m fortified) instead of the hardcoded
  50–65 m that applied to every tower regardless of type; gates keep their
  35 m built-in shot. The Fortified Gatehouse's `sentryCapacity` is corrected
  to the IFZ six-worker garrison, and the Floodlight Tower — powered
  illumination, not a garrison or a weapon platform — is now freestanding-only
  (`adaptationAllowed: false`, matching the Cistern/Generator infra
  philosophy).
- The 14 legacy alias buildings (`shelter_bunkhouse`, `storage_depot`,
  `greenhouse_hydro`, `food_pantry`, `workshop_forge`, `timber_mill`,
  `scrap_smelter`, `guard_watchtower`, `barricade_gatehouse`, `armory_cache`,
  `infirmary_clinic`, `community_hall`, `comms_relay`, `research_lab`) are now
  a single shared registry (`LEGACY_ALIAS_BUILDING_TYPE_IDS` in
  `functionalBuildings.ts`) consumed by every picker instead of a private list
  inside one component. They stay fully functional for save compatibility but
  are hidden everywhere a player chooses a facility, so each building appears
  exactly once under its IFZ name: the Buildings panel, the freestanding
  construction modal (category tiles, locked count, and category-switch
  default now start at the canonical Shelter instead of the alias), the
  sidebar freestanding catalog, the research-tree unlock map, and the
  structure-inspector adaptation list. That inspector list is no longer a
  stale hard-coded alias roster — it is the data-driven canonical adaptation
  roster (every `adaptationAllowed` facility, sorted by category), with
  research-locked blueprints shown dimmed with their required research instead
  of erroring on click. Purpose-built infrastructure (`water_cistern`,
  `generator_station`, `battery_bank`, `floodlight_tower`) is explicitly not
  aliased. Regression tests pin the registry to the defs themselves: any new
  body-aliased definition must be registered or the suite fails.

### Fixed
- Inactive settlements no longer live in permanent daytime (P0). The offline
  catch-up previously ran every step with a frozen `hour: 12, isNight: false`
  clock, so a colony simulated for days experienced perpetual noon — never
  night production shutdown, worker return, or day/night-dependent
  agriculture/research. `simulateSettlementOffline` now back-dates the colony's
  clock from the live universal clock (the moment it was last simulated) and
  rolls day/hour/minute/phase/isNight forward every step with the same
  `advanceGameClock` the active loop uses; each step feeds the real night flag
  into the economy/gathering/research stages, so a colony that is offline
  through the night genuinely pauses construction, production, medbay output,
  and research while its workers shelter.

### Fixed
- Barbed wire is now a proper §7.1 hazard instead of a hard wall (P0). It no
  longer sits in the wall obstacle set with `blocksMovement: true`: the
  pathfinder rasterizes it as fully passable terrain while exposing a hazard
  channel (`slowsInfectedPct: 60`, `damageOnContact: 15` on the def). Infected
  path straight through wire — slowed to 40% speed and bleeding ~15 HP/sec
  while in contact (with floating WIRE damage numbers and death FX) — while
  friendlies pass freely and palisades/brick walls still block hostiles
  outright. Vehicle routing still treats wire as impassable.

### Fixed
- Deconstruction no longer corrupts settlement statistics (P0). The demolition
  completion path in `populationService` carried its own secondary stat
  calculation that only recognised `storage_depot` / `shelter_bunkhouse` /
  `squad_quarters` — demolishing any unrelated building could silently wipe
  the storage of Warehouses, the living capacity of Shelters/Houses, extra HQ
  vaults, and more. It now calls the single authoritative
  `recalculateSettlementStats()` that every construction/adaptation path uses,
  and that central calculation additionally counts defensive value only for
  operational structures (§7.1) — a breached or under-construction building
  no longer contributes its defense rating.

### Fixed
- Scavenging squads no longer trek home to a full depot and strand their haul
  (IFZ storage gate). A squad now checks whether the settlement stockpile can
  actually accept its loot BEFORE returning: if storage is full it simply does
  not return — it holds the haul in its backpack out in the field
  (`holdHaul`), gets one STORAGE FULL — SQUAD HOLDS HAUL warning, and
  auto-returns to deposit the moment storage frees (no manual order needed).
  Vehicle expeditions with a full cargo bay get the same gate before driving
  home, and any fresh player order overrides the hold.

### Fixed
- Defensive structures are no longer classified by type-id string matching
  (§7.1). Wooden palisades and bastion walls were being treated like gates in
  the combat/perimeter layer (`type.includes('palisade' || 'bastion')`); every
  defensive building now carries explicit `blocksMovement`,
  `allowsFriendlyPassage`, `guardable`, and `weaponMountable` flags that the
  sim and the alarm readouts consume directly. Alias defs that reuse another
  type's body (`guard_watchtower` → `wooden_tower`, `barricade_gatehouse` →
  `wooden_gate`) resolve through a canonical-definition lookup so no subsystem
  falls back to name inference.

### Added
- The Vehicle Workshop is now a real mechanic, not a definition (§8): vehicles
  parked inside a staffed workshop can be queued for time-based REPAIR
  (mechanics restore HP over mechanic-hours, consuming metal per HP healed —
  the old instant pay-metal → full-HP button is deleted), DISMANTLED for
  scrap metal, and new models FABRICATED from metal. Orders persist in the
  save, the workshop's Vehicle Bays cap concurrency, its assigned workers are
  split across active orders each day shift, and an unstaffed workshop idles
  its whole queue. The Motor Pool modal lists every order with progress and
  cancellation, offers fabrication by model, and shows each vehicle's bay
  status.
- Medical treatment is now a real beds + nurses + patient-queue model (§5.3)
  instead of the old instant +6 HP/s regeneration anywhere near the HQ or a
  Medbay footprint. Wounded survivors heal ONLY inside an operational,
  staffed medical facility (Medbay / Hospital / Infirmary): beds cap
  admissions, each assigned nurse attends one admitted patient at +0.1 HP
  per in-game hour, and surplus wounded queue without healing — an unstaffed
  or bed-less colony simply cannot treat its injured. The squad panel's
  HEALING indicator now lights up only while a squad is genuinely under
  treatment, and the building inspector shows beds, assigned nurses, and
  wounded present in the facility.
- Research is now funded by Scientific Materials instead of a free "Research
  Points" trickle (§10): staffed Research Centers/Labs produce Scientific
  Materials into the stockpile, projects consume their material cost on
  completion, and research advances only through research-worker-seconds —
  zero scientists means zero progress (no hidden `0.02/s` baseline or
  implicit 1-worker floor). Legacy saves fold any unspent points into the
  stockpile bucket.
- Freestanding construction enforces the Advanced Masonry gate (§7.1):
  adaptation-type facilities (shelters, workshops, …) can only be erected
  freestanding once `advanced_masonry` is researched — genuinely freestanding
  IFZ structures (walls, gates, towers) are exempt.
- Production recipes are player-selectable (§7.2): multi-recipe facilities
  (Cookhouse, Chemical Plant) persist a `selectedRecipeId` and the crew runs
  ONLY the chosen recipe — short inputs idle the building rather than
  silently swapping to the first affordable recipe. The building inspector
  shows each recipe with its input/output flows and an ACTIVE marker.
- Fertilizer is no longer a permanent aura: a single unit previously granted
  ×1.75 yield to every agriculture plot forever. Fertilization is now a
  per-plot choice (toggle in the building inspector) that consumes 0.5
  Fertilizer from the stockpile each crop cycle for the ×1.75 yield — one
  Barn's daily 1 Fertilizer feeds two standard plots, and a short stock runs
  the cycle unfertilized with nothing consumed.
- Partial adaptation (§7.1) is now real: facility conversions can cover a
  share of the source structure instead of always taking the whole building at
  once — drag across the building's own footprint to paint the exact physical
  portion (see the Changed entry for the paint interaction). Capacity, defense,
  worker slots and adapted area scale proportionally with converted share
  (`fullCapacity` is retained as the 100% ceiling), partial conversions charge
  construction cost only for the incremental share, and completed partial
  facilities show their coverage bar in the inspector with an EXPAND
  ADAPTATION TO 100% action that re-queues the crew for the remaining area.
  Partially-adapted shells also render with a blended blue-to-green tint so
  the unfinished state reads on the map.
- Settlement lifecycle (§7.5): established colonies now have real structural
  integrity on their command center and can actually be LOST — when the HQ is
  besieged to 0 durability or every last survivor falls, the colony record
  transitions to `destroyed` (overrun day + reason recorded) and the Colony
  Overrun modal appears. Loss is a campaign setback, not a game over.
- Local reclamation: a fallen colony still holding survivors can be reclaimed
  in place — “Secure Sector & Re-establish HQ” drops you into HQ re-selection
  on the ruins, and confirming a new command post restores the colony to
  operational status (relief-caravan reclamation continues to work too).
- Night zombies now besiege the command center itself (nearest adapted
  building OR the HQ), with a red COMMAND CENTER BREACHED alert on the breach.
- HQ representation unified: `headquarters[]` + `primaryHQId` is now the
  single authoritative HQ model (the old parallel `hq` field is gone). The
  primary command HQ is the entry matching `primaryHQId`, establishing a new
  HQ promotes it to primary, and re-establishing after a breach no longer
  leaves the destroyed HQ in charge. Saves from the single-HQ era are
  migrated on load.
- A breached command center no longer contributes anything: destroyed-HQ
  storage vault, shelter beds, defense rating and squad capacity all drop to
  zero (baseline 250 storage) until a new HQ is established — the HQ inspector
  shows a red COMMAND CENTER BREACHED state with its HP bar.
- Storage capacity is now enforced across every resource stream, not just
  scavenged loot: gathering crews, deconstruction crews and caravan arrivals
  deposit through a shared finite-storage helper — what doesn't fit is held by
  the crew (deposited automatically once space frees) or reported as overflow
  with the header warning, never pushed past the stockpile ceiling.
- The overflow counter was renamed `fieldLootUnits` → `overflowLootUnits`
  because the goods are physically carried (squad backpack / vehicle bay /
  crew load), not lying at scavenge sites — the header tooltip now says so.
  Old saves are migrated on load.
- Production no longer burns inputs for un-storable output: a building checks
  that its full scaled output fits BEFORE consuming recipe inputs and idles
  instead of running a truncated (sink) cycle; the medbay does the same for
  first-aid kits.
- Extinction math hardened: survivors holding out in destroyed colonies count
  toward the global tally, so 100% destroyed colonies with people alive is a
  recovery situation, and total extinction only fires when zero survivors
  remain anywhere (closes the last-settlement soft-lock).
- Semantic versioning: `package.json` now carries `0.1.0` and the in-game
  main-menu version readout is injected from it at build time, so the menu
  always matches the shipped build instead of a stale hardcoded string.
- Standard `npm run version:patch|minor|major` bump scripts.
- Tools are now a first-class building material: required in the stockpile
  type, seeded with 20 on new games (50/50/50 wood/metal/bricks), shown in the
  resource header, stockpile bar and debug modal, and scavengeable from the
  loot pool (warehouses, industry, schools, generic buildings). Construction
  costs that require tools can now actually be paid.
- The primary HQ can no longer be scavenged for loot, adapted into another
  facility, or appear in scavenge queues/loot pins; a building only becomes
  adaptable once its search is complete **and** fully cleared of leftover loot.
- Freestanding build placements now correctly check and display the full cost
  (including tools); legacy saves missing a `tools` key are normalized on load.### Changed
- Freestanding facilities now have their own PREDEFINED module footprints
  instead of a generic 8×8 box (§IFZ): adaptations take their size from the
  existing building, but every freestanding type places a fixed, purpose-built
  rectangle. `getFreestandingDimensions` now resolves ~50 facility types
  through a per-type module table (warehouse 16×22 m, hospital 14×20 m, cannery
  14×18 m, research centre 10×14 m, antenna 4×4 m, …), which drives the
  placement ghost, collision polygon, rendered shell, and the size-derived
  capacity/durability of the build — walls/gates/towers keep their
  drag-built line rules and fields/greenhouses their plot sizes. The 8×8
  fallback now guards unknown ids only (a regression test fails if any
  construction-capable facility ever falls back to it), and the freestanding
  build modal labels the selected blueprint with its real module dimensions
  (`Module 16×22 m · 352 m²`) instead of "Standard 8x8m Module".
- Adaptation economics are now size-based (§Terminus): a conversion's base
  material cost scales with the REAL structure's shell volume (footprint ×
  height) instead of a per-type flat fee. The per-type `adaptationCost` figures
  are reference prices for an ~800 m³ shell (`ADAPT_REFERENCE_VOLUME_M3`);
  `getAdaptedCost` multiplies them by volume ÷ 800 before the conversion share
  is applied, so a tiny house costs a fraction of the old price and a
  five-storey warehouse costs proportionally much more — matching what it
  yields in capacity/durability. The purpose-fit OSM-type 25% discount still
  applies but now cuts a size-derived price rather than masking a flat one,
  tools scale with volume too (1-tool floor on tool-bearing types, zero stays
  zero), and split-section/partial+expansion charges remain additive against
  the same size-based full cost. The Buildings menu shows adaptation rates per
  1,000 m³ with a tooltip, the building inspector's full-conversion list shows
  the exact price for the selected structure, and the paint preview readout
  reports the estimated W/M/B of the swept share next to its % coverage.
- Partial adaptation now uses true footprint painting instead of an arbitrary
  world-space drag rectangle (§7.1). While a conversion type is armed, pressing
  on a building and dragging ACROSS ITS OWN FOOTPRINT sweeps a band measured
  in the building's local axes (longest axis or cross-section, chosen by the
  drag direction and latched per gesture): the selection is the swept portion
  clipped to the real building silhouette, so dragging past the walls can
  never exceed the structure, and the live preview floats a translucent
  in-footprint fill + crisp outline on the roof with a % coverage readout by
  the cursor. The old ground-level map rectangle is gone. A plain click still
  converts the whole building (full adaptation never requires dragging), a
  full-length sweep reads as 100%, and sub-4% slivers are rejected with
  "SELECTION TOO SMALL" feedback; a release outside the scene aborts cleanly.
  Geometry comes from new `footprintAxes` / `clipPolygonHalfPlane` /
  `clipPolygonToStrip` / `sweepFootprintSelection` helpers in
  adaptationGeometry.
- The Water Cistern and Generator Station are now purpose-built freestanding
  facilities (§Terminus): `adaptationAllowed` is false on both, so existing
  buildings can no longer be converted into them — the player places them on
  open ground. Because the generic Advanced Masonry gate only applies to
  adaptation-eligible types, Basic Sanitation / Electrical Engineering alone
  unlock each build (no masonry research detour), and `adaptBuilding` now
  rejects any `adaptationAllowed: false` type outright.
- Generator stations are now demand-driven (§Terminus): a generator runs
  (burning fuel and drawing from the stockpile reserve) only while at least
  one operational powered facility sits inside its radius — no load, no burn,
  and the buffer is conserved untouched while idling. The unit auto-starts
  when a consumer appears (GENERATOR ONLINE) and stands down when the last
  one leaves (GENERATOR STANDBY); the drawer distinguishes STANDBY from
  OUT OF FUEL.
- Battery Banks are now presented as the grid's GRID EXTENSION / EMERGENCY
  RESERVE rather than a second generator: the map overlay draws a charged
  bank's reach as a soft footprint with a dashed cyan boundary (bright,
  near-solid arcs only while it is actually feeding), and the drawer, POWER
  GRID card, building definition and research node all use RESERVE ARMED /
  RESERVE FEEDING / RESERVE EMPTY language that says a bank backs critical
  facilities inside its own reach when generators can't cover them.
- The water economy is now single-authority in waterService (fixes a
  duplicated-ledger problem like the old settlement-stats one): the morale
  tick no longer keeps a private water ledger — it consumes through
  waterService's settlement-wide demand (population + medical + industrial
  draw, `calculateWaterDemand` × elapsed fraction) and its store-then-cistern
  `consumeSettlementWater` pass, which also owns shortage-day accounting. The
  legacy inline rain-harvest bonus inside morale (a flat free-water source
  that double-counted cistern roof catchment) is deleted — collection happens
  only in `tickWaterEconomy`. Permaculture's +20 L/day water now writes
  through the new `addWaterToStockpile`, and morale's water stats
  (daily consumption / potable reserve) read waterService helpers instead of
  recomputing them.
- Offline settlement catch-up is verified to consume water with the SAME
  facility-inclusive demand model as live play: both offline branches (with a
  cached map → full pipeline, and without → `runEconomySimulationTick`) run
  the identical `runEconomyStages` chain whose morale stage consumes through
  waterService's `consumeSettlementWater(calculateWaterDemand × fraction)` —
  there is no separate offline water ledger to drift. Regression tests prove a
  long-away colony with an 8-bed medbay drains exactly the inclusive draw
  (half-day 30 L → 19.5 consumed), runs fully dry at day scale and returns to
  its player with `shortageDays > 0` plus the Dehydration Crisis factor (a
  pop-only model would have left 10 L and a false-calm colony), and that a
  facility-free colony consumes exactly its population share.
- Water shortage is now signalled by the ACTUAL unmet draw
  (waterService.consumeSettlementWater's `waterState.shortageDays` > 0) rather
  than inferred purely from the days-remaining forecast: an exhausted
  store+cistern reserve fires the critical Dehydration Crisis morale factor and
  halts passive growth with a named "Water shortage" reason the moment the
  colony goes without water (days-of-water remaining now only colours the
  rationing/security forecast ahead of a crisis). The header shows a pulsing
  red water-shortage warning ribbon, turns the morale dropdown's water chip
  into a red SHORTAGE readout, and tints the Water & Fuel indicator red.
- Lair generation is data-driven instead of a global 1–2 coin flip (§5.2):
  the nest count now scales with the map's fetch area (~1 nest per 3 km² at
  normal intensity on day 1, up to a 12-lair cap), the scenario's infected
  intensity (`zombieAggression` low/normal/high × `hordesLevel`), colony
  population, and the in-game day (outbreak maturity) — so a large
  high-pressure late-game map gets a real regional ecosystem of nests instead
  of one or two pins. Nests are greedily spaced at least 350 m apart (then
  topped up if the map is too cramped), and each chosen nest still seeds its
  garrison as REAL affiliated infected. `generateZombieLairs` takes an
  optional `LairGenerationContext` (`computeLairTargetCount` is exported for
  tuning/tests); the world-seeding hook feeds it `MapData.radius`, colony
  population, the game clock's day and `settlement.scenarioSettings`. No
  context keeps the old compact-map behaviour (1–2 nests).
- Lair garrison size is no longer an ambiguous "max": `ZombieLair.maxPopulation`
  is renamed `baselinePopulation` — the founding garrison is a SOFT baseline,
  not a ceiling. A partially cleared nest regrows toward it, and a NEGLECTED
  nest now deliberately SWELLS beyond it as its escalation climbs: emergence is
  capped at baseline × (1 + 0.4 × escalation) per lair (absolute 220 cap for
  sim sanity), so a baseline-40 lair that is left alone grows 40 → 56 → 72 →
  88 → … into a genuine 100+ hive while escalation 0 keeps it at founding
  strength. The sidebar reads the baseline with a SWOLLEN NEST marker when the
  garrison outgrows it, the map badge fills against the baseline, and saves
  migrate `maxPopulation`/`initialOccupantCount`/`occupantCount` into
  `baselinePopulation` on load.
- Construction is now queue-ordered: only the earliest-queued structures
  (an active window of 3) draw builders and materials each tick, and when the
  stockpile is scarce every unit flows to the queue front first. Placing
  several gates/towers/walls at once no longer freezes all of them at partial
  progress — structures complete one at a time.
- Queued construction sites can be promoted/demoted from the building
  inspector (▲/▼ queue controls), so the player decides which structure
  finishes first.
- Starting stockpile normalized to be difficulty-independent: food/water scale
  with starting population (5 food-days / 7 water-days), plus 4 pistols,
  150 ammo, 50 fuel, 50 of each building material and 20 tools.
- The header's storage readout (`STO n/capacity`) was replaced by an
  iconographic marker: a grey crate by default, and a pulsing red warning
  triangle only when storage is actually full; hover shows the stored-vs-
  capacity tooltip with field-loot overflow.
- Gabled slate roofs now render on regular footprints only (concave /
  irregular buildings fall back to flat membrane caps), at a realistic 4 m
  tile scale, fixing per-face UV smearing and the prior terracotta "brick"
  look.
- Scavenging regression fixed: search progress, carried loot, deposit runs and
  ransom captures now commit into the settlement state instead of being
  overwritten by a pre-scavenge pipeline snapshot.

### Fixed

- Building a tower (and other freestanding structures) at game start failing
  with "not enough resources": `canAffordCost` treated a missing `tools`
  stockpile key as `undefined >= 0 === false`, blocking every build.
- Resource meters and storage meter now display whole numbers; the pause-menu
  date was off by a day.
- The cloud canopy plane rendered upright (ground-to-sky wall) instead of a
  horizontal layer; it now stays a flat plate overhead.
- Offline settlement catch-up and save migration respect persisted
  resource-node depletion, so far-away colonies don't resurrect harvested
  nodes.

---

## [0.1.0] – 2026-09-02

Baseline feature release after the first development sprint. Terminus is a
real-world-map survival strategy game in the style of *Infection Free Zone*:
pick any city on Earth, establish an HQ, scavenge real OSM buildings, adapt
them into functional facilities, build defenses, and survive the nightly
infection.

### Added

- **Real-world map engine** — 3D satellite globe, city search, elevation,
  buildings, roads, water and vegetation extracted from OpenStreetMap;
  chunk-file loading for 8km × 8km maps.
- **Settlement core** — HQ selection and sizing, finite storage capacity,
  population, labour distribution with job priorities/limits, morale,
  deaths/births, and settlement failure/overrun states.
- **Scavenging** — right-click a building to dispatch a squad; itemized loot
  per building type, search progress, carry capacity, auto-return to deposit,
  leftover-loot crates, and area scavenge queues.
- **Building adaptation & construction** — scavenged buildings convert into
  cookhouses, medbays, armories, watchtowers, warehouses and more; worker-
  driven construction with progressive material deduction; freestanding
  defenses (walls, towers, gates) placed in the 3D world.
- **Tactical squads & combat** — squad formation with loadouts, movement and
  attack orders, melee/firearm combat, noise generation, cover, barracks and
  squad-quarters capacity, injury/medical triage.
- **Vehicles** — discoverable world vehicles, mounting/dismounting, road
  pathfinding, fuel, cargo bays, and mobile-scavenge expeditions.
- **Infected simulation** — day/night dormancy, weather overrides, lairs,
  hordes, building breaches and sieges.
- **Human factions** — hostile hideouts with raids and ransom, recruitable
  hidden survivor groups.
- **Weather & seasons** — dynamic systems with rain, storms, fog, heatwaves,
  blizzards, moon phases and seasonal farming effects.
- **Research tree, radios & economy** — research points and nodes, radio
  directives, caravans and multi-settlement colonies, scavenge/resource
  multipliers.
- **Persistence** — save/load with schema versioning, offline settlement
  catch-up, and persistence of scavenge queues and global world state.

### Changed

- (No prior release to compare against — this is the baseline.)

### Fixed

- (No prior release to compare against — this is the baseline.)

[Unreleased]: https://github.com/OWNER/terminus/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/terminus/releases/tag/v0.1.0