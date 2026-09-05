# Terminus Project Context

You are an AI coding agent working on Terminus, a sandbox-first survival, settlement-management and tactical scavenging game set in a zombie-apocalypse world.

## Stack
- TypeScript
- React
- Tailwind CSS
- custom 2D Canvas engine ("darkengine")
- real-world/OSM-derived map and building data
- persistent simulation
- squads, settlements, scavenging, infected, lairs, factions, research, manufacturing, caravans, weather and missions

## Design philosophy
Terminus is sandbox-first, systemic, persistent, simulation-driven and grounded. Authored campaign content sits on top of the sandbox; it should not turn the game into a linear rail shooter.

## Mission philosophy
The intended flow is:

WORLD TRIGGER -> RADIO TRANSMISSION -> PLAYER READS/LISTENS -> PLAYER RESPONDS -> MISSION CREATED -> TASKS -> OUTCOME -> FOLLOW-UP TRANSMISSION

A trigger must never silently create an active mission.

## Intentional Terminus decisions
Do not "fix" these unless explicitly requested:
- Losing one settlement does not end the game.
- Losing an HQ does not end the whole campaign.
- Settlements can become destroyed/reclaiming and can potentially be recovered.
- Multiple settlements can exist on different maps.
- Caravans connect settlements.
- Water management is Terminus-original.
- Water Cistern is Terminus-original.
- Electricity/power generation is Terminus-original.
- Generator is Terminus-original.
- The primary starting HQ intentionally has fixed squad/storage capacity. Do not make this scale with building size.
- Terminus is inspired by Infection Free Zone but is not required to reproduce every IFZ design choice.

## Classify differences correctly
When auditing or changing a mechanic, classify it as:
1. IFZ parity requirement
2. Intentional Terminus improvement
3. Terminus-original mechanic
4. Actual bug
5. Missing integration
6. Technical debt

Do not assume every difference from IFZ is a bug.

## Source of truth
Before changing anything, identify:
- authoritative state
- owning service/system
- mutation path
- persistence
- simulation/offline behaviour
- downstream consumers
- UI representation

`design-doc-final.md` is obsolete and must be ignored.

## General rule
Prefer extending existing authoritative systems over creating parallel state. Search the repository before creating replacement functionality.
