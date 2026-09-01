# Infection Free Zone — Complete Buildings Reference

Source: IFZ's own wiki (infectionfreezone.wiki.gg/wiki/Buildings), retrieved directly — not inferred or guessed. Use this to correct Terminus's building roster to match the real game exactly, per the design doc's "100% accurate to IFZ" requirement.

## How to read this list

- **Adaptation** = converts an existing (already-scavenged) real building into this function. Cost scales with the building's size and the percentage of it converted. Cannot be built from scratch unless "Advanced Masonry" is researched, which unlocks direct construction with a preset size for each adaptation type.
- **Building** = a freestanding, player-placed structure with fixed dimensions/cost (matches the user's own example: fields, fences). Requires free space to place. Walls are a special case within this category — drawn like a path rather than placed as a single footprint.
- **Requirement** = the research tech (if any) that must be unlocked before this building becomes available. "None" means available from the start.
- Only one adaptation type can occupy a given building footprint at a time; splitting a building into multiple independently-adaptable sections costs Bricks, and the building can't be adapted while being split.
- Production and Defense buildings require assigned Workers to function at all — unstaffed, they simply stop working. Efficiency scales with mood and worker count (capped by the structure's own capacity). Workers return to base at night (pausing all repair/production) unless manning a Watchtower or Gate.
- Any building with durability can be damaged by the Infected or hostile human factions; a building under manual repair is non-functional during the repair (a Repairmen Shop, if adapted, can repair automatically).

---

## Basic

| Building | Type | Function | Unlock | Notes |
|---|---|---|---|---|
| **Headquarters** | Adaptation | Command center + storage facility | None | Increases max squad count based on its size. Cannot be de-adapted unless another HQ exists. **Losing your last HQ ends the game.** All storage facilities (HQ + Warehouses) share one combined inventory pool, and act as resupply/drop-off points for squads and vehicles. |
| **Squad Quarters** | Adaptation | Support structure | None | Increases max squad count based on its size (same effect as HQ, but doesn't provide command/storage functions). |
| **Warehouse** | Adaptation | Storage facility | None | Offers more storage than HQ alone. Shares the same combined inventory pool as all other storage buildings. |
| **Shelter** | Adaptation | Basic housing | None | Houses citizens. Insufficient housing capacity penalizes mood. |
| **House** | Adaptation | Improved housing | Advanced Woodworks | Better than Shelter — improves mood rather than just avoiding a penalty. |

## Food Production

| Building | Type | Function | Unlock | Notes |
|---|---|---|---|---|
| **Field** | Building (freestanding) | Grows Grain | None | Produces 4 Grain per cycle unassisted, or 7 Grain if given 1 Fertilizer. Yield/time affected by adverse weather. |
| **Barn** | Adaptation | Converts Grain to meat/fertilizer | None | Consumes 2 Grain → produces 2 Raw Meat + 1 Fertilizer. |
| **Cookhouse** | Adaptation | Converts raw food to rations | None | Two recipes: 2 Grain + 1 Wood → 4 Food Rations, OR 2 Raw Meat + 1 Wood → 5 Food Rations. |
| **Greenhouse** | Building (freestanding) | Weather-proof Field | Greenhouses (tech) | Functionally identical to a Field, but immune to the adverse-weather production penalty. |
| **Cannery** | Building (freestanding) | Produces long-life Canned Food | Food Preservation (tech) | Converts Metal + Food Rations into Canned Food crates. |

## Production

| Building | Type | Function | Unlock | Notes |
|---|---|---|---|---|
| **Tool Factory** | Adaptation | Produces Basic Tools | Tool Factory (tech) | Tools are a crafting input for several other buildings. |
| **Arms Factory** | Adaptation | Produces ammo and weapons | Nitrocellulose Powder / Pistol Production (tech) | Ammunition Crates (Metal+Fuel), Pistol (Wood+Metal), Assault Rifle, Shotgun, Sniper Rifle, Heavy Machine Gun — each a separate recipe with escalating Metal cost. |
| **Chemical Plant** | Adaptation | Produces Fertilizer and Fuel | None | Multiple recipes: Wood→Fertilizer, Fertilizer→Fuel, Wood→Fuel — flexible depending on what raw material you have surplus of. |
| **Protective Gear Factory** | Adaptation | Produces armor | Polymers / Advanced Metalworks (tech) | Protector (light armor), Riot Gear, Plate Armor — escalating Metal/Fuel cost per tier. |

## Walls (freestanding, drawn like a path)

| Building | Function | Unlock | Cost | Notes |
|---|---|---|---|---|
| **Barbed Wire** | Damages/slows anything passing through | None | 4 Metal | Doesn't fully block — a damage-over-passage deterrent, not a hard barrier. |
| **Wooden Palisade** | Blocks the Infected | None | 5 Wood | Cheapest hard blocker. |
| **Metal Fence** | Blocks Infected/hostiles | None | 5 Metal | |
| **Brick Wall** | Blocks Infected/hostiles | None | 7 Bricks | |
| **Fortified Wall** | Blocks Infected/hostiles | Advanced Masonry | 5 Wood, 4 Metal, 20 Bricks | Highest-tier wall. |
| **Wooden Gate** | Blocks Infected/hostiles, lets squads/workers pass | None | 30 Wood | Can be staffed by workers as guards. |
| **Metal Gate** | Same as Wooden Gate, stronger | None | 8 Wood, 20 Metal | Can be staffed by workers as guards. |
| **Fortified Gate** | Same, highest tier | Advanced Masonry | 10 Wood, 15 Metal, 40 Bricks | Can accommodate 6 workers as guards. |

## Towers (freestanding)

| Building | Function | Unlock | Cost | Notes |
|---|---|---|---|---|
| **Wooden Tower** | Defensive garrison point | None | 10 Wood | Can be staffed by workers as guards. |
| **Metal Tower** | Defensive garrison point | None | 5 Wood, 15 Metal | Stronger than Wooden Tower. |
| **Fortified Tower** | Defensive garrison point | Advanced Masonry | 5 Wood, 5 Metal, 30 Bricks | Highest tier. |

## Other / Utility

| Building | Type | Function | Unlock | Notes |
|---|---|---|---|---|
| **Antenna** | Building (freestanding) | Communications | Basic Antenna Technology | Can recall all squads at once, or be used to invite/attract more survivors to join the settlement. |
| **Medbay** | Building or Adaptation | Medical treatment | Medical Care Technology | Produces First Aid Kits passively; heals squad members over time (each assigned worker adds 0.1 HP/hour healed), supports up to 3 "beds"/patients at once. |
| **Research Center** | Building or Adaptation | Research | Requires 1 Scientific Material to build | Produces Scientific Materials passively, which fund unlocking further tech. |
| **Weather Center** | Building or Adaptation | Weather forecasting | Weather Forecast Technology | Forecasts weather up to 9 days in advance — lets the player plan around the weather-linked infected-activity windows (see the mechanics reference doc §6.1/§8). |
| **Mast** | Building (freestanding) | Decorative only | None | No stated gameplay function — cosmetic. |
| **Kindergarten** | Building or Adaptation | Childcare | Nursery Technology | Produces "Childcare" — a satisfaction/demand resource for citizens, presumably feeding into mood. |
| **Bar** | Building or Adaptation | Morale/socializing | None | Converts Grain into "Brews," which satisfy a citizen demand (mood-related, matching the "beer for mood" advice found in general community guides). |
| **Vehicle Workshop** | Building or Adaptation | Vehicle construction/repair | Mechanics Technology | Can construct new vehicles, repair damaged ones, and deconstruct unwanted ones. |

---

## Notes for correcting Terminus's building roster

Terminus's current invented building list (design doc §7.2/§10) uses different, made-up names that don't match any of the above — e.g. "Farmhouse," "Sawmill," "Guard Tower," "Floodlight Tower," "Rest Hall," "Radio Antenna," "Garage" don't correspond 1:1 to real IFZ buildings. Given the project's stated goal of 100% accuracy to IFZ, the recommended approach is to **replace Terminus's invented building roster entirely with the real list above** — same names, same categories (Basic/Food Production/Production/Walls/Towers/Other), same adaptation-vs-freestanding designation, same research gating — rather than keeping the current made-up names and functions.

One deliberate Terminus-specific addition from the design doc that has no direct IFZ equivalent above: **Floodlight Tower**, tied to Terminus's own UV/day-night zombie-dormancy lore (design doc §6.1) as a zombie-specific light deterrent — this is an intentional Terminus invention, not an IFZ omission, and should be kept as a genuine Terminus original alongside the accurate IFZ roster, clearly flagged as such if the rest of the building list is being corrected to match IFZ exactly.
