import {
  DEFAULT_LAW_ID,
  GATHERING_PLACE_UNLOCK_POPULATION,
  LawDefinition,
  LawId,
  LawsState,
} from '../types/laws';
import { SettlementState } from '../types/settlement';
import { isBuildingOperational } from './buildingOperational';
import { countSettlementSurvivors } from './settlementLifecycleService';

/**
 * The colony lawbook. One law is active at a time; the Gathering Place can
 * change it once per in-game day. Effects are real: food consumption (the
 * 0.5/citizen/day baseline the morale model tracks), citizen satisfaction (a
 * standing morale factor), childcare, and adult/child work rules.
 */
export const LAWS: LawDefinition[] = [
  {
    id: 'standard_rations',
    name: 'Standard Rations',
    category: 'food',
    description: 'The colony baseline: 0.5 food units per citizen per day. No standing effect.',
    foodConsumptionMult: 1.0,
    moraleDelta: 0,
    moraleDescription: 'No standing policy effect.',
    childLaborAllowed: false,
  },
  {
    id: 'extended_rations',
    name: 'Extended Rations',
    category: 'food',
    description:
      'Stretch the larder: citizens eat 30% less per day. Reserves last far longer, but meager portions breed quiet grumbling.',
    foodConsumptionMult: 0.7,
    moraleDelta: -5,
    moraleDescription: 'Meager portions breed quiet grumbling (-5).',
    childLaborAllowed: false,
  },
  {
    id: 'generous_rations',
    name: 'Generous Rations',
    category: 'food',
    description:
      'Hearty meals: citizens eat 30% more per day. A strong morale boost at the cost of faster reserve drawdown.',
    foodConsumptionMult: 1.3,
    moraleDelta: 10,
    moraleDescription: 'Well-fed colonists work with renewed spirit (+10).',
    childLaborAllowed: false,
  },
  {
    id: 'childcare_program',
    name: 'Childcare Program',
    category: 'childcare',
    description:
      'Formal childcare for all children. Keeps every child out of the labour pool and steadies the colony’s conscience.',
    foodConsumptionMult: 1.0,
    moraleDelta: 5,
    moraleDescription: 'Children are protected and cared for (+5).',
    childLaborAllowed: false,
  },
  {
    id: 'child_labor_permitted',
    name: 'Child Labour Permitted',
    category: 'labor',
    description:
      'Permits children to work the fields, workshops, and construction sites. Adds hands to the labour pool at a real morale cost.',
    foodConsumptionMult: 1.0,
    moraleDelta: -8,
    moraleDescription: 'Putting children to work unsettles the colony (-8).',
    childLaborAllowed: true,
  },
];

export function getLawDefinition(id: LawId): LawDefinition {
  return LAWS.find((l) => l.id === id) || LAWS[0];
}

export function getDefaultLawsState(): LawsState {
  return { activeLawId: DEFAULT_LAW_ID, lastLawChangeDay: -1 };
}

export function getActiveLaw(state: SettlementState): LawDefinition {
  return getLawDefinition(state.laws?.activeLawId || DEFAULT_LAW_ID);
}

export interface LawsUnlockInfo {
  unlocked: boolean;
  population: number;
  requiredPopulation: number;
  gatheringPlaceOperational: boolean;
  reason: string;
}

/**
 * The Gathering Place opens the law forum: it must be built AND operational,
 * and the colony must have reached GATHERING_PLACE_UNLOCK_POPULATION citizens
 * (current IFZ: laws unlock at 100 citizens).
 */
export function getLawsUnlockInfo(state: SettlementState): LawsUnlockInfo {
  const population = countSettlementSurvivors(state);
  const gatheringPlaceOperational = Array.from(state.adaptedBuildings.values())
    .concat(state.freestandingBuildings)
    .some((b) => b.typeId === 'gathering_place' && isBuildingOperational(b));
  const populationMet = population >= GATHERING_PLACE_UNLOCK_POPULATION;
  const unlocked = gatheringPlaceOperational && populationMet;

  let reason = '';
  if (!gatheringPlaceOperational) {
    reason = 'Requires an operational Gathering Place (Community Assembly forum).';
  } else if (!populationMet) {
    reason = `Requires ${GATHERING_PLACE_UNLOCK_POPULATION} citizens to open the forum (currently ${population}).`;
  }
  return {
    unlocked,
    population,
    requiredPopulation: GATHERING_PLACE_UNLOCK_POPULATION,
    gatheringPlaceOperational,
    reason,
  };
}

export interface EnactLawResult {
  success: boolean;
  newState: SettlementState;
  error?: string;
}

/**
 * Changes the active law through the Gathering Place. Gates: forum unlocked
 * (operational Gathering Place + 100 citizens), at most ONE change per in-game
 * day, and the law must actually differ from the current one.
 */
export function enactLaw(state: SettlementState, lawId: LawId, currentDay: number): EnactLawResult {
  const unlock = getLawsUnlockInfo(state);
  if (!unlock.unlocked) {
    return { success: false, newState: state, error: unlock.reason };
  }
  const laws = state.laws || getDefaultLawsState();
  if (laws.lastLawChangeDay === currentDay) {
    return {
      success: false,
      newState: state,
      error: 'The Gathering Place has already spoken today — laws change once per day.',
    };
  }
  if (laws.activeLawId === lawId) {
    return {
      success: false,
      newState: state,
      error: `${getLawDefinition(lawId).name} is already the colony law.`,
    };
  }
  return {
    success: true,
    newState: {
      ...state,
      laws: { activeLawId: lawId, lastLawChangeDay: currentDay },
    },
  };
}