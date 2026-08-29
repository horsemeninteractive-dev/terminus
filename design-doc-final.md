# Terminus
### Real-World Zombie Survival Strategy Game — Design Document v1.0 (Finalized for Build)

---

## 1. Concept

A browser-based survival strategy game inspired by *Infection Free Zone*, set on a real-world city map (rendered from OpenStreetMap building/road data), where the player leads a growing group of survivors against a **zombie** outbreak rather than IFZ's original creature. The game is a faithful mechanical recreation of IFZ's core loop — squads, scavenging, base building, real-time-with-pause survival management — with a virus-based infection mechanic layered on top, and a **multi-settlement network with trade** as the answer to IFZ's weak endgame.

This is a solo-dev prototype to be built by an AI coding agent and extended over time. Multiplayer is the long-term vision (see §11) but v1 ships single-player.

**Note on v1 scope**: per direction, v1 is intentionally large — it includes the full vehicle system, the full multi-settlement/trade network, and a real branching tech tree from the start. This is not a minimal/cut-down prototype; every system below is in scope for the first build unless explicitly marked otherwise.

---

## 2. Core Pillars

1. **Your city, your apocalypse.** Real building footprints and street layouts from OpenStreetMap, chosen via a rotatable satellite globe.
2. **Faithful to IFZ's loop.** Day = scavenge, build, recruit. Night = defend. Squads are the core unit of agency.
3. **A coherent virus, not a reskin.** The infection is one consistent biological threat: field bites, base outbreaks, and UV-driven day/night behavior all stem from the same virus logic.
4. **A network, not a single base.** Multiple settlements, founded across the real globe, linked by trade caravans — solving IFZ's "goes stale once stable" problem and laying the groundwork for multiplayer alliances/trade/war later.

---

## 3. Map & World

### 3.1 Data source & pipeline
- Building footprints, road network, and landuse/amenity tags sourced from **OpenStreetMap via the Overpass API**.
- Data for a chosen location is fetched and pre-processed (offline/build step, not live in-browser) into a compact custom format: simplified building polygons, each tagged with a coarse type derived from OSM tags (residential, commercial/retail, supermarket, pharmacy, industrial, civic, gas station, etc.), plus road/path geometry for movement and vehicle routing.
- Pre-processing includes geometry simplification (fewer vertices at distance) to keep client-side rendering/pathing cheap.
- **Data source is free/open**: OpenStreetMap data (Overpass API) and a free satellite tile provider for the globe screen (§3.4), not a paid provider. This means required OSM attribution must be displayed in the UI (standard OSM attribution requirement), and the build should respect the chosen provider's usage-rate limits (e.g. caching pre-processed city data rather than re-fetching repeatedly).

### 3.2 Two-tier map structure
- **Local zone**: a bounded grid of tiles around a settlement's HQ, sized by the player at founding time (§3.4: 3×3 up to 5×5 tiles) and expandable further through play. Every building here is a real, interactive entity: it can be scouted, entered, searched/looted, adapted, fought over, repaired, deconstructed, and destroyed. **Building placement/adaptation is free-form, following each real building's actual footprint outline — not snapped to an abstract tile grid.**
- **Expedition zone**: the wider area beyond a settlement's local zone. Squads/vehicles can be dispatched here abstractly (send squad → target area → returns with loot/report after a duration) without full building-by-building simulation.
- Expanding a settlement's local zone outward (claiming more tiles) is a progression goal, not automatic.
- **Zombie density is not uniform.** Danger level varies by real building type/area density — dense commercial/downtown areas are more dangerous than suburban/residential ones, matching IFZ's tile-danger-zone approach. Density should be derivable from OSM tags (building density, amenity type, landuse) at map pre-processing time.
- **Movement/pathing**: vehicles are restricted to real road geometry from the OSM road network data — they cannot drive through buildings or off-road. Squads (on foot) and zombies free-roam across the map regardless of roads, limited only by building collision (can't walk through a standing, unopened building) and terrain.

### 3.3 Rendering
- **Not flat top-down.** Matching IFZ's actual approach: a **rotatable angled 3D camera** over a real 3D scene, with buildings **extruded as real 3D volumes** from their OSM footprint polygons (using available OSM height/levels tags where present, reasonable defaults otherwise), not flat sprites or a 2D tile map.
- **The 3D view is kept at all zoom levels** — unlike IFZ (which drops to a flat 2D schematic map when zoomed out for the wider expedition view), Terminus stays in the 3D rendering at every zoom level, including the expedition/wider zone.
- Camera controls: click-drag or edge-scroll to pan, scroll wheel to zoom, dedicated rotate control (e.g. Q/E keys or modifier-drag) to orbit the camera around the current view — matching IFZ's rotation scheme.
- Rendered with a real 3D engine/renderer (see §12 tech stack), not a 2D canvas map library — buildings are interactive, stateful game entities (adapted/empty, HP, capacity, loot) rendered as 3D objects, not static map decoration.
- LOD: full detailed building geometry at play zoom, simplified/lower-poly block volumes at greater distance or wider zoom, to keep the always-3D approach performant.
- **Combat must be visibly animated in the 3D scene** — units and zombies visibly fight it out at the location it occurs, not resolved as an off-screen calculated result/popup. This applies to both local-zone combat and vehicle-involved skirmishes.

### 3.4 Start Screen — Globe Picker
- Game opens on a **rotatable 3D globe** textured with real satellite imagery (via a map tile provider), not a stylized illustration.
- Player freely rotates/spins the globe and clicks anywhere to select a location.
- **City selection is both curated and free**: a highlighted default list of well-mapped, gameplay-tested cities is presented for easy starting choices, but the player can also free-pick any location — validated live against OSM data availability at pick-time. Invalid picks (ocean, data-sparse areas) give clear feedback rather than failing silently.
- **Local zone size is player-chosen at founding, matching IFZ**: a discrete tile-grid size selection from **3×3 up to 5×5 tiles** (not a free slider — fixed step sizes, matching IFZ's own options). This is chosen every time a settlement is founded, not just the first.
- **Larger zone size is a genuine tradeoff, not a free upgrade**: choosing a bigger starting grid costs more (resources and/or increased starting difficulty — more real-world buildings/area to secure and clear from the outset) rather than being strictly better. Smaller grids are a leaner, easier, faster-to-secure start.
- **Exact placement is adjustable, not just an auto-centered point.** After choosing a general location and zone size, the player can fine-tune/reposition the tile-grid footprint over the real map — matching IFZ's flow of picking a location and then adjusting exactly where the grid sits — before confirming, rather than the game auto-centering the grid on the clicked point with no further control.
- On confirming, the camera animates in a single continuous zoom from the full globe down to the default in-game camera view at the chosen, sized, and positioned local zone.
- After the zoom completes, **the player manually selects and confirms their starting HQ building** from the real buildings visible in the local zone — no auto-suggestion, full player choice (with normal in-fiction guidance available, e.g. building size/defensibility info shown on hover, but the decision itself is manual).
- **The globe is not a one-time start screen** — it is reachable later from within a run, functioning as a persistent world map for founding additional settlements (§7.5) and, in future multiplayer, as the shared map other players' settlements exist on too. **The same size-selection and exact-placement flow applies to every new settlement founded**, not only the player's first.

---

### 3.5 Fog of War

**Visibility is limited, matching IFZ exactly — the player does not see the whole local zone by default.** Visible area is the union of vision radii around: the player's own squads (wherever they currently are, including in the expedition zone), general-population workers out on a task, and owned/adapted buildings (a permanent revealed radius around the settlement's built footprint). Everywhere else — unscavenged buildings, roaming zombie groups, undiscovered survivor groups, wandering vehicles — is hidden under fog and not rendered/known to the player until a squad or worker's vision radius reaches it.

- Vision radius is a per-source value (squads, workers, buildings each have their own), not a single global reveal.
- Previously-seen-but-now-unobserved areas should remain revealed at a dimmed/greyed "last known" state (standard fog-of-war behavior: unexplored = fully hidden, explored-but-not-currently-visible = dimmed, currently-visible = fully rendered) rather than snapping back to fully hidden the instant a squad leaves.
- This makes scouting genuinely necessary — the player cannot passively watch for approaching hordes or opportunities outside their revealed radius, and must proactively position squads/lookouts to extend visibility, matching IFZ's actual scouting-driven play loop.
- Research (Communications branch, §10 — Radio Antenna / Regional Broadcast) can extend or partially reveal vision as an unlock, consistent with the existing tech tree.

---

## 4. Survivors & Squads

### 4.1 Starting state
- Player begins alone (no starting colony of NPCs) at each new settlement and must find and recruit survivors from the map.

### 4.2 Named survivors, leaders & skills
- **Not every member of the population is an individually simulated/stat-tracked survivor.** The settlement contains a large **general population** of anonymous survivors used as ordinary labour, plus a smaller number of **named/specialist survivors** who have individual stats and identities.
- Named survivors are the individuals who matter mechanically and can be appointed to leadership/specialist roles such as:
  - **Squad Leader** — leads a squad and provides its individual combat/scavenging/field capability.
  - **Head Chef / Head Farmer / Head Medic / Head Researcher / Head Engineer / Head Worker** and equivalent building-specific specialist roles — runs the relevant operation and provides the applicable specialist skill.
- Stats are shown to the player as **abstracted tiers**, not raw numbers: **Novice → Skilled → Expert** (three-tier scale) across **seven stats**: Combat, Scavenging, Medical, Driving, Persuasion, **Construction**, and **Production**. Internally the simulation can use numeric values, but the UI never shows raw numbers.
- **General-population survivors do not have individual stat sheets.** They provide manpower for ordinary labour, gathering, farming, construction labour, production support, and squad membership. Their individual identities and stats are not exposed or individually managed.
- **Named survivors provide the specialist component; general workers provide the labour component.** For example, a Farm may have one Head Farmer with a Production skill plus several anonymous workers. A Workshop may have one Head Worker plus supporting workers. A squad has one named Squad Leader plus general-population squad members.
- **Field-role stats** (Combat, Scavenging) govern squad-leader performance out in the map. **Specialist stats** (Medical, Driving, Construction, Production) govern the named survivor's assigned station/task: Medical for medbay treatment and infection-cure odds (§6.2), Driving for vehicle handling (§8), **Construction for building/adaptation/repair work** (§7), and **Production for farming, cooking, crafting, and resource-processing efficiency at stations** (§7.2). Persuasion (§4.4) is used during recruitment encounters.
- A named survivor can be reassigned between roles, but doing so moves that specialist out of their previous role. A squad leader is therefore not simultaneously acting as a head worker, and vice versa.

### 4.3 Squads
- Formed from recruited survivors, **squad size cap of 4** (matches IFZ).
- Every squad has **one named Squad Leader**. The leader is an individually tracked survivor with the seven stats from §4.2.
- The remaining squad positions are filled from the **general population pool**. These members do not have individual stat sheets and are treated as squad manpower rather than separately managed characters.
- Number of concurrent squads is gated by HQ/squad-facility capacity and by the number of available survivors in the general population. Creating or expanding squads therefore directly removes labour from settlement work.
- Squads are the unit sent to scavenge, scout, fight, garrison defenses, recruit other survivor groups, and (with a vehicle assigned) travel further/faster including between settlements.
- **Squad leadership matters.** The named leader's Combat, Scavenging, Driving and other applicable abilities influence squad performance; generic members contribute manpower, weapons/equipment capacity, and survivability without requiring individual stat management.
- Auto-equip logic: squads equip found weapons/gear automatically according to available equipment and compatible ammunition; player can manually reassign gear via base storage transfer.

### 4.4 Recruitment, Survivor Groups & Resistance
- **Potential recruits are not automatically marked on the map.** Survivor groups are discovered through ordinary exploration/scouting and environmental clues. A building may contain a survivor group without the player knowing it; the player only learns this by investigating/scavenging the building or noticing clues such as **chimney smoke** or other signs of human activity.
- Survivor encounters are therefore **world discoveries, not quest markers**. The map should not display a permanent icon revealing every recruit's exact location.
- Recruits are encountered primarily as **groups**, not as isolated individual stat sheets. A discovered group has a **leader**, and it is the leader who represents the group during the recruitment encounter.
- Recruitment has three possible outcomes depending on the group's disposition and the approaching Squad Leader's capabilities:
  - **Willing** — the leader accepts recruitment on approach.
  - **Distrustful** — requires a **Persuasion** attempt to convince the leader; it can fail, and repeated failed attempts may sour the encounter.
  - **Hostile** — the group refuses and may attack; resolved through combat like any other hostile encounter.
- **The leader is the named survivor gained from the encounter.** When a group joins, its leader is added to the named/specialist survivor pool and can subsequently become a Squad Leader or building head. The other members of the group are added to the **general population pool** as ordinary workers/squad members and do not receive individual stat sheets.
- Group size therefore matters independently from leader quality: a group with an Expert Medical leader may be strategically valuable because of the leader, while a larger group may be valuable primarily because it provides more general labour.
- The player should learn the leader's identity and relevant capabilities through the encounter rather than seeing all of this information from a distant map marker.
- This makes recruitment a genuine exploration and risk/reward mechanic rather than a free population button, while giving **Persuasion** a clear purpose distinct from Combat.

### 4.5 Population Growth & Morale
- **Population grows two ways**: active recruitment (§4.4) and **passive growth** (a birth-rate mechanic, matching IFZ) — settlements with adequate housing and good morale generate new survivors over time without the player needing to actively find them.
- **Morale/happiness is a tracked settlement-wide stat**, driven by:
  - Food quality/variety and whether stockpiles are healthy vs. running low.
  - Housing adequacy (enough housing for the population, not overcrowded).
  - Safety (recent attacks, outbreak incidents, losses).
- Morale affects both **productivity** (low morale slows work output at stations) and **defense** (low morale reduces combat effectiveness of squads defending or engaging), and high morale should measurably boost the passive population growth rate — tying §4.5's two systems together rather than leaving them independent.

### 4.6 Population Pools & Labour Assignment
- The population is managed through two functional layers: **named/specialist survivors** and the **general population pool**. The general pool is the workforce used for ordinary gathering, farming, construction labour, production support, and squad members.
- **General-population workers do not require individual assignment screens.** The player establishes work areas, production jobs, and workforce priorities; available general workers are allocated to those tasks.
- A named survivor assigned as a **Head Worker/Specialist** is separate from the general workforce. Their relevant stat determines the specialist quality/efficiency of the operation, while general workers provide labour capacity.
- A squad leader is similarly separate: one named survivor leads the squad and the remaining places are filled from the general population.
- Moving a general worker into a squad reduces available settlement labour. Removing a general worker from a squad returns them to the general pool. Appointing a named survivor as a squad leader or building head removes that specialist from any previous specialist role.
- The player can reassign named survivors and general workforce allocations, but should not be forced to individually micromanage every anonymous citizen.
- There is no need for a separate "idle named survivor" population mechanic beyond showing the current role of each named survivor; general workers remain a shared labour pool unless committed to a squad or work task.
- **Building construction/adaptation is not an instant resource-spend** — it requires assigned worker-labour over time (workers physically present at/working the site), matching IFZ. Paying the resource cost starts the project; assigned labour determines how fast it completes.

---

## 5. Combat

- **Resolution model**: squads auto-fight once engaged and combat **plays out visibly on the map** — the player's agency is in positioning and orders (send in, hold, pull out, garrison a tower, retreat to vehicle), not manual per-hit aiming.
- Buildings matter defensively: **adapted/secured buildings** block zombies from entering; **empty/unadapted buildings** can be entered and used as horde staging by zombies.
- Damage/attrition: engaged squads can take heavy losses; rotating a damaged squad out and a fresh one in is a viable, intended tactic.
- Defensive structures (walls, towers, barbed-wire-equivalent, floodlights — see §6.1) function as a static perimeter layer that squads can garrison or that operate passively (lights).
- Vehicles can participate in combat (mounted weapons, ramming, or simply as fast extraction) — see §8.
- **Squad control**: classic RTS-style — click to select a squad in the 3D scene (or via the HUD squad bar, §15), right-click a location/target to issue a move or attack order.
- **Zombie detection is sound/proximity-based**, not an omniscient "always knows your base" model. Zombies are drawn toward noise sources — gunfire, engines, a firefight in progress, potentially even a loud generator — within a detection radius, rather than pathing directly to the HQ regardless of player behavior. This gives noise discipline (fewer active squads at night, minimizing unnecessary combat) genuine value as a defensive tactic alongside walls and light.
- **Buildings/walls take incremental damage** during combat and require repair (spending Construction Materials) rather than existing in a simple standing/destroyed binary state — a badly damaged wall section is a weak point until repaired.
- **Difficulty escalates over time**: horde size and attack frequency increase as in-game days pass, matching IFZ's escalating threat curve, so a stable early settlement doesn't stay trivially safe forever.

### 5.0 Map Entity Identification (icons & faction color-coding)

**Every mobile entity visible on the map — player squads, vehicles, discovered survivor groups, and zombie groups — must render with an identifying icon/marker overlay, color-coded by faction/disposition, matching IFZ.** This is a baseline map-readability requirement, not a cosmetic option:

- **Player squads and vehicles**: a friendly-colored marker (distinct from the danger-red reserved for alerts per §16.2 — use a neutral/blue-white "friendly" identifier), showing at minimum squad name and member count at a glance.
- **Discovered survivor groups**: shown once discovered (§4.4) with a neutral/unknown-disposition marker until the player has actually interacted with them (approached/scouted), since their Willing/Distrustful/Hostile disposition is not known in advance — the marker should not reveal disposition before the encounter.
- **Zombie groups**: a hostile-colored marker, with the marker/icon set representing the group's approximate size (e.g. a small cluster of icons for a small group, more for a large horde), and the icon(s) should visibly degrade (e.g. color shifts toward damaged/greyed) as the group takes casualties in combat, giving the player a readable at-a-glance sense of how a fight is going without opening a detail panel.
- **A group's faction/disposition can change during play** — a neutral/unknown survivor group can turn hostile depending on player actions or story events; the map marker must update to reflect the current disposition, not a value fixed at discovery time.
- These markers only render for entities within the currently-visible area per §3.5 (Fog of War) — an entity outside vision radius has no marker, consistent with fog-of-war rules.

### 5.1 Zombie Variants
Multiple zombie types from v1, not a single enemy type. Concrete starting roster:
- **Shambler** — the basic type. Slow, low individual threat, dangerous mainly in numbers/hordes.
- **Runner** — fast-moving, low health, closes distance quickly; a squad caught in the open is more at risk from these than from Shamblers.
- **Brute** — high health/damage, slow; a serious threat if it reaches melee range with a squad or a weak point in defenses, but manageable at range if spotted early.
All variants share the same UV/day-night dormancy behavior (§6.1) and the same infection-on-bite risk (§6.2) — variants differ in combat stats and movement behavior only, not in the underlying virus rules. Additional variants can be added post-v1; this three-type roster is the fixed v1 baseline.

---

### 5.2 Rival Human Factions, Hideouts & Lairs

**A third faction exists beyond zombies and recruitable neutral survivor groups, matching IFZ: hostile human factions.** This was previously absent from the design entirely and must be added as a genuine system, not a reskin of zombie encounters.

- **Hideouts**: buildings permanently occupied by a hostile human faction. Unlike a recruitable survivor group (§4.4), a Hideout's occupants are armed, hostile on sight, and do not offer a Willing/Distrustful path — only combat or, in some encounters, negotiation (see below).
- **Rival-faction events**: hostile factions can initiate events against the player, such as capturing/ransoming a squad — demanding payment (e.g. food) for their safe return, with the player able to either pay, or refuse and attempt a rescue by combat. Both are viable, with real risk to the outcome either way.
- **Lairs**: zombie-occupied buildings are not a one-off encounter like ordinary scavenging combat — a Lair is a **persistent, ongoing threat** that continues spawning zombie groups over time (day and night) for as long as it remains standing, distinct from a building simply being occupied at the moment a squad scouts it. Lairs must be deliberately cleared/destroyed by the player as a standing objective, and left unchecked they escalate the surrounding area's danger over time.
- A settlement therefore faces three distinct threat sources requiring different responses: routine zombie encounters while scavenging, standing Lairs requiring deliberate clearance, and Hideouts/rival-faction events requiring combat or negotiation.

---

## 6. Infection Mechanic (new vs. IFZ)


### 6.1 Day/Night Justification
The virus causing the infection leaves tissue damaged in a way that **direct sunlight actively harms or pains it** — infected shelter and go dormant in daylight, and emerge active at night. This keeps the day/night gate consistent with the virus already being the source of the field/base infection mechanic (§6.2/6.3), and opens a zombie-specific defensive tool: **artificial light as deterrent.** Floodlights and generator-powered lit perimeters suppress or slow zombie activity nearby at night, giving a research/building line distinct from IFZ's walls-and-towers-only defense (see §10, tech tree).

**Weather modulates this beyond a simple day/night binary, matching IFZ:**
- **Overcast/heavily clouded daytime weather** reduces the sunlight penalty enough that zombies can become active and attack during the day, not only at night.
- **Rain/storm weather shields zombies from the sun's effect**, similarly enabling daytime activity during a storm.
- **A full moon at night makes zombies less active/less likely to attack**, giving the player a predictable safer night window tied to the existing weather/season system (§9).
- A **Weather Station** (Communications or Survival tech branch, §10) allows forecasting upcoming weather, letting the player plan around predictable dangerous/safe windows rather than being surprised.

### 6.2 Field Infection
- Survivors bitten during combat/scavenging risk **infection** (not instant turning).
- Infection is **hidden at first** (incubation period) — no immediate visible symptom.
- After a time window, the survivor develops **visible symptoms** (a status flag/warning icon the player can notice through normal observation, without needing to actively check).
- **Confirming infection for certain requires an active medbay check-up/test.** This creates a real decision: act early on suspicion (safer, but costs a quarantine/medbay action on a survivor who might turn out fine) vs. wait for confirmed symptoms (certain, but risks the survivor turning before it's caught).
- Resolution paths once infection is confirmed: treatment (medicine/medbay, chance of cure depending on how early caught), isolation (quarantine, preventing spread but not curing), or the survivor eventually turns and is lost/becomes a threat.
- **Survivor death — from combat, infection, or any other cause — is permanent.** There is no revival or recovery window once a survivor is lost. This applies throughout the game, not only to infection outcomes.

### 6.3 Base Outbreak Risk
- An infected survivor brought back to base — undetected, or a bite left untreated — can turn *inside the player's own territory*, triggering a **contained outbreak** rather than only an external combat threat.
- Containment requires quarantine mechanics: isolating the building/zone where the turn occurred, and/or tasking a squad specifically with containment (clearing the outbreak before it spreads to adjacent buildings/survivors).
- An unaddressed base outbreak should be able to escalate — spreading building-to-building within the local zone — creating genuine internal-threat tension distinct from the external night horde.

---

## 7. Base Building

### 7.1 Adapting real buildings vs. freestanding construction
- Real OSM buildings can be **adapted** into functional structures — cheaper, but each building has a **capacity cap** on how many functions/rooms it can hold, scaled by the real building's footprint size.
- **Freestanding construction** (not tied to an existing building) is possible at a **higher resource cost**, and is inherently **less secure** than fortifying an existing structure.
- This creates a meaningful map-reading decision: which real buildings are worth claiming and fortifying vs. where it's worth paying a premium to build fresh.

### 7.2 Utilities, Resources & Physical Resource Nodes
- No abstract power/water grid layer — a **physical resource and item stockpile model** instead. The game must distinguish between **individual scavenged items**, **processed/consumable supplies**, and **bulk construction materials**. Resources should not be implemented as a single generic number whenever IFZ distinguishes the underlying item/resource type.
- Core settlement supplies include:
  - **Food items/rations** — food is not a single generic "Food" item. Different food items/resources can be scavenged from appropriate buildings and consumed or processed by the settlement. Canned food is a distinct useful long-term food item, while other food supplies can be consumed/processed according to their type.
  - **Water** — a distinct consumable resource, found through appropriate scavenging or produced by a Water Purifier building.
  - **Medical items** — medicine is not one generic loot result. Distinct medical supplies can be scavenged from appropriate buildings and used for their specific medical purposes.
  - **Fuel** — a distinct vehicle/generator resource, scavenged from appropriate locations such as fuel stations, garages, vehicles and industrial sites.
  - **Ammunition** — ammunition is a **shared generic ammo resource**, matching IFZ's core resource model. Different weapons consume different amounts of that shared ammunition when firing, so a powerful weapon can place a greater demand on the stockpile. The game must not collapse weapons themselves into a generic "firearm" resource.
  - **Weapons and equipment** — weapons and useful gear are individual scavenged/crafted items with their own weapon type, capabilities, capacity and loadout implications. Ammunition remains a shared resource rather than separate calibre inventories.
  - **Construction Materials** — Wood, Metal and Bricks remain three distinct bulk materials matching IFZ's model.
- **Physical gathering nodes** must exist in the world rather than being abstract resource values attached to tiles:
  - **Trees / wooded vegetation → Wood**.
  - **Abandoned cars/vehicles and suitable metal street objects such as lampposts → Metal**.
  - **Rubble/brick piles → Bricks**.
  - Additional suitable OSM-derived or procedurally generated world objects may provide these same established resources, but should not introduce a new resource category without design approval.
- Resource nodes are **finite/depletable world objects**. Workers physically travel to them, harvest/dismantle them, carry the resulting material to the nearest appropriate storage/warehouse, and continue with other available nodes when the current node is exhausted.
- The real-world OSM map is the foundation, but not every gameplay node needs to exist explicitly in OSM. Appropriate trees, roadside metal objects, abandoned vehicles and rubble can be generated during map preprocessing from real-world geometry/context so that the world supports the same physical gathering loop as IFZ.
- **Building deconstruction** is another physical source of Wood, Metal and Bricks. The player orders the deconstruction of an unwanted building; this is **not an instant action** — it requires assigned worker-labor over time, exactly matching how construction/adaptation works in §4.6 (bigger buildings take longer and support more assigned workers to speed up), and the building must visibly remain (partially torn down, then as a rubble pile) until the job completes, at which point recovered materials enter storage and the building is actually removed from the map.
- Building categories: **Basic** (HQ, Storage, Squad Quarters), **Food** (Field, Farmhouse, **Cookhouse**, Cannery), **Production** (Workshop, Sawmill, Medical Lab), **Defense** (Palisade, Guard Tower, Floodlight Tower), **Civilian** (Housing, Clinic, Rest Hall), **Other** (Research Center, Radio Antenna, Garage).

### 7.3 Scavenging, Items & Building Discovery
- **Scavenging is an item-retrieval activity, not a generic resource button.** A squad is sent to a specific building/structure, searches it, discovers the available loot, physically carries the recovered items, and returns them to storage.
- Buildings have **contextual loot tables** based on their real-world type and location. A supermarket/restaurant is a meaningful food source; a pharmacy/hospital is a meaningful medical source; uniformed-service/security locations are meaningful weapon/ammunition sources; garages, parking areas and fuel-related buildings are meaningful fuel/vehicle sources; homes and other buildings can provide appropriate mixed supplies.
- **Loot is itemized by type.** The squad should receive concrete items such as particular food supplies, weapons, medical supplies, fuel and other appropriate gear, rather than simply receiving "Food +10" or treating every weapon as an abstract category. Ammunition remains a distinct shared resource, while weapons determine how much ammunition is consumed when firing. The exact item catalogue can expand during prototyping, but the distinction between meaningful item/resource types is a fixed mechanic.
- **Food items are also distinct.** Different food supplies can have different uses, storage behaviour and processing paths. Canned food is specifically valuable as a durable food supply and can be produced by the Cannery from suitable food inputs.
- **Squad carrying capacity matters.** Scavenged items enter the squad's inventory while the squad is in the field. When capacity is reached, the squad must return to a storage/warehouse location to unload before continuing, unless another appropriate storage/drop-off mechanic is available.
- **Building search state is persistent.** An unsearched building has unknown contents. Once a squad searches it, its discovered loot/state becomes known and the building can be marked as searched/cleared according to its remaining resources.
- **Large buildings can contain more loot and may take longer/more squad effort to search**, rather than every building producing the same fixed-size abstract resource payout.
- Searching an occupied or dangerous building can trigger combat or other encounters. The squad must therefore weigh the potential value of a building against its danger.
- **Survivor discovery uses the same information principle** (see also §4.4). A survivor group inside a building should not be displayed as a recruitment marker before discovery. Scouting/searching the building, observing it from nearby, or noticing environmental clues such as chimney smoke can reveal that survivors may be present.
- The player should therefore learn the city through **scouting, building investigation, resource observation and environmental clues**, rather than being given an omniscient list of loot and recruits.

### 7.4 Expansion (within a settlement)
- Within a single settlement's local zone (the 9-tile area), expansion is a single growing territory outward from HQ — not multiple separate outposts within that map.

### 7.5 Multiple Settlements & Trade (v1 scope — endgame answer)
- **Design intent**: IFZ's core weakness is a weak endgame — once a single settlement stabilizes, there's little reason to keep playing. This game's answer is **multiple settlements**, each on its own separate real-world location, in v1 from the start.
- The player returns to the **globe picker** (§3.4) at any time during a run to found a new settlement at a different location.
- **One settlement per local map, sized at founding** — each new settlement's location, zone size (3×3–5×5, §3.4), and exact placement are chosen fresh via the same globe-picker flow used for the first settlement; each gets its own bounded local zone and HQ, and settlements do not share a local map.
- **Trade between settlements** moves via **vehicle caravans** (see §8) that physically travel between settlement locations and are at risk in transit (can be ambushed).
- **Travel time is based on real-world geographic distance** between the two locations. This makes distance a genuine strategic cost and naturally incentivizes players to found new settlements near their existing network — over time forming a readable regional cluster on the globe rather than isolated, impractically-linked outposts.
- **Loss & recovery**: there is no win condition. The game ends only if all survivors across *all* owned settlements die. An individual settlement can be lost/destroyed (overrun, all its survivors killed) but can be **repopulated and rebuilt** by sending survivors/resources from another owned settlement via caravan — settlement loss is a serious setback, not a game-over.

---

## 8. Vehicles

- **Full vehicle system, in v1 scope.**
- Vehicles are found/scavenged (not starting equipment) and used for:
  - **Local scavenging/combat** — faster squad travel within a settlement's local + expedition zone, mounted weapons on armed variants, and serving as an extraction option mid-fight.
  - **Inter-settlement trade caravans** — required for moving goods between settlements (§7.5); a caravan is a vehicle + assigned squad (for protection) traveling the real-world route between two settlements.
- **Fuel is a scavenged resource** (found at gas stations, other vehicles, industrial sites) — vehicles consume fuel from the settlement's stockpile and cannot travel without it, matching the resource-pressure model of everything else in the game.
- Vehicle types to include: at minimum a basic **Car** (fast squad transport), an **Armed Truck** (mounted weapon, slower, used for both combat and caravan protection), and a **Cargo Van** (larger caravan trade capacity, no weapon).

---

## 9. Time, Weather & Seasons

- Real-time-with-pause simulation, day/night cycle — day is safer/productive (zombies dormant per §6.1), night is dangerous (zombies active).
- Weather and seasons are in v1 scope: affects zombie activity patterns (e.g. overcast/dark conditions may extend effective "night" behavior) and food production (crop yield varies by season; winter requires mitigation like a Greenhouse, researched).

## 10. Research / Tech Tree

**Full branching tech tree, in v1 scope** — gates specific buildings/upgrades rather than everything being available from the start. Concrete starting structure (branches, not exhaustive):

- **Survival branch**: Advanced Woodworking (unlocks freestanding construction) → Greenhouse (winter food security) → Water Purifier.
- **Defense branch**: Guard Tower → Floodlight Tower (requires a Generator; see §6.1) → Reinforced Palisade → Mortar Emplacement (late-game, high-cost area defense).
- **Medical branch**: Basic Clinic → Medical Lab (medicine production) → Advanced Antivirals (improves infection-cure odds at the medbay).
- **Production branch**: Workshop (typed ammunition/gear crafting) → Sawmill (Wood processing/materials efficiency) → Arms Factory (weapon crafting/upgrades).
- **Logistics branch**: Garage (vehicle repair/storage) → Fuel Refinery (better fuel yield from scavenging) → Caravan Logistics (reduces inter-settlement travel time/risk).
- **Communications branch**: Radio Antenna (increases survivor discovery/recruitment rate) → Regional Broadcast (reveals more of the expedition zone map).

Research is generated passively over time and/or via a Research Center building; specific point costs and unlock order can be tuned during prototyping, but **the branches and their gated buildings above are fixed** so the build agent isn't inventing tech tree contents from nothing.

---

## 11. Multiplayer / Shared World (future direction, not v1)

- Not built in v1, but v1's architecture should avoid decisions that would block it later:
  - Keep simulation state serializable and cleanly separated from rendering.
  - Avoid client-only authoritative state for anything that would need to be shared/synced later (resource counts, building ownership, survivor state, caravan positions).
- **Long-term vision**: the multi-settlement/trade system in §7.5 is the foundation. In single-player, all settlements on the globe belong to one player. The multiplayer evolution is the same system — settlements on a shared real-world globe, caravan trade routes based on real geographic distance — but settlements are owned by *different* players. This opens up:
  - **Alliances** between players' settlement networks.
  - **Trade deals** between players, using the same caravan mechanic as single-player.
  - **War** — raiding or attacking another player's settlement, using the same squad/vehicle/combat systems already built for zombie defense.
- No specific implementation (persistence model, real-time vs. asynchronous play, netcode, contention over the same real-world locations between players) is being locked in for v1.

---

## 12. Tech Stack

- **Frontend**: React + TypeScript, with the 3D game world rendered via a WebGL 3D engine (e.g. Three.js) in a canvas layer beneath/alongside the React UI — React handles menus/HUD/panels; the 3D engine handles the simulated world, camera, buildings, units, and combat.
- **Globe start/world-map screen**: the same or a compatible WebGL 3D approach (e.g. Three.js) with a satellite tile provider draped over a sphere. Distinct scene/mode from the in-game local-zone 3D view, but sharing the same underlying rendering stack rather than a separate library, to avoid maintaining two 3D pipelines.
- **Building geometry**: buildings extruded at runtime (or pre-processed at build/setup time) from OSM footprint polygons into 3D meshes, using OSM height/building:levels tags where available with sensible fallback defaults where not.
- **Map data**: Overpass API queries pre-processed at build/setup time into a compact custom JSON format per city, rather than live queries during play.
- **State/simulation**: centralized game state (reducer/store pattern) updated on a fixed simulation tick, decoupled from render frame rate.
- **No persistence/save system required for the prototype** — a single play session is acceptable for v1; this can be added later without changing the above architecture.

---

## 13. Visual Style & Naming

- **Art style**: flat vector/illustrated style throughout (map, buildings, units) — not pixel art, not photoreal. Applied as flat shading/textures on the 3D geometry described in §3.3, not a literal 2D art style. HUD visual identity (palette, edge treatment, typography) is specified separately in §16.2 — the two should feel like a consistent world (muted/illustrated 3D scene, torn-edge black/red/white HUD over it), not identical treatments.
- **Content naming**: full flavorful naming for all content — specific weapon names, building names, tech names — not generic placeholders like "Building Lv.2." (Specific names for individual items can be generated during content-building; the tech tree branches and building categories above give the structural skeleton these names attach to.)

---

## 14. Onboarding

- A **short guided tutorial** for first-time players is in scope for the prototype, covering at minimum: picking a location on the globe, choosing an HQ building, forming a first squad, a first scavenging run, and surviving a first night. Depth/length beyond this core sequence can be decided during prototyping.

---

## 15. Audio

Ambient/atmospheric audio and basic sound effects are in scope for the v1 prototype (not deferred):
- Ambient soundscape reflecting day/night state and the current settlement's general danger level.
- SFX for combat (gunfire, melee impacts, zombie sounds distinguishable per variant per §5.1), alerts/notifications (horde warning, outbreak detected), and key UI actions (building placed, recruitment resolved).
- Full music score, voice acting, and other audio polish are not required for the prototype and can be deferred.

---

## 16. HUD / UI / UX

### 16.1 Guiding principle
**The map dominates the screen.** The HUD is minimal and confined to the edges — this is not a dashboard with a game embedded in it, it's a game world with a thin diegetic layer of information at the margins. An AI build agent should not default to card-grid panels, rounded containers, drop shadows, or generic dashboard conventions (see §16.4) — those read as a SaaS product, not a survival game.

### 16.2 Visual identity
- **Palette**: near-black base (not pure black — something like `#0A0A0A`–`#121212`), off-white text (`#E8E8E8`, never pure white), and a single blood-red accent (`#B31217`–`#C41E1E` range) used deliberately in the header/alert chrome — not scattered decoratively across every panel.
- **Edges are torn/diegetic, never clean geometric cuts.** Panel borders, the header strip, and card edges should read as ripped/damaged material — irregular, jagged silhouettes (e.g. an SVG clip-path or mask with a torn-edge profile) — not straight lines or rounded corners. This is a deliberate, consistent visual motif, not decoration applied inconsistently.
- **Occupied/in-use buildings render with a green tint/shade** in the 3D scene itself (not just a HUD icon) — a direct visual signal of settlement activity, matching IFZ.
- **Card-style icon labels** (referencing IFZ) for squads, loot inside scouted buildings, and vehicles — small, icon-first identifier chips rather than text-heavy list rows. These cards use the same torn-edge treatment as the rest of the HUD, not a clean rounded-rectangle default.
- Typography: a characterful condensed/rough-edged display face for headers and alerts (not a clean geometric sans), a plain narrow utility face for dense data (resource counts, stat tiers).

### 16.3 Layout
- **Header strip**: small, thin — not a tall dashboard bar. Holds a stockpile readout using the game's actual resource/item categories (food supplies, water, medical supplies, fuel, ammunition, and Wood/Metal/Bricks) with trend indicators — not one collapsed generic number — plus settlement selector, day counter, time-of-day/weather icon, and pause/speed controls. Detailed inventories (specific items, weapons, food types) live in the relevant storage/squad/building sidebar panels rather than cluttering the header. Torn bottom edge per §16.2.
- **Alerts**: compact icon-based notifications anchored near the header, expandable on click; never an intrusive centered popup, never auto-pausing play.
- **Everything else lives in slidable sidebars, hidden by default**: squad details, the survivor/labor list (§4.6), build menu, tech tree, and selected-entity detail all live in edge-anchored panels that slide in on demand and slide back out — never permanently occupying map space. The player summons exactly what they need, when they need it; the rest of the time the 3D scene is unobstructed.
- **Minimap**: small, corner-anchored, minimal chrome.
- **World-map button**: a single small anchored control, opens the globe/settlement-network view (§3.4/§7.5) without ending the current session.
- **Squad selection/commands** happen directly in the 3D scene (click-select, right-click order, per §5) — not through a HUD list as the primary interaction method; the sidebar is for detail/management, not primary control.

### 16.4 Explicitly avoid
- Rounded corners or soft drop-shadows anywhere in the HUD.
- Card-grid dashboard layouts with generous padding/whitespace — the HUD should feel dense, diegetic, and edge-confined, not like a settings page.
- Generic semantic status colors (green=good/yellow=warning/red=bad used decoratively across many elements) — red is reserved specifically for danger/alert states per §16.2, not a general accent.
- A default "AI-generated web app" look: generic geometric sans fonts (Inter/Roboto), glassmorphism/blur, pastel palettes, straight-edged clean-cut panels.
- **Any component library's default card/panel/button styling** (Tailwind default cards, Material UI, Bootstrap, shadcn/ui defaults, etc.) used as-is anywhere in this UI — every HUD shape must be custom (SVG clip-path/mask or hand-authored SVG/canvas), not a styled generic container.

### 16.5 Reference standard
This must read as a professional PC strategy game HUD (the standard of *Infection Free Zone*, *Frostpunk*, *They Are Billions*, *Company of Heroes*, *Homeworld*) — not a web dashboard. The distinguishing technique in all of these is **shape language**: HUD elements are irregular, purpose-built silhouettes that look like physical objects in the game's world (a scavenged plate, a torn readout, an angular bracket) rather than rectangles with `border-radius`/`box-shadow` applied. They are information-dense with no decorative padding, and they read as belonging to the fiction rather than floating over it. A screenshot of the finished HUD should not be mistakable for a SaaS admin panel — if it is, the visual spec has not been met regardless of functional completeness.

Camera controls (§3.3): click-drag or edge-scroll to pan, scroll wheel to zoom, a dedicated rotate control (Q/E keys or modifier-drag) to orbit the 3D camera.

---

## 17. Remaining Tuning Parameters (not blocking, refine during build)

These are numeric/balance details intentionally left to be tuned during prototyping rather than locked now — none of them are open design questions, all core systems and their structure are fixed above:

**Open decision, not yet resolved (unlike the items below, this is a genuine design question):** IFZ's actual time scale compresses 1 in-game day to 1 month (a year to 12 days) — this is a deliberate IFZ mechanic, but it is also widely disliked by IFZ's own playerbase as janky and immersion-breaking. Terminus currently runs an uncompressed 24-hour day with no month/year compression. Decide explicitly whether to adopt IFZ's compressed scale (for faithfulness) or keep the current uncompressed day (a deliberate, informed divergence) — do not silently pick one.


- Exact tech tree point costs and unlock ordering within each branch (branches/buildings themselves are fixed, per §10).
- Exact Persuasion success-chance formula (system and stat are fixed, per §4.4).
- Exact morale-to-productivity and morale-to-combat-effectiveness curves (system is fixed, per §4.5).
- Exact zombie variant stat numbers (roster/behavior differences are fixed, per §5.1).
- Weather/season effects beyond crop yield and zombie activity (e.g. visibility, movement speed) — can be added post-v1 if not needed for the core loop.
- Specific default curated city list (§3.4) — which cities to launch with; free-pick works regardless.
- Exact zombie sound-detection radius values per zombie variant, and exact horde escalation curve over days (systems are fixed, per §5).
- Exact building repair costs/rates (system is fixed, per §5).
- Exact item catalogue and per-item loot quantities may be tuned, but **itemization itself is not optional**: distinct food supplies, medical supplies, weapons/gear and other scavenged supplies must remain distinct where the mechanic depends on the distinction. Ammunition remains one shared resource, with weapon-specific consumption, matching IFZ rather than introducing separate calibre stockpiles.
- Exact resource-node placement/density may be tuned during map preprocessing, but the **physical gathering-node system is fixed**: Wood from trees/vegetation, Metal from suitable vehicles/street objects such as cars and lampposts, and Bricks from rubble/brick piles.
- Exact carrying-capacity values for squads/vehicles may be tuned, but physical inventory, transport and storage transfer are fixed mechanics.
- Exact named-survivor spawn/group sizes and the probability of environmental recruitment clues may be tuned, but **recruitment groups, hidden discovery, a named leader, and general-population members are fixed mechanics**.
- Exact resource-cost/difficulty scaling for larger starting zone sizes may be tuned, but **the 3×3–5×5 size choice and its cost/difficulty tradeoff are fixed mechanics** (§3.4).

---

*This document is finalized as the build spec for the v1 prototype (§16, following, is the build prompt derived from it).*
