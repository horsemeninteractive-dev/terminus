# Infection Free Zone — Mechanics & UI Reference

## Purpose

This document is ground truth about how *Infection Free Zone* actually works, compiled from IFZ's own wiki, Steam community guides, developer posts, and patch notes — not from general genre knowledge or visual inference. It exists because handing an AI build agent a screenshot alone leads it to guess at what unfamiliar elements do, and those guesses get built as real (but wrong or fake) features.

**How to use this**: when building or fixing any Terminus system inspired by IFZ, check the relevant section here first. If asked to match an IFZ screenshot or behavior, cross-reference this document rather than inferring purpose from pixels. If this document doesn't cover something, say so explicitly rather than inventing plausible-sounding behavior — that gap should be flagged back, not filled in silently. Where Terminus deliberately diverges from IFZ (see `design-doc-final.md`), the divergence is intentional design, not an error — this document describes IFZ, not a mandate to copy it exactly everywhere.

Every claim below is sourced from IFZ's own wiki, Steam guides, or dev-confirmed community posts. Where something is uncertain or community-disputed, it's marked as such rather than stated as fact.

---

## 1. Core Loop & Setting

IFZ is a real-time-with-pause, bird's-eye-view survival strategy game. Players lead a group of survivors during the day to scavenge real-world-mapped buildings for resources and construct defenses, while defending their settlement against nighttime infected attacks. The infected remain dormant indoors during daylight. The game uses OpenStreetMap data, letting players set up in any real city.

## 2. Starting Location & HQ Selection

- No traditional easy/medium/hard difficulty picker. Instead, three sliders control starting people, resources, and horde numbers.
- Location matters strategically: higher-population real areas mean more infected hordes; lower-population areas may lack sufficient scavengeable supplies. A location with building variety is recommended.
- **HQ building choice is a genuine tradeoff**: larger buildings house more people/supplies but are harder to defend; smaller buildings are easier to defend, especially early, but hold less. A HQ doesn't need to be picked at max size — even a large building starts only partially adapted (see §3) and can be expanded later.
- Squad count scales with number/size of HQ facilities — a second, later-built HQ has been reported to raise max squad count substantially (one report: 4 → 20 after adapting a second HQ building). Multiple HQs are possible; each spawns/houses its own workers, and each acts somewhat like its own sub-base — losing your only HQ is a critical failure state.

## 3. Buildings, Adaptation & Deconstruction

**Adaptation workflow (exact UI steps)**:
1. A building must be **scavenged before it can be adapted** — you cannot adapt a building you haven't sent a squad to search first.
2. Right-click the scavenged building → select **"Adapt"** (hammer icon, bottom-right of the building's context menu).
3. Choose the building type to convert it into from a menu at the **bottom-left** of the screen, then click the target building.
4. **Click-and-drag over the building's footprint controls how much of it gets adapted** — a single click adapts only a smaller default portion (enough capacity for a modest population, e.g. ~20 people on a building that could hold 60 fully adapted); dragging across more of the footprint claims more of it. This is **partial adaptation** — a deliberate resource/time tradeoff, not a bug.
5. **Visual states**: a building queued/in-progress for adaptation shows **blue shading** with the required resources displayed; a completed/currently-inhabited adapted building shows **green shading** with its current inventory/capacity.
6. **Cost scales steeply with building size** — a large building can require hundreds of wood; small buildings are far cheaper and faster, which is why smaller buildings are often preferred despite lower capacity.
7. **Expanding an existing partial adaptation**: select the same building type again from the menu and drag over the already-adapted building to claim more of its footprint (same action as initial adaptation, just applied again to a building that already has that adaptation).
8. **Splitting a building**: a single large building can be split (costs Bricks) into multiple independent structures, each separately adaptable to a *different* purpose (e.g. half shelter, half cookhouse). Without splitting, one building footprint can only hold one adaptation type at a time.
9. Typically only one adaptation type exists per (unsplit) building footprint.
10. **Advanced Masonry** (a research unlock) allows constructing new buildings directly/from scratch, without needing an existing real building to adapt — this is IFZ's actual gate for freestanding construction, not an unrestricted option from the start.
11. **Deconstruction/dismantling** old buildings is the primary resource source for adaptation/construction — not every real building is worth keeping; some are dismantled purely for their materials. **Distance from HQ/storage matters**: workers must physically carry recovered resources back, so dismantling something far away takes longer to actually deliver materials.
12. **Buildings have durability/HP** and can be damaged by the infected or hostile factions. A building **under manual repair is non-functional** during the repair. A "Repairmen Shop" facility can auto-repair damage without manual player action.
13. **Production and Defense buildings require assigned Workers to function at all** — an unstaffed production building or watchtower simply stops working. **Efficiency scales with mood and worker count**, both gated by the building's own capacity.
14. Workers return to base/stop working at night by default, **unless they're manning a watchtower or gate** — repairs and production pause overnight for everyone else.
15. Deadaptation (removing an adaptation) is possible, opening the building back up for a different adaptation later.

## 4. Squads & Combat

- Squad management UI is located in the **top-right** of the screen, accessed via a green walking-icon button that opens the squad list; new squads are created from there.
- **Each squad can carry up to 4 items of loot at a time** — once full, they must return to HQ/storage to unload before continuing to scavenge. Vehicles increase carrying capacity beyond this.
- **Shift-click queues a chain of orders** to a squad (standard RTS queuing behavior).
- **A weapon choice (e.g. pistol vs. machete) exists at squad creation time** — confirmed via a patch note fixing a bug where squads spawned with pistols despite the player selecting machetes, meaning this choice is a real, intended step in squad formation, not automatic.
- Squads fighting indoors while infected try to break in is a commonly recommended defensive tactic — being inside a defensible adapted building while shooting out is safer than fighting in the open.
- Watchtowers can be equipped with weapons to arm them; unequipped, they contribute little.

## 5. Population, Recruitment & Rival Factions

- The population grows through recruiting other survivor groups found in the world; some are friendly and willing to trade/join, others are extremely hostile and must be fought.
- **Rival hostile human factions exist as a distinct threat from the infected** — "Purifiers" are one named example of a hostile human faction encountered in some playthroughs/zones, with their own **Purifier Zones/Purifier HQ** that can be attacked and captured.
- Diplomacy/alliances with neighboring zones (trade agreements, resource sharing, coordinated defense) are part of the game's stated feature set, alongside the risk of betrayal.

## 6. Resources & Scavenging

- Core resources: food, water, medicine, ammunition, plus construction materials (wood, metal, bricks).
- **Dedicated resource-scavenging workflow** (distinct from building-loot scavenging): select the Scavenge option (axe icon, bottom-left), choose a resource type (wood/metal/bricks), then select an area on the map — available resources in that area highlight (e.g. turn blue), and workers travel out, gather, and return the material to HQ/warehouse automatically.
- Food specifically has a production chain: Granary → Kitchen → Cannery. Running several smaller Kitchens in parallel is more efficient than one large one (parallel production queues).
- Crop fields planted outside the player's walled zone are not destroyed by zombies, but their growth timer resets if left unharvested too long.
- **Production efficiency is tied to population mood** — the community guide advice is to provide housing, "beer," and kindergartens/childcare to maximize mood and thus production output.

## 7. Vehicles

- Vehicles exist as a way to extend squad range and loot-carrying capacity beyond the 4-item on-foot cap.
- Confirmed bug-fix history shows squads can fire from vehicles during combat/expeditions (a real, intended interaction, not just transport).

## 8. Weather, Day/Night & Infected Behavior

- The infected are dormant/sheltering indoors during daylight and only fully active/attacking at night by default.
- Weather affects this: overcast/cloudy conditions and storms can enable daytime infected activity by blocking the sun's effect; a full moon reduces nighttime activity.
- A Weather Station-type building/forecast mechanic lets players anticipate upcoming conditions.

## 9. Map & World Rendering Details

- **Real street names render as labels directly on the map** — confirmed via a patch note fixing street names overlapping squad icons, meaning they're a genuine persistent HUD/world element, not decorative flavor.
- Buildings can show status icons overlaid on them (e.g. a production-type icon, confirmed via a patch note about a meat-production icon incorrectly appearing over a Medbay building — meaning building icons are type/output-specific, not generic).
- **A "no path" icon appears over a building when it cannot currently be reached** by a squad/worker — a genuine pathfinding-failure indicator, not just silent failure.
- Living-quarters/capacity numbers are shown when selecting an HQ or other populated building.

## 10. Debug/Cheat Console

- Opened via the **`~` (backtick) key** on English keyboards (varies by layout). Only usable inside an active save. Must run `EnableCheats` first before other commands work.
- This confirms hiding developer/debug tooling behind a dedicated keybind, off by default, is the correct real-game convention — not a Terminus-specific invention.
- Selected commands for context (not for Terminus to replicate as player-facing features, but useful for understanding what's considered "debug-only" vs. normal play in the real game): `AddWorkersToHq`, `ClearStockrooms`, `ScavengeAllBuildings`, `SetDay`/`SetHour`, `SetSoldierHp`, `ShowAllGroups`/`ShowAllVehicles`, `UnlockContent`.

## 11. Known Community-Reported Quirks (context, not necessarily behavior to copy)

- Partial adaptation has historically had rough edges — players have reported adaptation progress getting stuck at high percentages (92–98%), workarounds involving re-selecting the building type, and an exploit where canceling a modified partial adaptation could grant free instant completion. These are bugs in IFZ itself, not intended design — flagged here so they're not mistaken for a real mechanic to replicate.
- Community feedback repeatedly asks for the ability to fully utilize a large building across multiple purposes without the Bricks-cost split mechanic; as of available sources this remains a real limitation players find restrictive, not a solved problem.

---

## 12. Header Bar Geometry (confirmed via direct screenshot review)

The top header is **not a single uniform-height bar** — it has three distinct height tiers, tallest to shortest:
- **Tallest tier, far left**: the faction/colony crest banner — a flag-like shape with a pointed/notched bottom edge that extends visibly below both of the other two tiers. This is the single tallest element in the header.
- **Middle tier, immediately right of the banner**: a cluster of 4 square icon buttons (colony overview / faction relations / diplomacy / weather-forecast, in the reviewed screenshot) — shorter than the banner, but taller than the third tier.
- **Shortest tier, remaining width**: everything else — population count, squad count, temperature, a status/supply bar, game version text, date, clock/time controls (pause, play, fast-forward), and the resource readout icons — runs as the thinnest horizontal strip, filling the rest of the header's width.

Also confirmed from the same review: an ongoing **objectives/quest-style panel** exists in the top-left area below the header (distinct from any first-time tutorial), showing multiple concurrent named objectives (e.g. "Farming," "Animal Hunting," "Establish Long-Range Communications," "Raider Danger") each with their own checklist of sub-tasks and completion checkmarks — this is a real, persistent mid-game panel, not a first-time-only tutorial guide. It exists alongside first-time onboarding, not instead of it.

Also confirmed: the bottom-left action bar displays population as an **X/Y count format** (e.g. "0/56"), consistent with — and validating — the intended design of Terminus's own population button before its display bug.

---

## 13. Vehicle-Squad Interaction (confirmed via IFZ wiki + community sourcing, corrected via direct user confirmation)

**Input model**: left-click (or a single tap on touch) is selection only — selecting a squad, vehicle, or building to view its details — and must never issue an order. Right-click (or a long-press/long-tap on touch) is the order/interact command for everything: move, attack, board a vehicle, scavenge a building. This is one consistent mechanism for all orders, not different gestures per order type.

- **Vehicle boarding uses this same right-click/long-tap order command**: select a squad (left-click/tap), then right-click (or long-tap) a vehicle — the squad paths to it (real pathfinding, not a straight line) and mounts automatically on contact.
- **Once mounted, the squad's map representation switches to the vehicle itself** — the player sees the vehicle's label and model on the map, not a separate squad icon next to/on top of an unrelated vehicle icon. The squad panel/HUD also updates to show vehicle info (fuel, condition, cargo) once mounted, reflecting the squad's new mounted state.
- Once mounted, right-clicking anywhere on the map drives the vehicle there; shift-right-click queues a sequence of destinations.
- **Sending a mounted squad to scavenge a building**: right-clicking a building while the squad is in a vehicle should path the **vehicle** to the nearest point it can actually reach (vehicles are road-locked, so this is the nearest road point to the target building) — the squad then automatically dismounts there, walks on foot (real pathfinding) to loot the building, and automatically returns to and re-mounts the vehicle afterward, ready for the next order. This whole dismount → loot → remount sequence should be automatic, not something the player manages leg-by-leg.
- **A vehicle becomes informally "assigned" to whichever squad is currently occupying it** — per the wiki: "It is possible to assign a vehicle to a Squad. As long as they remain attached, the Squad will always move to the next location in their vehicle by default." Community reports note the AI around maintaining this assignment can be inconsistent in the real game (squads sometimes abandon a car to walk instead) — this is known jankiness in IFZ itself, not something to deliberately replicate.
- **Automatic unload on returning to storage**: when a squad (in a vehicle) is ordered to enter the HQ or a Warehouse, the squad exits the vehicle and **all contents of both their personal inventory and the vehicle's cargo are instantly transferred to storage** — automatic, not a manual "unload" action, provided the storage facility isn't destroyed or under repair.
- **Wild/found vehicles are inert until first occupied**: a vehicle found in the world starts with its stats obscured and is unusable until a player squad is ordered to enter it, at which point it becomes fully functional. Vehicles built via a Vehicle Workshop are immediately functional (no obscured/inert phase).
- **Refueling**: place a fuel item in a squad's inventory and send them to the vehicle to refuel it manually, or station a squad in a vehicle near a Warehouse to auto-refuel from on-site supplies.
- **Squad capacity while mounted**: any vehicle can house up to a full squad (4 members) plus cargo depending on the vehicle's storage slots.

## 14. Squad/Zombie Movement (confirmed, general genre-standard expectation)

While not separately documented in the sources reviewed, IFZ's squads and infected clearly navigate around buildings and street geometry rather than moving in unobstructed straight lines — this is standard, expected pathfinding behavior for the genre, not an advanced or optional feature. Any implementation where on-foot units move in a straight line regardless of intervening geometry is a functional gap, not a stylistic simplification.

---

## 15. Confirmed Terminus-Specific Bug: Gather-Area Tool Screen-to-World Mapping

Not an IFZ-comparison finding — a direct Terminus code defect, documented here as it was found alongside the vehicle-interaction research and blocks a core scavenging workflow.

`AreaGatherOverlay.tsx`'s drag-to-designate-gathering-area logic converts the screen-space drag rectangle to world coordinates using a **hardcoded linear formula that ignores the actual 3D camera** entirely:

```js
const mapExtent = 250;
const minX = ((x1 - screenW / 2) / (screenW / 2)) * mapExtent;
```

This assumes the screen is always a fixed-extent, non-rotated, origin-centered top-down view — it has no knowledge of the camera's real position, pan offset, zoom level, rotation, or perspective projection. Whenever the camera has been panned, zoomed, or rotated (i.e. almost always during real play), the computed "world box" bears no relationship to what's actually under the drag rectangle on screen — so a drag over visible trees can compute world bounds nowhere near those trees, and no workers get assigned because no real resource nodes fall within the (wrong) computed area.

The correct approach is **raycasting**: for each corner of the screen-space drag rectangle, cast a ray from the camera through that screen point (using the camera's real projection/view matrix — standard Three.js `Raycaster` + `camera` pattern) and intersect it against the ground plane to get the true world-space coordinate, then build the bounding box from those raycasted points rather than a hardcoded formula.

The reported side effect — camera becoming unresponsive/lighting glitching after using this tool — is consistent with `AreaGatherOverlay`'s full-screen (`fixed inset-0`, `pointer-events-auto`) drag-capture div intercepting mouse events that the 3D engine's own camera-orbit controls need to receive. If the orbit controls listen on the canvas/window for `mousedown`/`mousemove`/`mouseup` to track a drag gesture, and this overlay's own `mouseup` handler consumes the event before it reaches them, the orbit controls' internal "is dragging" state can get stuck permanently true, breaking further camera movement until reload.

---

## Explicitly NOT covered by this document

This document reflects what was findable via IFZ's wiki and community sources at time of writing — it is not exhaustive. Systems not detailed above (exact combat damage formulas, exact research tree contents beyond Advanced Masonry, exact mood/happiness formula, exact horde escalation numbers) should be treated as unresearched, not as "IFZ doesn't have this." When in doubt, search before assuming either that a mechanic exists or that it doesn't.
