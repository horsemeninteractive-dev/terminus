/**
 * v0.3.8 — LAIR INFORMATION SECRECY regression tests.
 *
 * Undiscovered lairs must not leak exact counts/populations/variants through
 * the regional pressure aggregation. Run:
 * node --import tsx --import ./tests/register-loader.mjs --test tests/lairInfoSecrecy.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('TacticalEdgeSidebar aggregates only DISCOVERED lairs for exact figures', () => {
  const src = readFileSync(
    join(process.cwd(), 'src', 'components', 'TacticalEdgeSidebar.tsx'),
    'utf8'
  );

  // The exact-count aggregation must be computed over discovered lairs only.
  assert.match(
    src,
    /discoveredStanding\s*=\s*standingLairs\.filter\(\(l\)\s*=>\s*l\.isDiscovered\)/,
    'exact figures are aggregated over DISCOVERED lairs only'
  );
  // The exact committed-infected sum must draw from the discovered subset.
  assert.match(
    src,
    /lairCommittedInfected\s*=\s*discoveredStanding\.reduce/,
    'committed-infected total sums the discovered subset, not all standing lairs'
  );
  // Undiscovered activity is a boolean signal, never a count exposure.
  assert.match(
    src,
    /hasUndiscoveredActivity\s*=\s*undiscoveredStanding\s*>\s*0/,
    'undiscovered nests surface only as a boolean activity signal'
  );
  // The old omniscient line (exact count over ALL standing lairs) is gone.
  assert.ok(
    !/\{standingLairs\.length\} ACTIVE LAIR/.test(src),
    'the old exact-count line over all standing lairs is removed'
  );
  // The unknown-activity phrasing exists for hidden nests.
  assert.match(src, /UNKNOWN INFECTED ACTIVITY DETECTED/);
});
