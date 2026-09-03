import {
  MoraleFactorBreakdown,
  MoraleModifiers,
  MoraleTier,
  PassiveGrowthState,
  SettlementMoraleState,
} from '../types/morale';
import { SettlementState } from '../types/settlement';
import { WeatherState } from '../types/weather';
import { isResearchUnlocked } from './researchService';
import { calculateCropYieldFactors } from './weatherService';
import { recalculateLaborDistribution } from './populationService';
import { getPrimaryHQ, isBuildingOperational, isHQOperational } from './buildingOperational';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';
import { getActiveLaw } from './lawService';
import {
  addWaterToStockpile,
  calculateWaterDemand,
  consumeSettlementWater,
  getTotalPotableWater,
} from './waterService';

// ==========================================
// 1. Initial State Helpers
// ==========================================

export function createInitialPassiveGrowthState(): PassiveGrowthState {
  return {
    currentProgress: 15,
    ratePercentPerDay: 25,
    isGrowing: true,
    blockReason: null,
    totalBirthsAndArrivals: 0,
    estimatedDaysRemaining: 3.4,
  };
}

export function createInitialMoraleState(): SettlementMoraleState {
  return {
    overallScore: 82,
    tier: 'content',
    tierLabel: 'Content & Stable',
    tierDescription: 'Survivors are optimistic and working steadily with standard efficiency.',
    factors: [],
    modifiers: {
      productivityMultiplier: 1.0,
      combatDamageMultiplier: 1.0,
      combatFireRateMultiplier: 1.0,
      combatCritBonus: 0.0,
      passiveGrowthMultiplier: 1.0,
    },
    passiveGrowth: createInitialPassiveGrowthState(),
    dailyFoodConsumption: 6,
    daysOfFoodRemaining: 9.2,
    dailyWaterConsumption: 18,
    daysOfWaterRemaining: 6.7,
  };
}

// ==========================================
// 2. Core Settlement Morale Calculation (§4.5)
// ==========================================

export function calculateSettlementMorale(
  settlement: SettlementState,
  weatherState?: WeatherState,
  currentDay = 1
): SettlementMoraleState {
  const totalPop = Math.max(1, (settlement.namedSurvivors?.length || 0) + (typeof settlement.generalPopulation === 'number' ? settlement.generalPopulation : (settlement.generalPopulation?.total || 0)));
  const stockpile = settlement.stockpile;

  // Daily consumption: each citizen consumes 0.5 food per in-game day, scaled
  // by the active rationing law (Extended ×0.7, Generous ×1.3).
  const dailyFoodConsumption = Math.round(totalPop * 0.5 * getActiveLaw(settlement).foodConsumptionMult * 10) / 10;
  // Water demand is settlement-wide (population drinking + medical + industrial
  // draw) — computed by waterService, the single water-economy authority.
  const dailyWaterConsumption = Math.round(calculateWaterDemand(settlement) * 10) / 10;

  const totalFood =
    stockpile.food.canned_goods +
    stockpile.food.mre_rations +
    stockpile.food.dried_rations +
    stockpile.food.fresh_harvest;

  // Potable reserve: the disposable store plus the cistern buffers — waterService
  // owns the reserve accounting ("store empty, cisterns full" stays drinkable).
  const totalWater = getTotalPotableWater(settlement);

  const daysOfFoodRemaining =
    dailyFoodConsumption > 0 ? Math.round((totalFood / dailyFoodConsumption) * 10) / 10 : 99;
  const daysOfWaterRemaining =
    dailyWaterConsumption > 0 ? Math.round((totalWater / dailyWaterConsumption) * 10) / 10 : 99;
  // AUTHORITATIVE water-shortage signal: waterService.consumeSettlementWater
  // increments waterState.shortageDays whenever the colony CANNOT meet its
  // actual daily draw (store and cistern buffers both exhausted). A real unmet
  // draw degrades the colony immediately — days-remaining below is only a
  // forecast that colours the warning ahead of the crisis.
  const inWaterShortage = (settlement.waterState?.shortageDays ?? 0) > 0;

  const factors: MoraleFactorBreakdown[] = [];
  let baseScore = 65; // Baseline neutral score

  // -------------------------------------------------------------
  // A. FOOD QUALITY & RESERVES (§4.5)
  // -------------------------------------------------------------
  if (totalFood === 0) {
    baseScore -= 45;
    factors.push({
      id: 'food_starvation',
      name: 'Starvation Crisis',
      category: 'food',
      scoreDelta: -45,
      description: 'Zero food in stockpile! Colonists are starving and panic is setting in.',
      statusType: 'critical',
    });
  } else if (daysOfFoodRemaining < 1.0) {
    baseScore -= 25;
    factors.push({
      id: 'food_critical',
      name: 'Severe Food Shortage',
      category: 'food',
      scoreDelta: -25,
      description: `Less than 1 day of food remaining (${totalFood} units for ${totalPop} colonists).`,
      statusType: 'negative',
    });
  } else if (daysOfFoodRemaining < 2.5) {
    baseScore -= 10;
    factors.push({
      id: 'food_low',
      name: 'Low Food Stock',
      category: 'food',
      scoreDelta: -10,
      description: `Food reserves are running thin (${daysOfFoodRemaining} days remaining).`,
      statusType: 'negative',
    });
  } else if (daysOfFoodRemaining >= 5.0) {
    baseScore += 18;
    factors.push({
      id: 'food_abundant',
      name: 'Plentiful Food Security',
      category: 'food',
      scoreDelta: +18,
      description: `Abundant food stockpile (${daysOfFoodRemaining} days of reserves).`,
      statusType: 'positive',
    });
  } else {
    baseScore += 8;
    factors.push({
      id: 'food_adequate',
      name: 'Adequate Food Stock',
      category: 'food',
      scoreDelta: +8,
      description: `Reliable food supply (${daysOfFoodRemaining} days remaining).`,
      statusType: 'positive',
    });
  }

  // Food Quality (Fresh Harvest vs Preserved Rations)
  const freshRatio = totalFood > 0 ? stockpile.food.fresh_harvest / totalFood : 0;
  const hasCookhouse = Array.from(settlement.adaptedBuildings.values())
    .concat(settlement.freestandingBuildings)
    .some((b) => b.typeId === 'cookhouse' && isBuildingOperational(b));

  if (stockpile.food.fresh_harvest >= 15 || (hasCookhouse && stockpile.food.fresh_harvest > 0)) {
    baseScore += 12;
    factors.push({
      id: 'food_fresh_quality',
      name: 'Fresh Harvest & Hot Meals',
      category: 'food',
      scoreDelta: +12,
      description: 'Cookhouse preparing nutritious hot meals with fresh greenhouse produce.',
      statusType: 'positive',
    });
  } else if (freshRatio < 0.05 && totalFood > 0) {
    baseScore -= 5;
    factors.push({
      id: 'food_monotony',
      name: 'Monotonous Dry Rations',
      category: 'food',
      scoreDelta: -5,
      description: 'Diet consists solely of shelf-stable MREs and dried rations.',
      statusType: 'neutral',
    });
  }

  // -------------------------------------------------------------
  // B. HOUSING & LIVING STANDARDS (§4.5)
  // -------------------------------------------------------------
  // Capacity is authoritative, but older saves may have a stale aggregate.
  // Recompute the HQ contribution from its functional capacity so a valid HQ
  // cannot simultaneously shelter the population and trigger homelessness.
  // §7.5 A destroyed HQ shelters nobody — its beds count only while standing.
  const primaryHQ = getPrimaryHQ(settlement);
  const hqCapacity = isHQOperational(primaryHQ) ? primaryHQ?.maxCapacity || 0 : 0;
  const livingCap = Math.max(settlement.totalLivingCapacity || 0, hqCapacity);
  const housingDeficit = Math.max(0, totalPop - livingCap);

  if (housingDeficit > 0) {
    const penalty = Math.min(35, 12 + housingDeficit * 4);
    baseScore -= penalty;
    factors.push({
      id: 'housing_overcrowded',
      name: 'Overcrowded & Homeless',
      category: 'housing',
      scoreDelta: -penalty,
      description: `${housingDeficit} survivor(s) lack assigned shelter beds and are sleeping rough.`,
      statusType: 'critical',
    });
  } else if (livingCap >= totalPop + 4) {
    baseScore += 14;
    factors.push({
      id: 'housing_spacious',
      name: 'Spacious Living Quarters',
      category: 'housing',
      scoreDelta: +14,
      description: `Generous housing capacity (${livingCap} beds for ${totalPop} survivors).`,
      statusType: 'positive',
    });
  } else {
    baseScore += 8;
    factors.push({
      id: 'housing_adequate',
      name: 'Adequate Shelter Bunking',
      category: 'housing',
      scoreDelta: +8,
      description: `All ${totalPop} colonists have sheltered beds (${livingCap} beds available).`,
      statusType: 'positive',
    });
  }

  if (isResearchUnlocked(settlement, 'survival_insulation')) {
    baseScore += 6;
    factors.push({
      id: 'housing_insulated',
      name: 'Insulated Bunks & Acoustics',
      category: 'housing',
      scoreDelta: +6,
      description: 'Thermal wall insulation and quiet private partitions enhance rest comfort.',
      statusType: 'positive',
    });
  }

  // §IFZ House: the def advertises a Mood Boost (+15%) — make it real, not
  // just copy. A House is an upgraded residence, so the colony only enjoys the
  // bonus to the degree its population can actually sleep in one (a single
  // 2-bed House for a colony of 200 is not a housing renaissance). The bonus
  // scales linearly from +3 up to the full +15 when everyone is housed in
  // Houses rather than basic shelter bunks.
  const houseBedCapacity = Array.from(settlement.adaptedBuildings.values())
    .concat(settlement.freestandingBuildings)
    .filter((b) => b.typeId === 'house' && isBuildingOperational(b))
    .reduce((sum, b) => sum + (b.maxCapacity || 0), 0);
  const housedInHouses = totalPop > 0 ? Math.min(totalPop, houseBedCapacity) : 0;
  if (housedInHouses > 0) {
    const qualityBoost = Math.max(3, Math.round((15 * housedInHouses) / totalPop));
    baseScore += qualityBoost;
    factors.push({
      id: 'housing_quality_homes',
      name: 'Quality Family Housing',
      category: 'housing',
      scoreDelta: qualityBoost,
      description: `${Math.round((100 * housedInHouses) / totalPop)}% of colonists sleep in an upgraded House with private rooms and solid heating (+${qualityBoost} morale).`,
      statusType: 'positive',
    });
  }

  // -------------------------------------------------------------
  // C. SAFETY & COMBAT LOSSES (§4.5)
  // -------------------------------------------------------------
  const defenseRating = settlement.totalDefenseRating;
  if (defenseRating >= 100) {
    baseScore += 12;
    factors.push({
      id: 'safety_bastion',
      name: 'Perimeter Fortifications',
      category: 'safety',
      scoreDelta: +12,
      description: `Heavy structural defense (+${defenseRating} rating) provides peace of mind.`,
      statusType: 'positive',
    });
  } else if (defenseRating >= 40) {
    baseScore += 6;
    factors.push({
      id: 'safety_barricaded',
      name: 'Secure Perimeter',
      category: 'safety',
      scoreDelta: +6,
      description: `Perimeter defenses and watchtowers (+${defenseRating} rating) protect the sector.`,
      statusType: 'positive',
    });
  } else {
    baseScore -= 8;
    factors.push({
      id: 'safety_exposed',
      name: 'Exposed Perimeter',
      category: 'safety',
      scoreDelta: -8,
      description: 'Low structural defense rating makes the settlement vulnerable to night incursions.',
      statusType: 'negative',
    });
  }

  // Active Outbreaks & Contagion
  const outbreaksList = Array.from(settlement.outbreaks.values());
  const activeOutbreaks = outbreaksList.filter((o) => o.isOutbreakActive).length;
  if (activeOutbreaks > 0) {
    const penalty = Math.min(30, activeOutbreaks * 15);
    baseScore -= penalty;
    factors.push({
      id: 'safety_outbreak',
      name: 'Active Contagion Outbreak',
      category: 'safety',
      scoreDelta: -penalty,
      description: `${activeOutbreaks} building(s) in active containment lockdown! Fear of infection spreading.`,
      statusType: 'critical',
    });
  }

  // Fallen Heroes / Recent Losses
  const fallen = settlement.fallenHeroes || [];
  const recentFallen = fallen.filter((h) => currentDay - (h.diedAtInGameDay || 1) <= 4);
  if (recentFallen.length > 0) {
    const griefPenalty = Math.min(30, recentFallen.length * 10);
    baseScore -= griefPenalty;
    factors.push({
      id: 'events_casualties',
      name: 'Grief: Recent Casualties',
      category: 'events',
      scoreDelta: -griefPenalty,
      description: `Mourning ${recentFallen.length} fallen hero(es) lost to zombie attacks recently.`,
      statusType: 'negative',
    });
  }

  // -------------------------------------------------------------
  // D. WATER & SANITATION (§4.5)
  // -------------------------------------------------------------
  if (inWaterShortage) {
    baseScore -= 35;
    factors.push({
      id: 'water_depleted',
      name: 'Dehydration Crisis',
      category: 'health',
      scoreDelta: -35,
      description:
        'The colony cannot meet its water draw — the store and cistern reserves ran dry. Survivors are going without water until collection or supply resumes.',
      statusType: 'critical',
    });
  } else if (daysOfWaterRemaining < 1.0) {
    // No unmet draw yet — this is the rationing FORECAST before the crisis.
    baseScore -= 18;
    factors.push({
      id: 'water_low',
      name: 'Water Rationing',
      category: 'health',
      scoreDelta: -18,
      description: `Less than 1 day of potable water remaining (${totalWater}L available).`,
      statusType: 'negative',
    });
  } else if (daysOfWaterRemaining >= 4.0) {
    baseScore += 10;
    factors.push({
      id: 'water_plentiful',
      name: 'Clean Water Security',
      category: 'health',
      scoreDelta: +10,
      description: `Ample purified water and cistern reserves (${daysOfWaterRemaining} days).`,
      statusType: 'positive',
    });
  }

  // -------------------------------------------------------------
  // E. MEDICAL & AMENITIES
  // -------------------------------------------------------------
  const allBuildings = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...settlement.freestandingBuildings,
  ];
  const hasClinic = allBuildings.some(
    (b) =>
      (b.typeId === 'infirmary_clinic' || b.typeId === 'medbay') &&
      isBuildingOperational(b)
  );
  const hasCommunityHall = allBuildings.some(
    (b) =>
      (b.typeId === 'community_hall' || b.typeId === 'gathering_place') &&
      isBuildingOperational(b)
  );

  if (hasClinic) {
    baseScore += 6;
    factors.push({
      id: 'health_clinic',
      name: 'Medical Infirmary Operational',
      category: 'health',
      scoreDelta: +6,
      description: 'Doctors and triage beds provide immediate treatment for injuries and bites.',
      statusType: 'positive',
    });
  }
  const beerDemandPerDay = totalPop * 0.25;
  const beerAvailable = stockpile.materials.beer || 0;
  const beerDays = beerDemandPerDay > 0 ? beerAvailable / beerDemandPerDay : 99;
  const hasBar = allBuildings.some((b) => b.typeId === 'bar' && isBuildingOperational(b));
  if (hasBar && beerAvailable >= beerDemandPerDay) {
    baseScore += 10;
    factors.push({
      id: 'amenity_beer',
      name: 'Beer Rations Available',
      category: 'events',
      scoreDelta: 10,
      description: `The bar is meeting daily recreation demand (${beerDays.toFixed(1)} days stocked).`,
      statusType: 'positive',
    });
  } else if (hasBar || beerAvailable > 0) {
    baseScore -= 6;
    factors.push({
      id: 'amenity_beer_shortage',
      name: 'Beer Shortage',
      category: 'events',
      scoreDelta: -6,
      description: `Recreation demand is unmet (${beerAvailable.toFixed(1)} beer for ${beerDemandPerDay.toFixed(1)} required daily).`,
      statusType: 'negative',
    });
  }

  const childCount = (settlement.generalPopulation?.children || []).length;
  const childcareCapacity = allBuildings
    .filter((b) => b.typeId === 'kindergarten' && isBuildingOperational(b))
    .reduce((sum, b) => sum + (FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId]?.civilianProperties?.childcareCapacity || 0), 0);
  if (childCount > 0 && childcareCapacity >= childCount) {
    baseScore += 10;
    factors.push({
      id: 'amenity_childcare',
      name: 'Childcare Demand Met',
      category: 'events',
      scoreDelta: 10,
      description: `${childCount} children are covered by operational kindergarten capacity.`,
      statusType: 'positive',
    });
  } else if (childCount > 0) {
    const penalty = Math.min(15, Math.ceil((childCount - childcareCapacity) * 2));
    baseScore -= penalty;
    factors.push({
      id: 'amenity_childcare_shortage',
      name: 'Childcare Shortage',
      category: 'events',
      scoreDelta: -penalty,
      description: `${childCount - childcareCapacity} children lack childcare coverage.`,
      statusType: 'negative',
    });
  }

  if (hasCommunityHall) {
    baseScore += 8;
    factors.push({
      id: 'social_hall',
      name: 'Community Hall Fellowship',
      category: 'events',
      scoreDelta: +8,
      description: 'Civic gatherings and shared meals strengthen communal resilience.',
      statusType: 'positive',
    });
  }

  // -------------------------------------------------------------
  // E2. LAWS & POLICY (§IFZ Major Update #5) — enacted through the
  //     Gathering Place. The active law carries a standing satisfaction effect.
  // -------------------------------------------------------------
  const activeLaw = getActiveLaw(settlement);
  if (activeLaw.moraleDelta !== 0) {
    baseScore += activeLaw.moraleDelta;
    factors.push({
      id: `law_${activeLaw.id}`,
      name: `Law: ${activeLaw.name}`,
      category: 'events',
      scoreDelta: activeLaw.moraleDelta,
      description: activeLaw.moraleDescription,
      statusType: activeLaw.moraleDelta > 0 ? 'positive' : 'negative',
    });
  }

  // -------------------------------------------------------------
  // F. WEATHER / SEASON IMPACT (§9)
  // -------------------------------------------------------------
  if (weatherState) {
    if (weatherState.currentSeason === 'winter') {
      const cropStats = calculateCropYieldFactors(
        weatherState.currentSeason,
        weatherState.currentWeather,
        settlement
      );
      if (cropStats.greenhouseCount === 0) {
        baseScore -= 12;
        factors.push({
          id: 'weather_winter_frost',
          name: 'Harsh Winter Frost (Unmitigated)',
          category: 'events',
          scoreDelta: -12,
          description: 'Freezing temperatures destroyed outdoor crops. Colony lacks greenhouses for food.',
          statusType: 'negative',
        });
      } else {
        baseScore += 4;
        factors.push({
          id: 'weather_winter_insulated',
          name: 'Greenhouse Winter Shelter',
          category: 'events',
          scoreDelta: +4,
          description: `Winter frost successfully mitigated by ${cropStats.greenhouseCount} heated greenhouse(s).`,
          statusType: 'positive',
        });
      }
    }
  }

  // Clamp final score to 0 - 100
  const overallScore = Math.max(0, Math.min(100, Math.round(baseScore)));

  // Tier Classification
  let tier: MoraleTier = 'content';
  let tierLabel = 'Content & Stable';
  let tierDescription = 'Survivors are optimistic and working steadily with standard efficiency.';

  if (overallScore >= 85) {
    tier = 'euphoric';
    tierLabel = 'Euphoric & Inspired';
    tierDescription =
      'High morale across all quarters! Work productivity is boosted (+30%) and tactical combat effectiveness is elevated (+15%).';
  } else if (overallScore >= 65) {
    tier = 'content';
    tierLabel = 'Content & Stable';
    tierDescription =
      'Stable morale. Standard production efficiency and regular colony birth-rate / growth.';
  } else if (overallScore >= 40) {
    tier = 'discontent';
    tierLabel = 'Discontent & Fatigued';
    tierDescription =
      'Grievances are spreading. Production speed reduced (-30%), combat firepower degraded (-20%), and passive growth is halted.';
  } else {
    tier = 'despair';
    tierLabel = 'Critical Despair';
    tierDescription =
      'Colony on the verge of collapse! Severe labor slowdown (-65%), combat disarray (-40%), and growth completely frozen.';
  }

  // Calculate Modifiers
  const modifiers: MoraleModifiers = calculateMoraleModifiers(overallScore);

  // Passive Growth Status
  const previousGrowth = settlement.morale?.passiveGrowth || createInitialPassiveGrowthState();
  const growthEval = evaluatePassiveGrowthStatus(
    overallScore,
    daysOfFoodRemaining,
    inWaterShortage,
    daysOfWaterRemaining,
    housingDeficit,
    activeOutbreaks,
    previousGrowth
  );

  return {
    overallScore,
    tier,
    tierLabel,
    tierDescription,
    factors,
    modifiers,
    passiveGrowth: growthEval,
    dailyFoodConsumption,
    daysOfFoodRemaining,
    dailyWaterConsumption,
    daysOfWaterRemaining,
  };
}

// ==========================================
// 3. Morale Modifiers Calculator (§4.5)
// ==========================================

export function calculateMoraleModifiers(overallScore: number): MoraleModifiers {
  if (overallScore >= 85) {
    return {
      productivityMultiplier: 1.3, // +30% faster construction/farming/crafting
      combatDamageMultiplier: 1.15, // +15% squad damage
      combatFireRateMultiplier: 1.1, // +10% faster weapon discharge
      combatCritBonus: 0.08,
      passiveGrowthMultiplier: 1.5, // +50% faster birth rate
    };
  } else if (overallScore >= 65) {
    return {
      productivityMultiplier: 1.0,
      combatDamageMultiplier: 1.0,
      combatFireRateMultiplier: 1.0,
      combatCritBonus: 0.0,
      passiveGrowthMultiplier: 1.0,
    };
  } else if (overallScore >= 40) {
    return {
      productivityMultiplier: 0.7, // -30% slower
      combatDamageMultiplier: 0.8, // -20% weapon damage
      combatFireRateMultiplier: 0.85,
      combatCritBonus: 0.0,
      passiveGrowthMultiplier: 0.0, // Growth frozen
    };
  } else {
    return {
      productivityMultiplier: 0.35, // -65% severe stall
      combatDamageMultiplier: 0.6, // -40% damage
      combatFireRateMultiplier: 0.7,
      combatCritBonus: 0.0,
      passiveGrowthMultiplier: 0.0, // Growth frozen
    };
  }
}

// ==========================================
// 4. Passive Population Growth Evaluator (§4.5)
// ==========================================

function evaluatePassiveGrowthStatus(
  overallScore: number,
  daysOfFood: number,
  inWaterShortage: boolean,
  daysOfWater: number,
  housingDeficit: number,
  activeOutbreaks: number,
  prev: PassiveGrowthState
): PassiveGrowthState {
  let isGrowing = true;
  let blockReason: string | null = null;
  let ratePercentPerDay = 25; // Standard 25% per day (new citizen every 4 in-game days)

  if (activeOutbreaks > 0) {
    isGrowing = false;
    blockReason = 'Halted: Active outbreak containment in progress';
    ratePercentPerDay = 0;
  } else if (daysOfFood < 1.5) {
    isGrowing = false;
    blockReason = 'Halted: Food reserves critically low';
    ratePercentPerDay = 0;
  } else if (inWaterShortage) {
    // REAL unmet draw — the colony is going without water right now.
    isGrowing = false;
    blockReason = 'Halted: Water shortage — the store and cistern reserves are dry';
    ratePercentPerDay = 0;
  } else if (daysOfWater < 1.5) {
    // Not short yet, but the forecast says rationing is days away.
    isGrowing = false;
    blockReason = 'Halted: Water reserves depleted';
    ratePercentPerDay = 0;
  } else if (housingDeficit > 0) {
    isGrowing = false;
    blockReason = `Halted: Overcrowded (${housingDeficit} unhoused). Build Shelter Bunkhouses.`;
    ratePercentPerDay = 0;
  } else if (overallScore < 60) {
    isGrowing = false;
    blockReason = `Halted: Colony morale too low (${overallScore}/100, requires 60+)`;
    ratePercentPerDay = 0;
  } else {
    // Scaling rate with high morale
    if (overallScore >= 85) {
      ratePercentPerDay = 38; // ~2.6 in-game days per new resident
    } else {
      ratePercentPerDay = 25; // 4 in-game days
    }
  }

  const remainingPercent = Math.max(0, 100 - prev.currentProgress);
  const estimatedDaysRemaining =
    ratePercentPerDay > 0 ? Math.round((remainingPercent / ratePercentPerDay) * 10) / 10 : 999;

  return {
    currentProgress: prev.currentProgress,
    ratePercentPerDay,
    isGrowing,
    blockReason,
    totalBirthsAndArrivals: prev.totalBirthsAndArrivals,
    lastArrivalDay: prev.lastArrivalDay,
    estimatedDaysRemaining,
  };
}

// ==========================================
// 5. Morale & Passive Growth Tick Simulation (§4.5, §9)
// ==========================================

export function tickMoraleAndGrowthSimulation(
  settlement: SettlementState,
  weatherState: WeatherState,
  deltaSeconds: number,
  clockSpeed: number,
  currentDay: number
): {
  newState: SettlementState;
  newResidentArrived: boolean;
  residentName?: string;
  notification?: { title: string; desc: string; type: 'info' | 'warn' | 'success' };
} {
  if (clockSpeed === 0) {
    return { newState: settlement, newResidentArrived: false };
  }

  const effectiveDelta = deltaSeconds * clockSpeed;
  // 1 in-game day = 600 real seconds (10 minutes) at 1x speed.
  const fractionOfDay = effectiveDelta / 600.0;

  // Age tracked children from elapsed simulation time. A child born on day N
  // becomes an adult on day N + 16 and joins the worker pool automatically.
  const generalPopulation = settlement.generalPopulation;
  const children = generalPopulation.children || [];
  const adultChildren = children.filter((child) => child.age >= 16 || currentDay - child.bornAtDay >= 16);
  const remainingChildren = children
    .filter((child) => child.age < 16 && currentDay - child.bornAtDay < 16)
    .map((child) => ({ ...child, age: Math.max(child.age, currentDay - child.bornAtDay) }));
  const agedChildCount = adultChildren.length;
  const agedGeneralPopulation = agedChildCount > 0
    ? {
        ...generalPopulation,
        children: remainingChildren,
        unassigned: (generalPopulation.unassigned || 0) + agedChildCount,
      }
    : generalPopulation;
  const settlementWithAgedChildren = agedChildCount > 0
    ? { ...settlement, generalPopulation: agedGeneralPopulation }
    : settlement;

  if (agedChildCount > 0) {
    settlement = recalculateLaborDistribution(settlementWithAgedChildren);
  }

  // 1. Consume food and water based on time elapsed
  let currentStock = { ...settlement.stockpile };
  const totalPop = Math.max(1, (settlement.namedSurvivors?.length || 0) + (typeof settlement.generalPopulation === 'number' ? settlement.generalPopulation : (settlement.generalPopulation?.total || 0)));
  const foodToConsume = totalPop * 0.5 * fractionOfDay;

  // Deduct food: consume fresh harvest first, then dried, then canned, then MREs
  let remainingFoodCost = foodToConsume;
  const newFood = { ...currentStock.food };

  // §IFZ Scrapyard economy — used cans are real waste: the metal a canned
  // ration arrived in does not vanish when the food is eaten. Every unit of
  // canned_goods actually consumed returns as scrap metal (the tin), which
  // a staffed Scrapyard later recycles into refined metal.
  const USED_CANS_TO_SCRAP_RATIO = 0.25;
  let cannedConsumed = 0;

  if (newFood.fresh_harvest > 0) {
    const take = Math.min(newFood.fresh_harvest, remainingFoodCost);
    newFood.fresh_harvest -= take;
    remainingFoodCost -= take;
  }
  if (remainingFoodCost > 0 && newFood.dried_rations > 0) {
    const take = Math.min(newFood.dried_rations, remainingFoodCost);
    newFood.dried_rations -= take;
    remainingFoodCost -= take;
  }
  if (remainingFoodCost > 0 && newFood.canned_goods > 0) {
    const take = Math.min(newFood.canned_goods, remainingFoodCost);
    newFood.canned_goods -= take;
    cannedConsumed += take;
    remainingFoodCost -= take;
  }
  if (remainingFoodCost > 0 && newFood.mre_rations > 0) {
    const take = Math.min(newFood.mre_rations, remainingFoodCost);
    newFood.mre_rations -= take;
    remainingFoodCost -= take;
  }

  // 2. Water economy — SINGLE AUTHORITY in waterService. Morale keeps no private
  // water ledger: settlement-wide demand (population drinking + medical +
  // industrial draw) is calculated there and consumed from the disposable store
  // (rainwater → purified → bottled) then the cistern buffer reserve in one
  // pass. Unmet demand lands in waterState.shortageDays by that same pass.
  // Rain collection (cistern roof catchment) already ran in tickWaterEconomy
  // earlier in the pipeline, so nothing is produced here either.
  let state = settlement;
  state = consumeSettlementWater(state, calculateWaterDemand(state) * fractionOfDay).newState;

  // 3. Agricultural production is handled exclusively by operational Field and
  // Greenhouse buildings in tickSettlementSimulation(). This prevents a second
  // global food-worker harvest stream from double-counting crop output.

  // 4. Permaculture Tech passive generation (+12 food/day, +20 L water/day).
  // Food lands in the same stockpile copy as the deduction above; the water
  // side writes through waterService so every water mutation stays there.
  if (isResearchUnlocked(state, 'survival_permaculture')) {
    newFood.fresh_harvest += 12 * fractionOfDay;
    state = addWaterToStockpile(state, { purified_water: 20 }, fractionOfDay);
  }

  // Commit the day's canned-tin waste alongside the consumed food.
  const tinWaste = Math.floor(cannedConsumed * USED_CANS_TO_SCRAP_RATIO);
  const stockpileWithWaste = tinWaste > 0
    ? {
        ...state.stockpile,
        materials: {
          ...state.stockpile.materials,
          scrap: (state.stockpile.materials.scrap || 0) + tinWaste,
        },
      }
    : state.stockpile;

  const intermediateSettlement: SettlementState = {
    ...state,
    stockpile: { ...stockpileWithWaste, food: newFood },
  };

  // 3. Re-calculate Morale State
  const newMorale = calculateSettlementMorale(intermediateSettlement, weatherState, currentDay);

  // 4. Advance Passive Population Growth Progress
  let growth = { ...newMorale.passiveGrowth };
  let newResidentArrived = false;
  let residentName: string | undefined;
  let notif: { title: string; desc: string; type: 'info' | 'warn' | 'success' } | undefined;

  if (growth.isGrowing && growth.ratePercentPerDay > 0) {
    const progressDelta = growth.ratePercentPerDay * fractionOfDay;
    growth.currentProgress += progressDelta;

    if (growth.currentProgress >= 100) {
      growth.currentProgress = 0;
      growth.totalBirthsAndArrivals += 1;
      growth.lastArrivalDay = currentDay;
      newResidentArrived = true;

      // Add 1 civilian to general population pool — must also land in the
      // unassigned pool, otherwise they exist in `total` but no worker pool
      // (invisible citizens that break the roster accounting).
      const updatedGeneral = {
        ...settlement.generalPopulation,
        total: settlement.generalPopulation.total + 1,
        children: [...(settlement.generalPopulation.children || []), {
          id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          age: 0,
          bornAtDay: currentDay,
        }],
        unassigned: (settlement.generalPopulation.unassigned || 0) + 1,
      };

      const residentTypes = ['Newborn Citizen', 'Wandering Refugee', 'Peaceful Settler', 'Recovered Survivor'];
      residentName = residentTypes[Math.floor(Math.random() * residentTypes.length)];

      notif = {
        title: 'COLONY POPULATION EXPANSION',
        desc: `High morale and food security welcomed a ${residentName} into the colony! Total Pop: ${
          (settlement.namedSurvivors?.length || 0) + updatedGeneral.total
        }`,
        type: 'success',
      };

      const stateWithPop: SettlementState = {
        ...intermediateSettlement,
        generalPopulation: updatedGeneral,
        morale: {
          ...newMorale,
          passiveGrowth: growth,
        },
      };

      return {
        newState: recalculateLaborDistribution(stateWithPop),
        newResidentArrived: true,
        residentName,
        notification: notif,
      };
    }
  }

  return {
    newState: {
      ...intermediateSettlement,
      morale: {
        ...newMorale,
        passiveGrowth: growth,
      },
    },
    newResidentArrived: false,
  };
}
