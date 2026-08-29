// ==========================================
// Morale & Passive Population Growth System (§4.5)
// ==========================================

export type MoraleTier = 'euphoric' | 'content' | 'discontent' | 'despair';

export interface MoraleFactorBreakdown {
  id: string;
  name: string;
  category: 'food' | 'housing' | 'safety' | 'health' | 'events';
  scoreDelta: number; // e.g. +15, -20
  description: string;
  statusType: 'positive' | 'neutral' | 'negative' | 'critical';
}

export interface MoraleModifiers {
  productivityMultiplier: number; // 0.35x (despair) to 1.30x (euphoric) for work/construction/crafting
  combatDamageMultiplier: number; // 0.60x to 1.15x for squad weapon output
  combatFireRateMultiplier: number; // 0.70x to 1.10x
  combatCritBonus: number; // 0.0 to 0.10
  passiveGrowthMultiplier: number; // 0.0x (despair/starvation) to 1.75x (high morale)
}

export interface PassiveGrowthState {
  currentProgress: number; // 0 to 100 (%)
  ratePercentPerDay: number; // e.g. 25% per day when thriving
  isGrowing: boolean;
  blockReason: string | null;
  totalBirthsAndArrivals: number;
  lastArrivalDay?: number;
  estimatedDaysRemaining: number;
}

export interface SettlementMoraleState {
  overallScore: number; // 0 to 100
  tier: MoraleTier;
  tierLabel: string;
  tierDescription: string;
  factors: MoraleFactorBreakdown[];
  modifiers: MoraleModifiers;
  passiveGrowth: PassiveGrowthState;
  dailyFoodConsumption: number;
  daysOfFoodRemaining: number;
  dailyWaterConsumption: number;
  daysOfWaterRemaining: number;
}
