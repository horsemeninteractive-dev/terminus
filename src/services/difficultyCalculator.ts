export interface DifficultyCalculationResult {
  score: number; // 30 to 300
  percentage: string; // "125%"
  ratingStars: string; // "● ● ● ○ ○"
  tier: 'VERY EASY' | 'EASY' | 'NORMAL' | 'HARD' | 'NIGHTMARE' | 'APOCALYPSE';
  color: string;
  summary: string;
}

export function calculateDifficultyScore(params: {
  peopleLevel?: number; // 1: Low (harder), 2: Med, 3: High (easier)
  resourcesLevel?: number; // 1: Low (harder), 2: Med, 3: High (easier)
  hordesLevel?: number; // 1: Low (easier), 2: Med, 3: High (harder)
  startingPopulation?: number; // 4 to 20
  startingSupplies?: 'plentiful' | 'standard' | 'scarce';
  zombieAggression?: 'low' | 'normal' | 'high';
  difficultyPreset?: string; // 'easy' | 'normal' | 'hard' | 'nightmare' | 'custom'
  season?: string; // 'winter' | 'autumn' | 'spring' | 'summer'
  mapSize?: string; // '3x3' | '4x4' | '5x5' | '7x7' | '9x9'
  convoyStart?: boolean;
}): DifficultyCalculationResult {
  let baseScore = 100;

  // 1. People / Population impact: fewer people = harder survival start
  const people =
    params.peopleLevel ??
    (params.startingPopulation
      ? params.startingPopulation <= 6
        ? 1
        : params.startingPopulation <= 12
        ? 2
        : 3
      : 2);
  if (people === 1) baseScore += 35; // Scarce labor
  else if (people === 3) baseScore -= 25; // Abundant workforce

  // 2. Resources / Loot / Supplies: scarce loot = harder
  const resources =
    params.resourcesLevel ??
    (params.startingSupplies === 'scarce'
      ? 1
      : params.startingSupplies === 'plentiful'
      ? 3
      : 2);
  if (resources === 1) baseScore += 45; // Starvation & ammo deficit
  else if (resources === 3) baseScore -= 30; // Stockpile advantage

  // 3. Horde Size & Zombie Aggression: larger hordes = harder
  const hordes =
    params.hordesLevel ??
    (params.zombieAggression === 'high'
      ? 3
      : params.zombieAggression === 'low'
      ? 1
      : 2);
  if (hordes === 1) baseScore -= 30; // Mild incursions
  else if (hordes === 3) baseScore += 50; // Relentless sprinters & brutes

  // 4. Season impact
  if (params.season === 'winter') baseScore += 25;
  else if (params.season === 'summer') baseScore -= 10;

  // 5. Map grid defense perimeter
  if (params.mapSize === '9x9' || params.mapSize === '7x7') baseScore += 15;

  // 6. Convoy start
  if (params.convoyStart) baseScore -= 15;

  // Clamp score
  const score = Math.max(30, Math.min(300, baseScore));
  const percentage = `${Math.round(score)}%`;

  let tier: DifficultyCalculationResult['tier'] = 'NORMAL';
  let color = '#F59E0B';
  let ratingStars = '● ● ● ○ ○';
  let summary = 'Standard post-apocalyptic challenge.';

  if (score < 75) {
    tier = 'VERY EASY';
    color = '#34D399';
    ratingStars = '● ○ ○ ○ ○';
    summary = 'Abundant resources, sparse threats. Ideal for casual exploration.';
  } else if (score < 95) {
    tier = 'EASY';
    color = '#10B981';
    ratingStars = '● ● ○ ○ ○';
    summary = 'Moderate surplus, manageable night waves.';
  } else if (score <= 130) {
    tier = 'NORMAL';
    color = '#F59E0B';
    ratingStars = '● ● ● ○ ○';
    summary = 'Authentic survival balance. Tactical planning required.';
  } else if (score <= 175) {
    tier = 'HARD';
    color = '#EF4444';
    ratingStars = '● ● ● ● ○';
    summary = 'Resource scarcity and aggressive night hordes. High mortality risk.';
  } else if (score <= 220) {
    tier = 'NIGHTMARE';
    color = '#DC2626';
    ratingStars = '● ● ● ● ●';
    summary = 'Brutal attrition. Relentless infected assault.';
  } else {
    tier = 'APOCALYPSE';
    color = '#7F1D1D';
    ratingStars = '★ ★ ★ ★ ★';
    summary = 'Maximum lethality. Survival is near impossible.';
  }

  return {
    score,
    percentage,
    ratingStars,
    tier,
    color,
    summary,
  };
}
