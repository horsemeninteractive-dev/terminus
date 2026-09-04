import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTransmissionLog,
  getTransmissionCategory,
  isTransmissionDeclined,
} from '../src/services/radioDirectiveService';
import type { RadioTransmission } from '../src/types/radioDirective';

function mkTx(partial: Partial<RadioTransmission>): RadioTransmission {
  return {
    id: partial.id || 'tx_x',
    classification: partial.classification || 'SITREP',
    callsign: 'TEST',
    frequency: '104.20 MHz',
    timestamp: 'DAY 01 — 08:00:00',
    title: 'Test',
    message: 'Test message',
    isRead: partial.isRead ?? false,
    ...partial,
  };
}

test('getTransmissionCategory classifies mission / directive / informational', () => {
  assert.equal(getTransmissionCategory(mkTx({ id: 'a', missionId: 'm1' })), 'mission');
  assert.equal(getTransmissionCategory(mkTx({ id: 'b', directiveId: 'd1' })), 'directive');
  assert.equal(getTransmissionCategory(mkTx({ id: 'c' })), 'informational');
});

test('isTransmissionDeclined matches a transmission to its declined mission id', () => {
  const tx = mkTx({ id: 'a', missionId: 'mission_waterline' });
  assert.equal(isTransmissionDeclined(tx, []), false);
  assert.equal(isTransmissionDeclined(tx, ['mission_other']), false);
  assert.equal(isTransmissionDeclined(tx, ['mission_waterline']), true);
  // Informational transmissions are never declined.
  assert.equal(isTransmissionDeclined(mkTx({ id: 'b' }), ['anything']), false);
});

test('read-status filter returns only unread / read records', () => {
  const log = [
    mkTx({ id: 'a', isRead: false }),
    mkTx({ id: 'b', isRead: true }),
    mkTx({ id: 'c', isRead: false }),
  ];
  assert.deepEqual(
    filterTransmissionLog(log, { read: 'UNREAD' }).map((t) => t.id),
    ['a', 'c']
  );
  assert.deepEqual(
    filterTransmissionLog(log, { read: 'READ' }).map((t) => t.id),
    ['b']
  );
  assert.equal(filterTransmissionLog(log, { read: 'ALL' }).length, 3);
});

test('category filter returns mission / directive / informational', () => {
  const log = [
    mkTx({ id: 'a', missionId: 'm1' }),
    mkTx({ id: 'b', directiveId: 'd1' }),
    mkTx({ id: 'c' }),
  ];
  assert.deepEqual(
    filterTransmissionLog(log, { category: 'mission' }).map((t) => t.id),
    ['a']
  );
  assert.deepEqual(
    filterTransmissionLog(log, { category: 'directive' }).map((t) => t.id),
    ['b']
  );
  assert.deepEqual(
    filterTransmissionLog(log, { category: 'informational' }).map((t) => t.id),
    ['c']
  );
});

test('declined filter returns only declined mission briefings', () => {
  const log = [
    mkTx({ id: 'a', missionId: 'm1' }),
    mkTx({ id: 'b', missionId: 'm2' }),
    mkTx({ id: 'c', directiveId: 'd1' }),
  ];
  assert.deepEqual(
    filterTransmissionLog(log, { declinedOnly: true }, ['m2']).map((t) => t.id),
    ['b']
  );
});

test('classification filter still works alongside the new dimensions', () => {
  const log = [
    mkTx({ id: 'a', classification: 'EMERGENCY', missionId: 'm1', isRead: false }),
    mkTx({ id: 'b', classification: 'EMERGENCY', missionId: 'm1', isRead: true }),
    mkTx({ id: 'c', classification: 'SITREP', missionId: 'm1', isRead: false }),
  ];
  const combined = filterTransmissionLog(
    log,
    { classification: 'EMERGENCY', read: 'UNREAD', category: 'mission' },
    []
  );
  assert.deepEqual(combined.map((t) => t.id), ['a']);
});

test('declined + read filters compose', () => {
  const log = [
    mkTx({ id: 'a', missionId: 'm1', isRead: false }),
    mkTx({ id: 'b', missionId: 'm1', isRead: true }),
    mkTx({ id: 'c', missionId: 'm2', isRead: false }),
  ];
  const result = filterTransmissionLog(
    log,
    { declinedOnly: true, read: 'UNREAD' },
    ['m1']
  );
  assert.deepEqual(result.map((t) => t.id), ['a']);
});