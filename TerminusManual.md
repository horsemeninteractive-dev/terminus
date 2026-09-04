# TERMINUS — OPERATOR'S MANUAL

**Version 0.2.1 (BETA+)**

*A real-world survival strategy. The streets you defend are real streets. The buildings you fortify are real buildings. Nothing here was built for you — everything has to be taken.*

---

## HOW TO USE THIS MANUAL

This manual is written for the player in the field — the **Chief Operator** of a settlement that did not exist a week ago. It is organised the way a real doctrine manual is:

- **Chapters 1–3** get you from a cold start to a running colony.
- **Chapters 4–12** cover each system in depth: population, combat, economy, buildings, power, water, research, weather, vehicles.
- **Chapters 13–17** cover the wider world: expeditions, trade, factions, the radio campaign, and persistence.
- The **appendices** are quick-reference tables.

Terms that appear in the game's UI are written in CAPITALS on first use. Values given here are accurate for version 0.2.1.

---

# PART I — FIRST DEPLOYMENT

## 1. THE WORLD

TERMINUS takes place on **real city maps** built from OpenStreetMap data. Every footprint on the map corresponds to a real structure, rendered in 3D with elevation, satellite imagery, and street networks.

### 1.1 Zones

When you start a new game you choose a **zone size**, which defines how much of the city you control and how hard the world is:

| Zone | Grid | Footprint | Rating | Notes |
| --- | --- | --- | --- | --- |
| TACTICAL OUTPOST | 3×3 | 900 m × 900 m | ★★ | Compact foothold, tight defensive perimeter |
| DISTRICT STRONGHOLD | 4×4 | 1.2 km × 1.2 km | ★★★ | Balanced 16-sector district |
| METROPOLIS BASTION | 5×5 | 1.5 km × 1.5 km | ★★★★★ | Heavy logistics overhead, maximum salvage |
| REGIONAL FORTRESS | 7×7 | 2.1 km × 2.1 km | ★★★★★★ | Large jurisdiction, broad supply routes |
| PROVINCIAL CAPITAL | 9×9 | 2.7 km × 2.7 km | ★★★★★★★★ | The full sandbox. Bring a plan. |

Larger zones multiply construction costs and expose far more perimeter. Start small; expand when your colony can afford the walls.

### 1.2 Map presets

Eight real-world zones ship with the game: **Oxford, Berlin Mitte, London Soho, Paris Cité, Rome Centro, Tokyo Shibuya, San Francisco, and Evesham**. Each has different street layouts, building mixes, and scavenging potential. A dense commercial district is a scavenger's paradise and a defender's nightmare; a residential suburb is easier to hold but leaner pickings.

### 1.3 The day the world ended

Your settlement begins as a single decision: which building becomes the **HEADQUARTERS**. From that moment the settlement has a heart — storage, bunk space, and a command structure. If the HQ falls, the settlement collapses. Choose well: large, solid, centrally located.

---

## 2. FIRST-TIME PROTOCOL (THE TUTORIAL)

A new game opens with the **First-Time Protocol** — five radio directives from Recon Lead Sgt. Vance. Follow them; they teach the core loop:

1. **ESTABLISH COLONY HEADQUARTERS** — click a real building on the 3D map and designate it as Command HQ. Bigger buildings mean more initial bunk capacity and defence; masonry beats timber.
2. **FIND YOUR FIRST SURVIVORS** — survivor groups are *not* map markers. Watch for chimney smoke, investigate buildings inside your settlement's vision, and make contact. The group's leader becomes a NAMED SURVIVOR; the rest join the general population.
3. **ASSEMBLE TACTICAL FIRETEAM** — open the Squads panel and form your first 4-person squad. Choose a leader, allocate members, and assign weapon loadouts.
4. **FIRST SCAVENGING SORTIE** — select your squad, then click a destination building. Squads are real units: they must physically travel before a building can be searched. Right-click is a move order; clicking a lootable building starts a search.
5. **SURVIVE NIGHTFALL INCURSION** — at DUSK (19:00) infected roaming accelerates; at NIGHTFALL (21:00) a coordinated horde strikes. Hold the perimeter until DAWN (05:00) of Day 2.

Complete the protocol and the colony becomes fully autonomous: research, production, trade, and the campaign all unlock.

---

## 3. CONTROLS & INTERFACE

### 3.1 Keyboard

| Input | Action |
| --- | --- |
| Left-click | Select building / squad / unit / issue order |
| Right-click | Move order / context action |
| Mouse wheel | Zoom camera |
| Drag | Pan camera |
| `ESC` | Deselect → close current panel → Pause menu |
| `SPACE` | Pause / resume simulation |
| `1` / `2` / `3` / `4` | Time speed 1× / 2× / 4× |
| `F5` | Quick save |
| `F9` | Quick load |
| `B` / `W` / `H` | Action bar: Buildings / Fortifications & Walls / Area Works |

### 3.2 The HUD

- **Header strip (top)** — date, clock, time controls (SPACE, 1–4), population, and quick access to Squads, Population, Research, Vehicles, Laws, and Settings panels.
- **OPERATIONS tracker (top-left)** — active directives, campaign missions, pending radio briefings, faction standings, and the completed-operations archive.
- **Resource stockpile bar** — live counts of every material, food, medical, fuel, ammo, and water stock.
- **Tactical action bar (bottom)** — Buildings (`B`), Fortifications & Walls (`W`), Area Works (`H`), and squad management.
- **Minimap (bottom-right)** — radar view; toggle for street labels, outlines, and layer overlays from the VIEW LAYERS control.
- **Expedition toggle** — switches between the 3D tactical world and the 2D strategic map/globe.
- **PUSH TO TALK** — the radio. Incoming transmissions queue here: decrypt, read, and respond.
- **Colony alert stream** — milestone, warning, and emergency notifications from the simulation.

---

# PART II — THE COLONY

## 4. POPULATION & SURVIVORS

### 4.1 Who your people are

- **NAMED SURVIVORS** — individuals with names, skills, and backgrounds. They lead squads, staff key buildings, and drive quality.
- **GENERAL POPULATION** — the anonymous workforce. They farm, build, produce, and keep the settlement alive.

Population grows by **recruiting survivor groups** (found in the field), **rescuing stranded groups**, and natural growth when morale is healthy. Population is the engine of everything: more hands, more production, more research, more mouths.

### 4.2 Morale

Morale is the settlement's mental state, and it governs work speed, combat resolve, and growth:

- **High morale** boosts work speed, squad accuracy, and passive growth.
- **Low morale** causes strikes, desertion risk, and sluggish performance.

Morale is driven by **food diversity, adequate housing, safety, amenities, and recent events**. The quickest ways to destroy it: let people sleep in the cold, feed them one thing, or lose a night to the horde. The quickest ways to build it: SHELTERS and HOUSES, a COOKHOUSE serving real meals, a BAR, and a KINDERGARTEN for the children.

### 4.3 Housing

Every citizen needs a bed:

- **SHELTER** — bunkhouse capacity that scales with the building's real floor area. Prevents the severe "homeless" morale penalty.
- **HOUSE** — improved residences with a mood bonus.
- **SQUAD QUARTERS** — housing plus squad capacity for the militia.

### 4.4 Infection & medical triage

Bites and scratches introduce the pathogen. Untreated, a survivor progresses from *exposed → feverish → lethargic → aggressive outbreak* — a turning infected *inside your walls*.

- **QUARANTINE** — move symptomatic survivors to isolation in a MEDBAY or HOSPITAL before they turn.
- **TREATMENT** — MEDBAYS and HOSPITALS treat wounds, infection, and severe trauma, with beds, nurses, and power-driven efficiency. First-aid kits are produced here.
- **RESEARCH** — the Infection branch (early diagnosis, symptomatic treatment, vaccine, turning prevention) is the long-term answer.

---

## 5. SQUADS & COMBAT

### 5.1 Fireteams

Squads are 4-person units formed from named survivors and workforce. Each squad has a **leader** (their background matters — a combat veteran grants accuracy and suppression bonuses) and a **loadout** you assign per member.

Squad capacity comes from **HQ, SQUAD QUARTERS, and towers/gates with sentry capacity**. The primary starting HQ commands a **fixed complement of 2 squads** — no matter how vast the building, the first HQ is a command post, not a barracks. Additional HQs and Squad Quarters scale with their size.

### 5.2 Weapons

Weapons have real profiles — damage, range, fire rate, and ammunition per volley:

| Weapon | Damage | Range (m) | Fire rate | Ammo/volley | Tier |
| --- | --- | --- | --- | --- | --- |
| Combat Knife | 10 | 8 | 1.8/s | — | 0 |
| Baseball Bat | 12 | 9 | 1.7/s | — | 1 |
| Fire Axe | 14 | 9 | 1.9/s | — | 2 |
| Bow | 15 | 40 | 2.5/s | — | 2 |
| Pistol | 16 | 28 | 1.3/s | 1 | 3 |
| Pump Shotgun | 22 | 22 | 1.6/s | 2 | 4 |
| Hunting Rifle | 26 | 42 | 1.9/s | 2 | 5 |
| Assault Rifle | 28 | 36 | 1.1/s | 3 | 6 |
| Sniper Rifle | 32 | 52 | 2.2/s | 1 | 7 |
| Heavy Machine Gun | 34 | 42 | 1.0/s | 3 | 8 |

**Combat rules of thumb:**

- **Range and line of sight decide fights.** Assault rifles dominate mid-range; sniper rifles dominate the long field; pistols are close-quarters weapons.
- **Ammunition is a resource.** Ammo crates, production lines, and scavenged caches all feed the pool. Every volley spends it.
- **Noise attracts.** Gunfire has a sound radius that pulls nearby infected. Silent melee and bows exist for a reason.
- **Training improves skill.** A SHOOTING RANGE lets squads train — ammunition in, competence out.
- **Armour protects.** The PROTECTIVE GEAR FACTORY manufactures Protector vests, Riot Gear, and Plate Armor as research unlocks.

### 5.3 The defence layer

The infected are stopped by the perimeter you build:

- **WALLS** — WOODEN PALISADE, METAL FENCE, BRICK WALL, FORTIFIED WALL. Walls block movement and are repaired by a REPAIRMEN SHOP.
- **GATES** — WOODEN GATE, METAL GATE, FORTIFIED GATE. Block the infected, let your people through, and can be staffed with guards. Fortified gates carry more sentry capacity.
- **BARBED WIRE** — does not block movement; it *slows* and *damages* anything walking through it.
- **TOWERS** — WOODEN, METAL, and FORTIFIED towers are garrison points: staff them, mount weapons, and they become firing positions. FLOODLIGHT TOWERS illuminate the night, suppress the horde, and improve accuracy in the dark — but they draw power.
- **SIEGE** — a battered wall degrades visibly and must be rebuilt. Keep repair capacity ahead of the horde.

### 5.4 Lairs & the night horde

Infected are not random. They gather in **LAIRS** — buildings where they muster, leave in groups, and return. A neglected lair **grows**, feeding the nightly incursion with real population. Find lairs, assess them, and clear them with force: breach, kill every infected inside, and hold the surrounding streets. Clearing lairs removes the source of hordes; ignoring them escalates the pressure.

---

## 6. RESOURCES & THE ECONOMY

### 6.1 The stockpile

The colony stockpiles resources in six sections:

| Section | Resources |
| --- | --- |
| **Materials** | Wood, Metal, Bricks, Tools, Fertilizer, Scientific Materials, Clay, Logs, Scrap |
| **Food** | Fresh Harvest, Dried Rations, Canned Goods, MRE Rations, Grain, Raw Meat |
| **Medical** | First Aid Kits, Sterile Bandages, Antibiotics, Painkillers |
| **Fuel** | Gasoline, Diesel, Biofuel |
| **Ammo** | Shared ammunition pool, Crates |
| **Water** | Rainwater, Purified Water, Bottled Water |

The **primary HQ holds a fixed 850 storage units** — that capacity is deliberate, and it is the same for every starting HQ regardless of size. WAREHOUSES extend the shared storage pool, and the whole network (HQ + warehouses) is a single inventory that squads draw from and return to.

### 6.2 Production chains

The economy runs on real input/output recipes. Selected examples:

- **FIELD / VAST FIELD** — outdoor grain production (base 4/day; fertilizer raises a field to ~7/day). Adverse weather hits outdoor yields.
- **GREENHOUSE** — all-weather crop production; immune to outdoor weather penalties. Essential for winter.
- **BARN / LIVESTOCK PEN** — 2 Grain → 2 Raw Meat + 1 Fertilizer.
- **COOKHOUSE** — 2 Grain + 1 Wood → 4 Food Rations, or 2 Raw Meat + 1 Wood → 5 Food Rations. This is where food becomes morale.
- **CANNERY** — 1 Food Ration + 1 Metal → 1 Canned Good. Canned goods store long and count toward reserve missions.
- **FORESTER'S HUT** — produces logs from the surrounding tree cover.
- **SAWMILL** — 10 Logs → 16 Wood.
- **TOOL FACTORY** — tools from wood + metal; tools accelerate construction and production.
- **SCRAPYARD** — 10 Scrap → 14 Metal. Scrap comes from dismantling the ruins around you.
- **CHEMICAL PLANT** — wood and fuel are interchangeable feedstock: 2 Wood → 1 Fertilizer, 1 Fuel → 3 Fertilizer, 6 Wood → 1 Fuel, 3 Fertilizer → 1 Fuel.
- **CLAY PIT & KILN** — clay to bricks (wood-fired).
- **ARMS FACTORY** — ammunition crates plus the full weapon line: Pistol, Shotgun, Assault Rifle, Sniper Rifle, Heavy Machine Gun. Research each weapon to unlock its production line.
- **PROTECTIVE GEAR FACTORY** — Protector vest, Riot Gear, Plate Armor lines.
- **VEHICLE WORKSHOP** — fabrication, repair, and dismantling of vehicles in dedicated bays, with progressive material consumption.

A building with multiple recipes runs the **selected recipe only**. If nothing is selected, production asks you to choose — it will not silently swap lines when inputs run dry.

---

## 7. BUILDINGS: ADAPTATION & CONSTRUCTION

### 7.1 Adaptation

Adaptation is the heart of TERMINUS: **every real building on the map can be repurposed.**

- Select a building → open the Buildings action → choose the functional use.
- **Cost scales with the real building's footprint** — adapting a terraced house is cheap; converting a five-storey office block is a serious engineering project — but the larger building also delivers more capacity.
- **Partial adaptation** is a real mechanic: you can adapt a portion of a building's footprint, painting the coverage directly onto the structure. The adaptation fill visibly tracks what you select. Full adaptation needs no painting at all.
- Some facilities are **purpose-built** rather than conversions. WATER CISTERNS, GENERATOR STATIONS, and BATTERY BANKS are freestanding infrastructure gated by research — you do not "find" a generator in an ordinary house.

### 7.2 Freestanding construction

Purpose-built structures are placed on open ground with their own footprints — no more generic 8×8 boxes. Category examples:

| Category | Structures |
| --- | --- |
| **Basic** | Shelter, House, Warehouse, Squad Quarters, HQ |
| **Food** | Field, Vast Field, Greenhouse, Barn, Cookhouse, Cannery |
| **Production** | Forester's Hut, Sawmill, Tool Factory, Scrapyard, Arms Factory, Chemical Plant, Protective Gear Factory, Vehicle Workshop, Clay Pit |
| **Defence — walls** | Barbed Wire, Wooden Palisade, Wooden Gate, Metal Fence, Metal Gate, Brick Wall, Fortified Wall, Fortified Gate |
| **Defence — towers** | Wooden Tower, Metal Tower, Fortified Tower, Floodlight Tower |
| **Utility** | Antenna, Research Centre, Weather Centre, Medbay, Hospital, Repairmen Shop, Shooting Range, Expedition Centre, Water Cistern, Generator Station, Battery Bank |
| **Civilian** | Kindergarten, Bar, Gathering Place, Mast |

Research gates most freestanding construction (see Chapter 9).

### 7.3 Staffing & operations

Many facilities need **assigned workers** to run: farmers in fields, cooks in cookhouses, nurses in medbays, scientists in research centres, guards on towers and gates. Buildings contribute only while they are *operational* — staffed, powered (where required), and intact. Damaged structures lose efficiency until the REPAIRMEN SHOP's crews restore them.

---

## 8. POWER & WATER

### 8.1 Power

Civilisation runs on electricity, and electricity runs on fuel.

- **GENERATOR STATION** — burns fuel (gasoline, diesel, biofuel) from its internal tank, which it refills from the stockpile, and radiates a power radius over surrounding facilities. Generators run when demand exists — powering facilities only when they need it preserves fuel.
- **BATTERY BANK** — a power-system upgrade (research: Battery Storage). Generators charge batteries during surplus; a charged battery then acts as a **grid extension / emergency reserve**, keeping critical facilities alive when fuel runs out.
- **Priority shedding** — when generation falls short, the grid sheds loads by priority band so the hospital stays up while the decorative lighting does not. The power radius and powered/unpowered status of every consumer are visible on the tactical map (toggle the Power Grid layer).

### 8.2 Water

Water is a settlement-wide system, not an afterthought:

- **WATER CISTERN** — freestanding, research-gated (Basic Sanitation) infrastructure that collects rainwater into a reserve.
- **Demand model** — the colony's water demand is calculated from population *and* the facilities that consume water (medbay beds, vehicle workshops, tool factories, shooting ranges). Consumption follows that model — if the reserve is short, the settlement visibly degrades: shortage days accumulate and morale suffers.
- Purified and bottled water supplement the cistern; keeping potable water flowing keeps the colony healthy.

---

## 9. RESEARCH

The research tree runs on **Scientific Materials** produced by the RESEARCH CENTRE, and every project is worked by your scientists — more centres and more staff accelerate progress.

**Eight branches:**

| Branch | Focus | Example nodes |
| --- | --- | --- |
| **Medicine** | Field care, pharmacy, surgery | Medical Care → Drugs Production → Surgery → Clinical Efficiency |
| **Communication** | Radio, detection, scouting | Basic Antenna → Weather Forecast → Triangulation → Long-Range Antenna |
| **Chemistry** | Fuels, fertilizers, ordnance | Chemistry → Fertilizer Production → Manufacturing of Fuels → Biofuel → Explosives |
| **Arms Production** | Firearms & ordnance | Pistol → Assault Rifle → Shotgun → Sniper Rifle → Heavy Machine Gun → Mortar |
| **Construction** | Water, forestry, engineering | Basic Sanitation → Rainwater Harvesting → Tool Factory → Advanced Masonry → Electrical Engineering → Battery Storage |
| **Food** | Agriculture & preservation | Farming → Fishery → Greenhouses → Food Preservation → Fermentation → Efficient Cooking |
| **Infection** | The virus itself | Early Diagnosis → Symptomatic Treatment → Vaccine → Turning Prevention |
| **Education** | Training & leadership | Survival Training → Combat Training → Nursery → Scientific Apprenticeship → Archery Techniques |

Research gates buildings (a GENERATOR requires Electrical Engineering; the CISTERN requires Basic Sanitation; GREENHOUSES require Greenhouses research) and unlocks the weapon and armour production lines.

---

## 10. WEATHER & SEASONS

Weather is simulated day to day and matters:

- **Forecasts** — a WEATHER CENTRE (research: Weather Forecast) provides a multi-day outlook, so you can plan outdoor work and scavenging windows.
- **Outdoor penalties** — rain, storms, heat, and snow hurt outdoor production (fields, forestry) and can ground scavenging.
- **Seasons** — winter freezes outdoor yields and drives up heating/fuel demand. Greenhouses and stockpiled reserves are the winter strategy.
- The seasonal/weather modal reports conditions, and the header shows live temperature and sky state.

---

## 11. VEHICLES

Abandoned cars, SUVs, and vans sit across the street network:

- **Find** them on the map; **repair** them at a VEHICLE WORKSHOP (bays + materials); **fuel** them from the stockpile.
- **Mounted squads** move fast, haul bulk cargo, and fire from the vehicle. A transport van can carry a scavenging haul that a squad alone could never manage.
- **Movement is real** — vehicles path along actual road networks. Running out of fuel in the dark strands your squad in horde country.
- **Dismantling** recovers materials from wrecks you cannot or will not repair.
- A vehicle that is *not* mounted cannot be driven — select a squad and mount it first.

---

# PART III — THE WIDER WORLD

## 12. EXPEDITION & MULTI-SETTLEMENT

The tactical map is one piece of a wider world:

- **Expedition view** — toggle between the 3D tactical world and the strategic map/globe. From the globe you can survey other zones, plan, and dispatch forces.
- **CARAVANS** — dispatch armed supply caravans between settlements. They travel over days, need escorts (bandits and hordes prey on weak convoys), and exchange surplus between towns.
- **A second settlement** (research the Expedition Centre, then establish a new site) turns a fragile colony into a **network** — two towns can cover each other's shortages.
- **Supply lines** — a road mission proves the route; repeatable trade missions keep it warm. Logistics is what separates a network from two camps.

---

## 13. FACTIONS & THE RADIO

### 13.1 The radio

The radio is how the world talks to you:

- **PUSH TO TALK** opens the console. Incoming transmissions queue; each has a callsign, classification, frequency, and timestamp.
- Transmissions range from SITREPs and INTEL to WARNINGS and EMERGENCIES. Some are informational; some are **briefings** that demand a response.
- **The archive** keeps every transmission: filter by read status, category (MISSIONS / DIRECTIVES / INFO), classification, and outcome (DECLINED), and replay past traffic.

### 13.2 Factions & standings

The radio has voices, and voices have memories:

- **SZO NETWORK** — your patron network (Sgt. Vance, Scout Miller, Command). It grumbles but never cuts the line.
- **GRAVEL BEND** — a long-range settlement on the gravel band, contacted through the campaign.
- **EASTERN GROUP** — a fortified survivor group in the eastern blocks, encountered mid-campaign.

Every faction has a **standing** (−100 to +100) that your choices move. Help a faction and it warms; refuse its requests and it cools. Each faction has a **cutoff threshold** — cross it and that faction breaks contact permanently (or until you mend the bridge): its offers stop arriving, and a contact-lost transmission marks the moment. The OPERATIONS tracker shows every faction's posture (WARM / NEUTRAL / COLD / CONTACT LOST), and later content is gated on what you did: burnt bridges come back — sometimes as raids.

### 13.3 Rival factions

Not everyone is reachable by radio. **IRON VULTURES** and **BLACKOUT MARAUDERS** hold hideouts, raid supply lines, and take captives. A squad defeated by a hideout is **captured, not killed** — ransom them with food, or rescue them by force.

---

## 14. THE CAMPAIGN: DIRECTIVES, MISSIONS & TASKS

### 14.1 The flow

The campaign is not a quest list — it is a radio conversation:

> **Something happens in the world → a transmission arrives → you respond → a mission is created → real game state completes its tasks → a follow-up transmission closes the loop.**

Missions are **never** created silently by the simulation. You always get the transmission first, and the choice is yours.

### 14.2 Chapters

The main campaign unfolds in six chapters:

- **CHAPTER I — A PLACE TO LIVE** (OP-WATERLINE, OP-DEADCHANNEL)
- **CHAPTER II — THE DEAD AREN'T RANDOM** (OP-NEST, OP-NIGHTMOVEMENT, OP-OLDWORLD)
- **CHAPTER III — BUILDING SOMETHING THAT LASTS** (production, power, the fortress)
- **CHAPTER IV — PEOPLE** (OP-MORETHAN, OP-ORDER, OP-STRANGERS and its consequences)
- **CHAPTER V — THE NETWORK** (OP-SECONDCHANCE, OP-ROAD, OP-VOICES, the Eastern Line)
- **CHAPTER VI — THE WIDER WORLD** (OP-WIDERWORLD and beyond)

Alongside the main story, **dynamic missions** emerge from real pressure: distress calls, medical shortages, food crises, lair threats, power failures. Respond or don't — the simulation does not wait.

### 14.3 Task types

Tasks are evaluated against **real game state** — no fake counters:

- **Build** a facility · **adapt** a building · **research** a technology
- **Reach** a population threshold · **survive** for N hours/days
- **Maintain** a resource above/below a bound
- **Eliminate** N infected (counted against the colony-wide kill tally) · **clear** a lair
- **Deliver** resources · **establish** a settlement · run a **caravan**
- **Contact** a faction · **rescue/recruit** survivors

The OPERATIONS tracker shows live progress on every active mission (e.g. "12/48 hours survived") and surfaces FOCUS/LOCATE action buttons that jump you to the relevant screen.

---

## 15. SAVE, LOAD & PERSISTENCE

- **Quick save** — `F5`. **Quick load** — `F9`. Manual saves live in the SAVE/LOAD panel.
- **The world keeps running while you're away.** When you resume, the offline simulation catches the settlement up — resources were consumed, hordes may have come, missions progressed — using the same simulation as live play. A long-away player cannot come back to a dry colony through a mismatch: offline consumption uses the same demand models as the live tick.
- **Extinction** — if the colony falls completely, the game offers a restart with the world knowledge carried forward. The campaign's narrative flags persist across attempts.

---

# PART IV — FIELD NOTES

## 16. OPERATOR TIPS

1. **The first 48 hours decide the run.** HQ → survivors → one squad → one scavenge → survive the night. Do not research your way into Day 2.
2. **Housing before morale.** Unhoused citizens are a morale bomb. Shelter early, House later, Bar and Kindergarten once the population justifies it.
3. **Fuel is power, power is life.** Chain: Chemical Plant → Biofuel → Generator → Battery Bank → floodlights. A hospital that loses power at night is a hospital that loses patients.
4. **Lairs are organs, not scenery.** Scout them, count them, clear them. The horde you see at night came from somewhere — take that somewhere away.
5. **Ammunition is a factory output.** If you rely on scavenged bullets, you have a scavenging job, not an arsenal. Arms Factory + ammo crates is a permanent war economy.
6. **Gates are bottlenecks.** One fortified gate with guards beats three unguarded doors. Keep walls repaired — damage states are visible for a reason.
7. **Talk back to the radio.** Declining a faction saves resources today and buys consequences tomorrow. Both are real choices; neither is free.
8. **The map is the strategy.** A supermarket in your zone is a warehouse. A hospital is a medbay. A police station is a search target for the campaign's sealed depot. Look at what is actually there.
9. **Winter is a test of the summer.** Fields freeze; greenhouses and stockpiles do not.
10. **Quicksave is a habit, not a crutch.** F5 before a big move; F9 after a disaster. The simulation is honest, but it is also merciless.

---

## APPENDIX A — HOTKEY REFERENCE

| Key | Action |
| --- | --- |
| `SPACE` | Pause / resume |
| `1` `2` `3` `4` | Time speed 1× / 2× / 4× |
| `ESC` | Deselect / close panel / pause menu |
| `F5` | Quick save |
| `F9` | Quick load |
| `B` `W` `H` | Buildings / Fortifications / Area Works |

## APPENDIX B — BUILDING CHEAT SHEET

**Adapt (convert real buildings):** Headquarters, Squad Quarters, Warehouse, Shelter, House, Cookhouse, Cannery, Forester's Hut, Sawmill, Tool Factory, Scrapyard, Arms Factory, Chemical Plant, Protective Gear Factory, Vehicle Workshop, Clay Pit, Antenna, Research Centre, Weather Centre, Medbay, Hospital, Repairmen Shop, Shooting Range, Expedition Centre, Kindergarten, Bar, Gathering Place.

**Freestanding (purpose-built):** Field, Vast Field, Greenhouse, Barn, all walls/gates/wire, all towers (incl. Floodlight), Water Cistern, Generator Station, Battery Bank, Mast.

**Research-gated infrastructure:** Water Cistern (Basic Sanitation), Generator Station (Electrical Engineering), Battery Bank (Battery Storage), Greenhouse (Greenhouses), and every weapon/armour production line.

## APPENDIX C — CAMPAIGN OP-CODES

| Code | Chapter | Name |
| --- | --- | --- |
| OP-WATERLINE | I | Reserve pressure dropping |
| OP-DEADCHANNEL | I | Unregistered signal |
| OP-NEST | II | Organised contact reported |
| OP-NIGHTMOVEMENT | II | Enhanced nocturnal activity |
| OP-OLDWORLD | II | Medical cache on grid |
| OP-MORETHAN | IV | We are a town now |
| OP-ORDER | IV | A town needs rules |
| OP-STRANGERS | IV | The eastern blocks |
| OP-SECONDCHANCE | V | A viable site on the grid |
| OP-ROAD | V | Supply lines |
| OP-VOICES | V | Another operator on the band |
| OP-WIDERWORLD | VI | Sealed military depot |

---

*This manual is a living document. Version 0.2.1 — updated with the colony, campaign, and faction systems current at this build.*

**© 2026 Horsemen Interactive. All rights reserved.**