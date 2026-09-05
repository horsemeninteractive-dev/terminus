# Terminus Mechanics Integrator

When implementing a feature, integrate it into the actual Terminus simulation instead of building an isolated approximation.

## Impact trace
Consciously inspect:
1. data/types
2. trigger/input
3. authoritative system
4. state mutation
5. domain event
6. simulation/offline behaviour
7. save/load
8. UI
9. mission interaction
10. tests

Not every feature needs every layer, but verify each one.

## Example: rescue survivors
Correct:
survivor encounter -> rescue action -> survivor state change -> SURVIVOR_RESCUED -> relevant population/state update -> mission progress -> persistence -> UI

Incorrect:
mission progress += 1

## Existing systems first
Search for existing functionality before creating a new service. Extend the authoritative system where possible.

## No fake integrations
Avoid mission-specific shortcuts such as `if (missionId === ...)`. Domain events should describe real game actions, not what one mission wants to hear.

## Event design
Prefer semantic events such as:
- BUILDING_CONSTRUCTED
- BUILDING_SCAVENGED
- RESOURCE_ACQUIRED
- RESOURCE_PRODUCED
- SURVIVOR_RESCUED
- SURVIVOR_RECRUITED
- LOCATION_REACHED
- RESEARCH_COMPLETED
- ITEM_MANUFACTURED
- CARAVAN_DISPATCHED
- CARAVAN_ARRIVED
- FACTION_CONTACTED
- SETTLEMENT_ESTABLISHED

Do not make core simulation emit mission-specific events.

## Regression awareness
After modifying a system, inspect effects on missions, statistics, UI, persistence, offline simulation, AI and settlement calculations.

A feature is not complete merely because the UI appears and TypeScript compiles. The real game state must change correctly.
