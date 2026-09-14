# Campaign Progression Audit (v0.3.9)

Developer-facing audit of every authored campaign mission. Its purpose: future
content must be authored **inside** the Terminus simulation — every objective
must be achievable through normal play at the moment the mission appears.

Authoritative sources for this audit: `src/data/missions/campaignMissions.ts`,
`src/data/missions/dynamicMissions.ts`, `src/data/researchTreeData.ts`,
`src/data/functionalBuildings.ts`, `src/data/factions.ts`, and the engine in
`src/services/missionService.ts`. Regression tests live in
`tests/campaignProgression.test.ts`.

## Key rules established this pass

1. **No day-only entry into the main spine.** Every main-story mission carries
   `requiresMissionsCompleted` (causal order) and real capability
   `prerequisites` (`research`, `building_any`, population, squads).
2. **`building_any` counts adapted OR constructed.** Missions must never gate
   on one construction path only (`missionService.evaluateMissionCondition`).
3. **Build objectives name the real building id** from
   `FUNCTIONAL_BUILDING_DEFINITIONS`; research objectives name real nodes from
   `RESEARCH_TREE_NODES`. Both are validated by tests.
4. **Have vs Do.** `manufacture_item` uses production-tally baselines (never
   possession). `maintain_resource` is intentionally a state-of-the-world
   check (a *reserve*). Discovery/completion always requires the real event.
5. **Campaign knowledge is global.** Lore flags live on `MissionState`
   (`narrativeFlags`), not per settlement — losing a settlement never erases
   story knowledge.

## Mission dependency matrix

Legend: Type — MS = main story, SD = settlement development, FC = faction,
BR = branch, DY = dynamic. Prereqs listed are the *real* mechanical gates.

| Mission | Chapter | Type | Trigger | Prerequisites (real) | Required research | Required buildings | Objectives → Completion | Rewards / Unlocks | Next in spine | Problems found → Changes made |
|---|---|---|---|---|---|---|---|---|---|---|
| WATERLINE (`mission_waterline`) | 1 | MS | day ≥ 3 | HQ + **research_center** (`building_any`) + **basic_sanitation researched** | basic_sanitation (unlocks water_cistern) | water_cistern (freestanding) | Construct cistern → hold 30 rainwater → survive 48 h | +4 First Aid Kits | DEAD CHANNEL | **Was day-3 main story asking for research the tutorial never taught.** Research task removed (it is now a prerequisite); reclassified briefing to "reserve growth" framing; gated on the real chain |
| DEAD CHANNEL (`mission_deadchannel`) | 1 | MS | day ≥ 5 | HQ + waterline completed + **basic_antenna researched** | basic_antenna (antenna buildable) | antenna | Build antenna → research triangulation | +3 Sci Materials | UNKNOWN TRANSMISSION | Had no research gate for its antenna build — added `basic_antenna` prerequisite |
| THE NEST (`mission_nest`) | 2 | MS | event LAIR_DISCOVERED | day ≥ 4; needs a real lair to bind | — | — | Clear lair → 25 kills | +30 Ammo; `lore_lair_research` | NIGHT MOVEMENT | OK (engine refuses to bind without a lair) |
| NIGHT MOVEMENT (`mission_nightmove`) | 2 | MS | day ≥ 6 | squad + nest cleared | — | — | Survive night → 15 kills | +20 Ammo +8 Rations; `lore_behaviour_anomaly` | THE OLD WORLD | OK |
| THE OLD WORLD (`mission_oldworld`) | 2 | MS | day ≥ 7 | squad + nightmove completed; binds a real hospital on the map | — | — | Reach hospital → search it | +6 Antibiotics +8 Kits; `lore_early_cases` | MAKING DO / THE RELAY | OK |
| MAKING DO (`mission_makingdo`) | 1→SD | SD | day ≥ 8 | **tool_factory researched** (tool_factory building) | tool_factory | tool_factory | Build Tool Factory → manufacture 10 tools | +5 Tools | SCRAP | **Was main story, gated only on pop 12** — reclassified SD, gated on its real research |
| SCRAP (`mission_scrap`) | 1→SD | SD | day ≥ 10 | **recycling researched** | recycling | scrapyard | Build Scrapyard → recover 15 scrap | +10 Metal | FIREPOWER | Same as above (`recycling`) |
| FIREPOWER (`mission_firepower`) | 1→SD | SD | day ≥ 12 | makingdo completed | pistol | arms_factory | Research pistol → build factory → produce 5 crates | +40 Ammo | — | Reclassified SD (was `campaign`/main) |
| POWER (`mission_power`) | 1→SD | SD | day ≥ 12 | **mechanics researched** (electrical_engineering chain) | electrical_engineering | generator_station | Research EE → build station → hold 20 fuel | +10 Fuel | — | **electrical_engineering requires mechanics→advanced_metalworks→tool_factory; was ungated** — gated on mechanics |
| MORE THAN SURVIVAL (`mission_morethan`) | 4→SD | SD | pop ≥ 25 | makingdo completed | — | — | Reach 30 pop → hold 30 rations | `community_established` | ORDER | Reclassified SD (was main) |
| ORDER (`mission_order`) | 4→SD | SD | flag `community_established` | pop ≥ 28 + morethan completed | — | gathering_place | Build hall → reach 32 | `order_established` | — | Reclassified SD |
| UNKNOWN TRANSMISSION (`mission_unknownsignal`) | 2 | MS | flag `lore_behaviour_anomaly` | HQ + deadchannel + nightmove completed | — | — | Contact Seekers → trade 3 sci materials | `seekers_contacted`, real contact | STRANGERS / CROSSROADS | OK (causal order was already correct) |
| STRANGERS (`mission_strangers`) | 4 | MS/BR | day ≥ 14 | pop ≥ 15 + **unknownsignal completed** | — | — | Branch: RESCUE / TRADE / REFUSE | faction standing ± | HELP / TRADE / BITTER HARVEST | **Was triggerable before any story contact** — now requires the Act II contact chain |
| STRANGERS — RESCUE/TRADE (`mission_strangers_help` / `_trade`) | 4 | BR | branch choice only | parent branch | — | — | Rescue survivors / run caravan | `helped_strangers` / `traded_strangers` | EASTERN LINE (warm path) | Marked `isMainStory: false` (branch children) |
| BITTER HARVEST (`mission_strangers_bitter`) | 4 | BR | flag `refused_strangers` + standing ≤ −15 + day ≥ 20 | refusal branch | — | — | Survive night → break 20 infected | `eastern_group_hostile` | — | **Briefing promised a raider-driven horde event that does not exist** — prose rewritten to describe what the simulation actually does (probing packs ahead of the column) |
| THE EASTERN LINE (`mission_eastern_line`) | 5 | FC | warm standing + flag | day ≥ 18 + standing ≥ 10 + helped/traded | — | — | Caravan run (repeatable) | +8 Rations +5 Metal, +standing | — | OK (standing-gated) |
| CROSSROADS (`mission_crossroads` + 4 branches) | 5 | FC | flag `lore_military_records` + pop ≥ 15 | military completed | — | — | Answer one of four frequencies → per-faction task | contact + standing | — | OK |
| SECOND CHANCE (`mission_secondchance`) | 5 | MS | day ≥ 16 | pop ≥ 25 + **expedition_center exists** + order + **military completed** | — | expedition_center | Establish 2nd settlement | `second_settlement` | THE ROAD | **Caravans require the Expedition Center; mission never demanded it** — added `building_any` gate and moved it after THE RELAY |
| THE ROAD (`mission_road`) | 5 | MS | settlement_count ≥ 2 | day ≥ 17 + secondchance completed | — | — | Caravan run | +10 Rations +8 Metal | DISTANT VOICES | OK |
| DISTANT VOICES (`mission_voices`) | 5 | FC | settlement_count ≥ 2 | day ≥ 18 + road completed | — | — | Contact Gravel Bend → hold 24 h | `greywater_contacted` | — | Reclassified FC (was main) |
| THE RELAY (`mission_military`) | 6 | MS | research triangulation **and** squad formed (event-style AND trigger) | triangulation researched + oldworld completed | triangulation | — | Reach depot → search | +5 Crates +6 Tools +15 Rations; `lore_military_records`, `lore_outbreak_timeline` | COLD STORAGE / SECOND CHANCE | **Was gated on voices (AC V) completing, a side contact, before the discovery spine could start** — prerequisite chain corrected to oldworld; trigger made capability-based instead of day 20 |
| COLD STORAGE (`mission_coldstorage`) | 6 | MS | flag `lore_military_records` + squad | military completed | — | — | Reach academic site → search | +6 Sci Materials; `lore_research_records` | THE FACILITY | OK |
| THE FACILITY (`mission_thefacility`) | 6 | MS | flag `lore_research_records` + lair discovered | coldstorage completed | — | — | Reach industrial site → search | `lore_facility_located` | CONTAINMENT | OK (lair discovery is the in-world cause) |
| CONTAINMENT (`mission_containment`) | 6 | MS | flag `lore_facility_located` + squad | thefacility completed | — | — | Clear facility perimeter → search | `lore_facility_investigated`, `lore_pathogen_nature` | THE PROTOCOL | OK |
| THE PROTOCOL (`mission_theprotocol`) | 7 | MS | flag `lore_pathogen_nature` | containment completed + pop ≥ 15 | — | — | Branch: CURE / PURGE / COEXISTENCE | faction shifts | one of three branches | OK |
| PROTOCOL — CURE (`mission_protocol_cure`) | 7 | BR | parent branch only | protocol choice | drugs_production (new task) | hospital (new task) | Samples → protocol research → hospital → demonstration → hold 48 h | `campaign_resolved: cure` | — | **Was "research basic_sanitation + survive 72 h" — a repeat of an early-game task.** Rebuilt as a treatment-programme chain using existing scavenge/research/build/medical mechanics |
| PROTOCOL — PURGE (`mission_protocol_purge`) | 7 | BR | parent branch only | protocol choice | — | shooting_range, fortified_tower (new tasks) | Doctrine (range) → 2 lairs → fortified tower → 60 kills | `campaign_resolved: purge` | — | Kills/lairs alone didn't express "eradication as a future". Now doctrine-first with territory to hold |
| PROTOCOL — COEXISTENCE (`mission_protocol_coexistence`) | 7 | BR | parent branch only | protocol choice | — | — | 2 settlements → caravan → **keep 3 faction channels of trust** → hold network 72 h | `campaign_resolved: coexistence` | — | Settlement+caravan could be pre-completed; added trust-channel (`pn3_allies`) and endurance proof (`pn4_endure`) as *new* work |

### Dynamic missions (separate from authored campaign)

`mission_dyn_distress`, `mission_dyn_medical`, `mission_dyn_food`,
`mission_dyn_lair`, `mission_dyn_power` — unchanged. They trigger from real
simulation conditions (scarcity triggers, LAIR_DISCOVERED,
SURVIVOR_DISCOVERED events) with repeat cooldowns, and are mutually exclusive
with the overlapping authored mission where relevant (`mission_dyn_lair` vs
`mission_nest`). They never advance the main story.

## Final structure

```
ACT I — SURVIVAL
  WATERLINE (MS)
    ├─ MAKING DO / SCRAP / FIREPOWER / POWER (SD)
    └─ DEAD CHANNEL (MS)
ACT II — SOMETHING IS WRONG
  THE NEST → NIGHT MOVEMENT → THE OLD WORLD (MS)
  UNKNOWN TRANSMISSION (MS — Seekers contact)
    ├─ STRANGERS → RESCUE / TRADE (BR) or BITTER HARVEST (BR, refusal)
ACT III — PEOPLE
  MORE THAN SURVIVAL → ORDER (SD)
ACT IV — THE NETWORK
  CROSSROADS + 4 faction ops (FC)
  THE RELAY (MS) → SECOND CHANCE → THE ROAD (MS)
    ├─ THE EASTERN LINE (FC, repeatable) · DISTANT VOICES (FC)
ACT V — THE TRUTH
  COLD STORAGE → THE FACILITY → CONTAINMENT (MS)
ACT VI — WHAT COMES NEXT
  THE PROTOCOL (MS) → CURE / PURGE / COEXISTENCE (BR)
```

## Remaining known limitations

- PURGE's `pp3_perimeter` requires `advanced_masonry` research (fortified
  tower) — reachable in the construction tree but not gated into the branch
  prerequisites; a player picking PURGE without masonry progress will research
  it mid-mission.
- Faction *operations* beyond the Crossroads one-shots remain thin; the
  faction arc currently deepens via standing-gated transmissions (cutoff /
  restore) rather than repeatable faction missions.
- Radio repetition: DEAD CHANNEL / UNKNOWN TRANSMISSION / DISTANT VOICES /
  THE RELAY were de-duplicated narratively this pass, but a dedicated "the
  radio evolves" pass over transmission cadence is still worthwhile.
- (Resolved during this pass) `pn3_allies` was originally a bare `custom`
  task, which the engine would never auto-complete — COEXISTENCE would have
  been uncompletable. The engine now supports structured custom tasks with a
  typed `minContacts` field evaluated against real `contactedFactionIds`
  (see `missionService.evaluateTask`).
