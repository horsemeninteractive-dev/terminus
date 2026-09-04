<div align="center">

# TERMINUS

**Real-World Survival Strategy**

*Rebuild civilisation from the rubble of your own city block.*

</div>

TERMINUS is a single-player real-time survival strategy game set on **real-world city maps**. Every street, building, and landmark is pulled from OpenStreetMap data and rendered as a 3D tactical world. You don't build a base from prefab squares — you seize a real supermarket, barricade a real terraced street, and adapt actual buildings into bunkhouses, cookhouses, and armour forges.

The game is a **full RTS-style colony sim**: squads fight in real time with real ballistics and line of sight, infected behave differently at day and night, weather and seasons bite, research trees unlock industrial production, and a radio-driven campaign delivers missions through an in-game narrative framework.

---

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [How to Play (10-Second Summary)](#how-to-play-10-second-summary)
- [Controls](#controls)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Development Notes](#development-notes)

> Looking for how to actually play? Read **[TerminusManual.md](TerminusManual.md)** — the full operator's manual.

---

## Features

- **Real-world maps** — Playable city zones from real OpenStreetMap data (Oxford, Berlin Mitte, London Soho, Paris Cité, Rome Centro, Tokyo Shibuya, San Francisco, Evesham) rendered in 3D with elevation, satellite imagery, and building-level fidelity.
- **Zone-based difficulty** — Choose your territory from a compact 3×3 outpost (900 m × 900 m) up to a sprawling 9×9 provincial zone (2.7 km × 2.7 km). Bigger maps mean more resources — and more ways to die.
- **Building adaptation** — Every real building can be adapted into functional infrastructure: headquarters, shelters, warehouses, cookhouses, greenhouses, medbays, armouries, and more. Adaptation cost and capacity scale with the building's real footprint, and partial adaptations can be painted onto the building itself.
- **Freestanding construction** — Purpose-built facilities (walls, gates, towers, fields, cisterns, generator stations, battery banks) are constructed as distinct structures with their own footprints, materials, and research gates.
- **Real-time squad combat** — Form 4-person fireteams, choose loadouts, and fight in the streets. Weapons have real range/damage/fire-rate profiles, ammunition is consumed per volley, and noise draws the infected.
- **Day/night infected AI** — Infected shelter in buildings by day and mass into coordinated night hordes at dusk. Floodlights, barbed wire, walls, gates, and towers all shape the perimeter fight.
- **Deep colony simulation** — Population, morale, housing, food chains, water demand, power grid (generators, batteries, priority shedding), weather, seasons, and infection triage all interact.
- **Production economy** — Fields, greenhouses, barns, cookhouses, canneries, sawmills, scrapyards, chemical plants, tool factories, arms factories, protective-gear factories, and vehicle workshops form real input/output chains.
- **Research tree** — Eight branches (Medicine, Communication, Chemistry, Arms Production, Construction, Food, Infection, Education) across four tiers, driven by scientific materials.
- **Vehicles** — Find, repair, fuel, and command cars, SUVs, and vans. Squads ride mounted, and transport vehicles haul bulk loot.
- **Expedition & trade** — Leave the tactical map for the strategic globe view, dispatch caravans, establish a second settlement, and run supply lines between towns.
- **Radio campaign** — A data-driven mission framework: events trigger radio transmissions, your response creates missions, and real game state drives task progress. Declining a faction's request has **persistent consequences** — standing shifts, cut-off contacts, and altered future content.
- **Rival factions** — Hostile human bands (the Iron Vultures, the Blackout Marauders) occupy hideouts, take captives, and demand ransoms.
- **Persistence** — Quick save/load (F5/F9), manual saves, and an offline catch-up sim so a long-away player returns to a world that actually kept running.

---

## Getting Started

### Prerequisites

- **Node.js 20+** (the project uses Vite 6, React 19, TypeScript 5.8)

### Install

```bash
npm install --no-audit --no-fund
```

> No API keys or `.env` files are required. All map data is bundled; `.env.example`
> documents optional variables that the game does not read at dev time.

### Run the dev server

```bash
npm run dev
```

Vite serves the app at **http://localhost:3000**.

### Production build & preview

```bash
npm run build   # type-checks nothing; bundles to dist/
npm run preview # serves the built bundle on port 3000
```

### Tests & typecheck

```bash
npm run lint   # tsc --noEmit (project-wide typecheck)
npm test       # node --test across tests/*.test.ts (300+ tests)
```

---

## How to Play (10-Second Summary)

1. **CLICK TO START** at boot, then **CONTINUE GAME** or **NEW GAME**.
2. In a new game, pick a real-world city zone and size, then click a building to **ESTABLISH HEADQUARTERS**.
3. Follow the radio **directives** — find survivors, form a fireteam, scavenge a building, survive the first night.
4. From there it's an open sandbox: research, build, adapt, produce, and answer the radio as the campaign unfolds.

The in-game **Survival Codex** (from the main menu) and the quest tracker (OPERATIONS, top-left in the world) keep you oriented.

---

## Controls

| Input | Action |
| --- | --- |
| **Mouse left-click** | Select building / squad / unit; issue order |
| **Mouse right-click** | Move order / context action |
| **Mouse wheel / drag** | Zoom / pan camera |
| **ESC** | Deselect → close panel → pause menu |
| **SPACE** | Pause / resume simulation |
| **1 / 2 / 3 / 4** | Time speed (1× / 2× / 4×) |
| **F5** | Quick save |
| **F9** | Quick load |
| **B / W / H** | Action-bar shortcuts: Buildings, Fortifications & Walls, Area Works |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4, Lucide icons, Motion (Framer Motion) |
| 3D rendering | Three.js (with Earcut triangulation of real building footprints) |
| Build | Vite 6 |
| Maps | Bundled OpenStreetMap-derived data (buildings, roads, landuse, resource nodes) |
| Tests | Node's built-in test runner (`node:test`) via `tsx` |

---

## Project Structure

```
src/
  assets/         Images, logos, static assets
  components/     React UI — modals, HUD, tactical overlays, world scene
  data/           Content: buildings, research tree, factions, missions,
                  transmissions, bundled real-world maps
  hooks/          Game state, save/load, world effects, simulation loop
  lib/            Shared utilities
  render/         Three.js scene builders (buildings, terrain, barriers)
  services/       Simulation engines: combat, settlement, population,
                  water, power, research, vehicles, caravans, missions, ...
  types/          Shared TypeScript definitions per domain
tests/            Node test-runner suites (unit + integration)
```

The architecture deliberately separates **engine** (`src/services/`) from
**content** (`src/data/`): missions, transmissions, buildings, and research are
data-driven and can be authored without touching the simulation code.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server (port 3000) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Project-wide TypeScript check (`tsc --noEmit`) |
| `npm test` | Run the full test suite |
| `npm run clean` | Remove `dist/` and `server.js` |
| `npm run version:patch/minor/major` | Bump `package.json` version |

---

## Development Notes

- **Content is data.** Buildings live in `src/data/functionalBuildings.ts`,
  research in `src/data/researchTreeData.ts`, the campaign in
  `src/data/missions/` + `src/data/transmissions/`, and factions in
  `src/data/factions.ts`. The mission registry (`src/services/missionRegistry.ts`)
  validates every reference at load time.
- **Simulation invariants.** The mission engine never creates missions silently
  — the flow is always *trigger → radio transmission → player response →
  mission*. Dedupe and save/load safety are enforced in the engine.
- **Tests are load-bearing.** If you change a simulation service, run `npm test`
  — 300+ tests cover the combat pipeline, power grid, water, economy, missions,
  and save/load migration.
- **Maps are bundled JSON** under `src/data/maps/` (city + zone presets). New
  zones can be added as data without engine changes.

---

<div align="center">

© 2026 Horsemen Interactive · Built with React, Three.js & OpenStreetMap data

</div>