# Terminus Regression Auditor

Perform a targeted regression audit after significant changes.

## Required checks
Run available:
- typecheck
- build
- tests

Report honestly if dependencies prevent execution.

## Mission regression searches
Search for:
- manufacture_item
- scavenge_resource
- deliver_resources
- contact_faction
- rescue_survivors
- recruit_survivors
- travel_to_location
- discover_location
- triggeredEventIds
- missionTargetsBindable
- buildingSearches
- discoveredHiddenGroups

## Other system regressions
For building changes inspect construction, adaptation, deconstruction, repair, HQ, storage, population, research, production, water and power.

For squad changes inspect movement, combat, scavenging, capacity, vehicles, injuries, HQ and caravans.

## Persistence
Verify changed state survives save, load, reload and offline catch-up.

## Event safety
Check duplicate events, duplicate rewards, stale cursors and event ordering.

## UI consistency
UI must reflect authoritative state rather than maintaining competing mission/resource/building/settlement state.

## Test intent
Tests that merely encode old implementation are not proof. Rewrite tests when implementation and intended gameplay disagree.

## Final report
Report:
- changed systems
- tests run
- failures
- unavailable tests
- build/typecheck result
- remaining risks
