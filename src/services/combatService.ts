/**
 * Combat domain facade.
 *
 * The original monolithic combatService.ts has been split into focused domain
 * modules under `src/services/combat/`:
 *
 * - `combat/clock`       — game clock state & advancement
 * - `combat/medical`     — §5.3 medical facility patient care
 * - `combat/zombie`      — zombie unit creation, horde & ambient generation,
 *                          building infestation
 * - `combat/armory`      — squad member roster, loadout & stat recomputation
 * - `combat/noise`       — acoustic noise events & visual rings
 * - `combat/tick`        — the real-time combat simulation tick loop
 * - `combat/buildings`   — repair, tower armament, scrap recycling
 * - `combat/squadcmds`   — RTS squad command dispatchers & sync
 *
 * This file re-exports every public symbol so existing imports from
 * `./combatService` (and `../services/combatService`) remain stable.
 */
export * from './combat/clock';
export * from './combat/medical';
export * from './combat/zombie';
export * from './combat/armory';
export * from './combat/noise';
export * from './combat/tick';
export * from './combat/buildings';
export * from './combat/squadcmds';
