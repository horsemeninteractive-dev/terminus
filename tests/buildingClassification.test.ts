import test from 'node:test';
import assert from 'node:assert/strict';
import { categorizeBuilding, recategorizeBuilding } from '../src/services/mapProcessor';
import { generateLootForBuilding, unloadSquadAtDropoff, createEmptySquadInventory } from '../src/services/scavengingService';
import { BuildingPolygon } from '../src/types/map';
import { SettlementState } from '../src/types/settlement';
import { createInitialSettlementState } from '../src/services/settlementService';

test('categorizeBuilding recognizes schools, universities, and colleges from OSM tags', () => {
  // 1. building tag explicitly set to school / university
  assert.equal(categorizeBuilding({ building: 'university' }), 'school');
  assert.equal(categorizeBuilding({ building: 'school' }), 'school');
  assert.equal(categorizeBuilding({ building: 'college' }), 'school');
  assert.equal(categorizeBuilding({ building: 'kindergarten' }), 'school');

  // 2. amenity tag set to school / university / library / research
  assert.equal(categorizeBuilding({ building: 'yes', amenity: 'university' }), 'school');
  assert.equal(categorizeBuilding({ building: 'yes', amenity: 'school' }), 'school');
  assert.equal(categorizeBuilding({ building: 'yes', amenity: 'library' }), 'school');
  assert.equal(categorizeBuilding({ building: 'yes', amenity: 'research_institute' }), 'school');

  // 3. landuse=education
  assert.equal(categorizeBuilding({ building: 'yes', landuse: 'education' }), 'school');

  // 4. Name keyword clues
  assert.equal(categorizeBuilding({ building: 'yes' }, 'yes', 'West High School'), 'school');
  assert.equal(categorizeBuilding({ building: 'yes' }, 'yes', 'St. Mary University'), 'school');
  assert.equal(categorizeBuilding({ building: 'yes' }, 'yes', 'Science Research Lab'), 'school');
});

test('categorizeBuilding recognizes hospitals, supermarkets, police, and industrial', () => {
  assert.equal(categorizeBuilding({ building: 'hospital' }), 'hospital');
  assert.equal(categorizeBuilding({ building: 'clinic' }), 'hospital');
  assert.equal(categorizeBuilding({ building: 'supermarket' }), 'supermarket');
  assert.equal(categorizeBuilding({ building: 'retail', shop: 'supermarket' }), 'supermarket');
  assert.equal(categorizeBuilding({ building: 'police' }), 'police');
  assert.equal(categorizeBuilding({ building: 'warehouse' }), 'warehouse');
  assert.equal(categorizeBuilding({ building: 'industrial' }), 'industrial');
  assert.equal(categorizeBuilding({ building: 'commercial' }), 'commercial');
});

test('recategorizeBuilding corrects previously miscategorized residential buildings', () => {
  const misclassifiedUniversity: BuildingPolygon = {
    id: 'b_test_1',
    type: 'residential',
    rawType: 'university',
    name: 'Radcliffe Camera',
    height: 15,
    levels: 4,
    center: { x: 0, z: 0 },
    polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
    tags: { building: 'university', amenity: 'library', name: 'Radcliffe Camera' },
  };

  assert.equal(recategorizeBuilding(misclassifiedUniversity), 'school');
});

test('generateLootForBuilding produces scientific_materials for school buildings', () => {
  const schoolBuilding: BuildingPolygon = {
    id: 'b_school_1',
    type: 'school',
    rawType: 'school',
    name: 'City High School',
    height: 12,
    levels: 3,
    center: { x: 50, z: 50 },
    polygon: [{ x: 40, z: 40 }, { x: 60, z: 40 }, { x: 60, z: 60 }, { x: 40, z: 60 }],
    tags: { building: 'school' },
  };

  const loot = generateLootForBuilding(schoolBuilding, 1);
  const sciMat = loot.find((item) => item.label === 'scientific_materials');
  assert.ok(sciMat, 'School building must produce scientific_materials loot');
  assert.ok(sciMat.quantity >= 1, 'School building must yield at least 1 scientific_material');
});

test('unloadSquadAtDropoff deposits scavenged scientific_materials into settlement stockpile', () => {
  const settlement: SettlementState = createInitialSettlementState('Test Colony');
  assert.equal(settlement.stockpile.materials.scientific_materials || 0, 0);

  const squadId = 'squad_alpha';
  const inv = createEmptySquadInventory(4);
  inv.items.push({
    id: 'sci_1',
    kind: 'resource',
    label: 'scientific_materials',
    quantity: 2,
    weight: 0.8,
  });

  const stateWithInv: SettlementState = {
    ...settlement,
    squadInventories: {
      [squadId]: inv,
    },
  };

  const dropoff = { x: 0, z: 0 };
  const { newState, unloaded } = unloadSquadAtDropoff(stateWithInv, squadId, { x: 0, z: 0 }, dropoff, 20);

  assert.equal(unloaded.length, 1);
  assert.equal(unloaded[0].label, 'scientific_materials');
  assert.equal(newState.stockpile.materials.scientific_materials, 2);
});
