# Terminus Gameplay Verifier

Convert natural-language gameplay requirements into precise, testable mechanics.

## For every objective determine
1. What must the player actually do?
2. What authoritative action represents it?
3. What evidence proves it happened?
4. What evidence must not count?
5. When does counting begin?
6. What entity does it apply to?

## Example
"Scavenge 15 Scrap" means qualifying scavenging after task activation.

It must not be satisfied by:
- starting inventory
- traded Scrap
- manufactured Scrap
- caravan-delivered Scrap
- simply possessing 15 Scrap

## Useful distinctions

| Objective | Preferred evidence |
|---|---|
| Maintain food | current resource state |
| Scavenge scrap | scavenging/acquisition event after baseline |
| Manufacture tools | manufacturing event after baseline |
| Reach location | arrival/proximity event |
| Discover location | discovery event/state |
| Search building | search action/state |
| Recruit survivor | recruitment event |
| Rescue survivor | rescue event |
| Contact faction | faction contact event/state |
| Construct building | construction event after baseline |

## Suspicious implementations
Flag:
- `if (inventory >= target)` for action objectives
- counts used as proxies for interactions
- broad string matching
- global state used for target-specific objectives
- current state used without a mission-start baseline

## Acceptance test
Ask:
1. Can it be completed by doing the wrong thing?
2. Can pre-existing state satisfy it?
3. Can an unrelated entity satisfy it?
4. Can an old event satisfy it?
5. Can duplicate events double-count it?
6. Does save/load preserve it?
7. Does offline catch-up preserve it?
8. Does wording match implementation?

If not, fix the mechanic or the wording.
