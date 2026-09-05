# Terminus Simulation Integrity

Protect Terminus from false or inferred game-state logic.

## Fundamental rule
Always ask:

> What actual player/world action caused this state change?

Actions and resulting state are not interchangeable.

Examples:
- possessing 10 Scrap does not prove 10 Scrap was scavenged
- possessing 10 Ammo Crates does not prove they were manufactured
- having two settlements does not prove faction contact
- a building existing does not prove it was constructed after a mission began
- discovering a survivor does not prove they were rescued or recruited
- searching a building does not prove a squad travelled there

## State vs action
Use state checks for objectives such as:
- maintain 100 Food
- have a Research Center
- keep population above 20

Use event/history/baseline checks for:
- scavenge 15 Scrap
- manufacture 10 Tools
- recruit 5 survivors
- contact a faction
- construct a building after mission activation

If wording is ambiguous, make semantics explicit in the data model.

## Baselines
For action objectives, capture a mission/task start point or event sequence/cursor. Historical progress should not be lost when inventory is later consumed.

## Entity identity
Prefer stable IDs:
- buildingId
- lairId
- squadId
- settlementId
- caravanId
- survivorGroupId
- factionId

## Offline simulation
Correctness must survive:
- offline catch-up
- multi-hour simulation
- day/night transitions
- save/load between events

Use authoritative event history where possible and snapshot reconciliation as a fallback.

## Idempotency
Protect against duplicate events, repeated UI actions, save/load replay and repeated simulation updates. Rewards must never be granted twice.

## Determinism
Mission evaluation should not introduce hidden random behaviour. The same state/history should produce the same result.
