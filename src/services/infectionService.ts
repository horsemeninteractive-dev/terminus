import {
  CheckupDiagnosis,
  DeathCause,
  FallenHeroRecord,
  InfectionStage,
  SurvivorInfection,
  TreatmentResult,
  BuildingOutbreakState,
} from '../types/infection';
import { BuildingPolygon, Point2D } from '../types/map';
import { NamedSurvivor, StatTier, SurvivorStats } from '../types/population';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { ZombieUnit, ZombieVariant } from '../types/combat';
import { createZombieUnit } from './combatService';
import { vacateSurvivorRole } from './populationService';
import { isResearchUnlocked } from './researchService';

// ==========================================
// 1. Zombie Bite & Field Infection Rolls (§6.2)
// ==========================================

export function rollBiteChance(variant: ZombieVariant, settlement?: SettlementState): number {
  let baseChance = 0.15;
  switch (variant) {
    case 'runner':
      baseChance = 0.25; // 25% chance on melee hit
      break;
    case 'brute':
      baseChance = 0.35; // 35% chance on melee hit
      break;
    case 'shambler':
    default:
      baseChance = 0.15; // 15% chance on melee hit
      break;
  }

  // Medical Research: Experimental Necro-Vaccine (§10) halves field bite chance
  if (settlement && isResearchUnlocked(settlement, 'medical_vaccine')) {
    baseChance *= 0.5;
  }

  return baseChance;
}

export function createSurvivorInfection(
  survivorId: string,
  survivorName: string,
  isNamed: boolean,
  biteSource = 'Field Skirmish'
): SurvivorInfection {
  const incubationDurationSec = 75 + Math.floor(Math.random() * 35); // 75 - 110s
  const symptomDurationSec = 90 + Math.floor(Math.random() * 40);    // 90 - 130s
  const advancedDurationSec = 60 + Math.floor(Math.random() * 30);   // 60 - 90s
  const totalTurnTimeSec = incubationDurationSec + symptomDurationSec + advancedDurationSec;

  return {
    id: survivorId,
    survivorId,
    survivorName,
    isNamed,
    stage: 'incubation',
    bittenAt: Date.now(),
    incubationDurationSec,
    symptomDurationSec,
    advancedDurationSec,
    totalTurnTimeSec,
    elapsedSec: 0,
    isConfirmedByMedbay: false,
    isQuarantined: false,
    treatmentAttempts: 0,
    biteSource,
  };
}

// ==========================================
// 2. Triage Diagnostic Check-up (§6.2, §10)
// ==========================================

export function diagnoseSurvivor(
  survivor: NamedSurvivor | { id: string; name: string },
  infection?: SurvivorInfection | null,
  doctor?: NamedSurvivor | null,
  settlement?: SettlementState
): CheckupDiagnosis {
  if (!infection || infection.stage === 'uninfected' || infection.stage === 'cured') {
    return {
      survivorId: survivor.id,
      survivorName: survivor.name,
      isInfected: false,
      stage: 'uninfected',
      pathogenLoad: 0,
      remainingTurnSeconds: Infinity,
      currentCureOdds: 100,
      recommendedAction: 'healthy_discharge',
      doctorNotes: 'Subject displays normal vitals, clear bloodstream, and no viral RNA markers.',
    };
  }

  const remainingTurnSeconds = Math.max(0, infection.totalTurnTimeSec - infection.elapsedSec);
  const pathogenLoad = Math.min(100, Math.round((infection.elapsedSec / infection.totalTurnTimeSec) * 100));

  const hasAntiseptics = settlement ? isResearchUnlocked(settlement, 'medical_antiseptics') : false;
  const hasAntivirals = settlement ? isResearchUnlocked(settlement, 'medical_antivirals') : false;
  const hasVaccine = settlement ? isResearchUnlocked(settlement, 'medical_vaccine') : false;

  let currentCureOdds = 90;
  if (infection.stage === 'incubation') {
    currentCureOdds = hasAntivirals ? 98 : 90;
  } else if (infection.stage === 'symptomatic') {
    currentCureOdds = hasAntivirals ? 95 : 70;
  } else if (infection.stage === 'advanced') {
    currentCureOdds = hasAntivirals
      ? 75
      : remainingTurnSeconds < 30
      ? 12
      : 35;
  } else if (infection.stage === 'turned') {
    currentCureOdds = 0;
  }

  // Antiseptics bonus (+15%)
  if (hasAntiseptics && infection.stage !== 'turned') {
    currentCureOdds = Math.min(98, currentCureOdds + 15);
  }

  // Doctor bonus
  if (doctor && doctor.stats.medical === 'expert') {
    currentCureOdds = Math.min(98, currentCureOdds + 15);
  } else if (doctor && doctor.stats.medical === 'skilled') {
    currentCureOdds = Math.min(95, currentCureOdds + 8);
  }

  if (hasVaccine && infection.stage !== 'turned') {
    currentCureOdds = 98;
  }

  let recommendedAction: CheckupDiagnosis['recommendedAction'] = 'immediate_treatment';
  let doctorNotes = '';

  const researchNoteSuffix = hasAntivirals
    ? ' [Advanced Antivirals Active: +25-40% Cure Odds]'
    : hasAntiseptics
    ? ' [Field Antiseptics Active: +15% Cure Odds]'
    : '';

  if (infection.stage === 'incubation') {
    recommendedAction = 'immediate_treatment';
    doctorNotes = `EARLY DETECTION: Pathogen is incubating in deep lymphatic tissues (${pathogenLoad}% load). Early therapy yields a ${currentCureOdds}% recovery prognosis.${researchNoteSuffix}`;
  } else if (infection.stage === 'symptomatic') {
    recommendedAction = 'immediate_treatment';
    doctorNotes = `ACTIVE SYMPTOMS: High fever, tremors, vascular irritation (${pathogenLoad}% load). Immediate therapy advised (${currentCureOdds}% cure odds).${researchNoteSuffix}`;
  } else if (infection.stage === 'advanced') {
    recommendedAction = infection.isQuarantined ? 'immediate_treatment' : 'quarantine_isolate';
    doctorNotes = `CRITICAL NECROSIS: Severe cellular degradation. Time to turn: ${Math.round(remainingTurnSeconds)}s.${hasAntivirals ? ' Advanced Antiviral protocol gives strong 75% recovery window!' : ' Immediate quarantine imperative!'}${researchNoteSuffix}`;
  } else if (infection.stage === 'turned') {
    recommendedAction = 'terminal_isolation';
    doctorNotes = 'TERMINAL: Subject has completely succumbed to necrosis and reanimated as an aggressive pathogen host.';
  }

  return {
    survivorId: survivor.id,
    survivorName: survivor.name,
    isInfected: true,
    stage: infection.stage,
    pathogenLoad,
    remainingTurnSeconds,
    currentCureOdds,
    recommendedAction,
    doctorNotes,
  };
}

// ==========================================
// 3. Treatment Administration (§6.2)
// ==========================================

export function administerTreatment(
  state: SettlementState,
  survivorId: string,
  doctorSurvivorId?: string
): { success: boolean; newState: SettlementState; result: TreatmentResult } {
  const infection = state.infections.get(survivorId);
  if (!infection || infection.stage === 'cured' || infection.stage === 'uninfected') {
    return {
      success: false,
      newState: state,
      result: {
        success: false,
        cured: false,
        turned: false,
        cureOddsPercentage: 0,
        doctorBonusPercentage: 0,
        message: 'Survivor is not currently infected.',
      },
    };
  }

  if (infection.stage === 'turned') {
    return {
      success: false,
      newState: state,
      result: {
        success: false,
        cured: false,
        turned: true,
        cureOddsPercentage: 0,
        doctorBonusPercentage: 0,
        message: 'Survivor has already turned into an infected zombie.',
      },
    };
  }

  // Stockpile resource check: Requires 1 Antibiotics + (1 Sterile Bandage OR 1 First Aid Kit)
  const med = state.stockpile.medical;
  const hasAntibiotics = med.antibiotics >= 1;
  const hasSupplies = med.first_aid_kits >= 1 || med.sterile_bandages >= 1;

  if (!hasAntibiotics || !hasSupplies) {
    return {
      success: false,
      newState: state,
      result: {
        success: false,
        cured: false,
        turned: false,
        cureOddsPercentage: 0,
        doctorBonusPercentage: 0,
        message: 'Insufficient medical stockpile! Requires 1x Antibiotics and 1x First Aid Kit or Sterile Bandage.',
      },
    };
  }

  // Deduct medical supplies
  const updatedMedical = { ...med };
  updatedMedical.antibiotics -= 1;
  if (updatedMedical.first_aid_kits >= 1) {
    updatedMedical.first_aid_kits -= 1;
  } else {
    updatedMedical.sterile_bandages -= 1;
  }

  // Determine Doctor
  const doctor = doctorSurvivorId
    ? state.namedSurvivors.find((s) => s.id === doctorSurvivorId)
    : state.namedSurvivors.find((s) => s.stats.medical === 'expert' || s.role.type === 'building_head');

  let doctorBonus = 0;
  if (doctor) {
    if (doctor.stats.medical === 'expert') doctorBonus = 20;
    else if (doctor.stats.medical === 'skilled') doctorBonus = 10;
    else doctorBonus = 5;
  }

  // Base cure odds scale with how early it's caught (§6.2, §10)
  const hasAntiseptics = isResearchUnlocked(state, 'medical_antiseptics');
  const hasAntivirals = isResearchUnlocked(state, 'medical_antivirals');
  const hasVaccine = isResearchUnlocked(state, 'medical_vaccine');

  let baseOdds = 70;
  const remainingSec = Math.max(0, infection.totalTurnTimeSec - infection.elapsedSec);

  if (infection.stage === 'incubation') {
    baseOdds = hasAntivirals ? 98 : 90; // Caught during incubation
  } else if (infection.stage === 'symptomatic') {
    baseOdds = hasAntivirals ? 95 : 68; // Caught with early symptoms
  } else if (infection.stage === 'advanced') {
    baseOdds = hasAntivirals
      ? 75
      : remainingSec < 30
      ? 10
      : 30; // Caught late/critical
  }

  // Antiseptics bonus (+15%)
  if (hasAntiseptics) {
    baseOdds += 15;
  }

  let finalOdds = Math.min(98, Math.max(5, baseOdds + doctorBonus));
  if (hasVaccine) {
    finalOdds = 98; // Guaranteed maximum under vaccine protocol
  }

  const roll = Math.random() * 100;
  const cured = roll <= finalOdds;

  const updatedInfections = new Map(state.infections);

  if (cured) {
    updatedInfections.set(survivorId, {
      ...infection,
      stage: 'cured',
      isConfirmedByMedbay: true,
      lastTreatedAt: Date.now(),
    });
  } else {
    updatedInfections.set(survivorId, {
      ...infection,
      treatmentAttempts: infection.treatmentAttempts + 1,
      isConfirmedByMedbay: true,
      lastTreatedAt: Date.now(),
    });
  }

  const newState: SettlementState = {
    ...state,
    stockpile: {
      ...state.stockpile,
      medical: updatedMedical,
    },
    infections: updatedInfections,
  };

  const message = cured
    ? `SUCCESS: Therapy arrested necrosis! ${infection.survivorName} has been cured (${finalOdds}% odds rolled ${Math.round(roll)}).`
    : `FAILED: Pathogen resisted the medical cocktail (${finalOdds}% odds rolled ${Math.round(roll)}). Symptoms continue to advance.`;

  return {
    success: true,
    newState,
    result: {
      success: true,
      cured,
      turned: false,
      cureOddsPercentage: finalOdds,
      doctorBonusPercentage: doctorBonus,
      doctorName: doctor?.name,
      message,
    },
  };
}

// ==========================================
// 4. Quarantine & Isolation Ward (§6.2, §6.3)
// ==========================================

export function toggleQuarantineSurvivor(
  state: SettlementState,
  survivorId: string,
  quarantine: boolean,
  buildingId?: string | number
): { success: boolean; newState: SettlementState; message: string } {
  const infection = state.infections.get(survivorId);
  const survivor = state.namedSurvivors.find((s) => s.id === survivorId);

  if (!infection && !survivor) {
    return { success: false, newState: state, message: 'Survivor not found.' };
  }

  let updatedState = state;

  // If putting into quarantine, vacate any active roles/squads so they don't roam
  if (quarantine && survivor) {
    updatedState = vacateSurvivorRole(updatedState, survivorId);
  }

  const updatedInfections = new Map(updatedState.infections);
  const existingInfection = updatedInfections.get(survivorId) || createSurvivorInfection(
    survivorId,
    survivor ? survivor.name : 'Unknown',
    !!survivor,
    'Precautionary Isolation'
  );

  updatedInfections.set(survivorId, {
    ...existingInfection,
    isQuarantined: quarantine,
    quarantineBuildingId: quarantine ? buildingId : undefined,
  });

  return {
    success: true,
    newState: {
      ...updatedState,
      infections: updatedInfections,
    },
    message: quarantine
      ? `${existingInfection.survivorName} placed in isolated quarantine ward.`
      : `${existingInfection.survivorName} released from quarantine.`,
  };
}

// ==========================================
// 5. Permanent Death & Memorial Handler (§6.2, §6.3)
// ==========================================

export function recordFallenHero(
  state: SettlementState,
  survivorId: string,
  cause: DeathCause,
  locationName: string,
  inGameDay: number,
  details?: string
): { newState: SettlementState; fallenRecord: FallenHeroRecord } {
  const namedSurvivor = state.namedSurvivors.find((s) => s.id === survivorId);
  const infection = state.infections.get(survivorId);

  const name = namedSurvivor ? namedSurvivor.name : infection ? infection.survivorName : 'General Settler';
  const isNamed = !!namedSurvivor;

  const roleDesc = namedSurvivor
    ? namedSurvivor.role.type === 'squad_leader'
      ? `Squad Leader of ${namedSurvivor.role.squadName}`
      : namedSurvivor.role.type === 'building_head'
      ? `${namedSurvivor.role.title} at ${namedSurvivor.role.facilityName}`
      : 'Unassigned Specialist'
    : 'General Colony Laborer';

  const defaultDetails =
    cause === 'infection_turned'
      ? `Succumbed to necrotic infection and turned into an infected host.`
      : cause === 'euthanized_quarantine'
      ? `Safely neutralized in containment after terminal necrosis in isolation ward.`
      : cause === 'outbreak_casualty'
      ? `Killed during an uncontained settlement outbreak in ${locationName}.`
      : `Killed in the line of duty during tactical combat in ${locationName}.`;

  const fallenRecord: FallenHeroRecord = {
    id: `fallen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    survivorId,
    name,
    avatarSeed: namedSurvivor?.avatarSeed,
    isNamed,
    stats: namedSurvivor?.stats,
    roleDescription: roleDesc,
    diedAtInGameDay: inGameDay,
    diedAtTimestamp: Date.now(),
    causeOfDeath: cause,
    locationName,
    details: details || defaultDetails,
  };

  // 1. If named survivor, permanently remove from namedSurvivors & vacate role
  let cleanedState = namedSurvivor ? vacateSurvivorRole(state, survivorId) : state;
  const updatedNamed = cleanedState.namedSurvivors.filter((s) => s.id !== survivorId);

  // 2. If general population, reduce headcount
  let updatedGeneral = { ...cleanedState.generalPopulation };
  if (!isNamed) {
    updatedGeneral.total = Math.max(0, updatedGeneral.total - 1);
  }

  // 3. Mark infection as turned / resolved
  const updatedInfections = new Map(cleanedState.infections);
  if (infection) {
    updatedInfections.set(survivorId, {
      ...infection,
      stage: 'turned',
    });
  }

  const newState: SettlementState = {
    ...cleanedState,
    namedSurvivors: updatedNamed,
    generalPopulation: updatedGeneral,
    infections: updatedInfections,
    fallenHeroes: [fallenRecord, ...cleanedState.fallenHeroes],
  };

  return { newState, fallenRecord };
}

// ==========================================
// 6. Complete Infection Simulation Loop (§6.2, §6.3)
// ==========================================

export interface InfectionTickResult {
  newState: SettlementState;
  newZombies: ZombieUnit[];
  notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[];
}

export function tickInfectionSimulation(
  state: SettlementState,
  deltaSec: number,
  speed: number,
  inGameDay: number
): InfectionTickResult {
  if (speed === 0) {
    return { newState: state, newZombies: [], notifications: [] };
  }

  const effectiveDelta = deltaSec * speed;
  const newZombies: ZombieUnit[] = [];
  const notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[] = [];

  let currentState = { ...state };
  const updatedInfections = new Map(currentState.infections);
  const updatedOutbreaks = new Map(currentState.outbreaks);

  const hasCryoQuarantine = isResearchUnlocked(currentState, 'medical_cryo_quarantine');

  // 1. Process Active Infections
  for (const [id, inf] of updatedInfections.entries()) {
    if (inf.stage === 'uninfected' || inf.stage === 'cured' || inf.stage === 'turned') {
      continue;
    }

    // Medical Research: Cryo-Stabilization Pods (§10) slows necrosis progression by 50% for quarantined patients
    const timeProgression = inf.isQuarantined && hasCryoQuarantine ? effectiveDelta * 0.5 : effectiveDelta;
    const nextElapsed = inf.elapsedSec + timeProgression;
    let nextStage: InfectionStage = inf.stage;

    // Transition 1: Incubation -> Symptomatic (§6.2)
    if (inf.stage === 'incubation' && nextElapsed >= inf.incubationDurationSec) {
      nextStage = 'symptomatic';
      notifications.push({
        title: '⚠️ MEDICAL ALERT: SYMPTOMS DETECTED',
        desc: `${inf.survivorName} has begun exhibiting visible symptoms (fever, tremors, pale skin)! Send to Medbay for triage check-up!`,
        type: 'warn',
      });
    }
    // Transition 2: Symptomatic -> Advanced (§6.2)
    else if (
      inf.stage === 'symptomatic' &&
      nextElapsed >= inf.incubationDurationSec + inf.symptomDurationSec
    ) {
      nextStage = 'advanced';
      notifications.push({
        title: '🚨 CRITICAL: ADVANCED INFECTION',
        desc: `${inf.survivorName}'s cellular necrosis is critical! Turning is imminent without emergency medical intervention!`,
        type: 'warn',
      });
    }
    // Transition 3: Advanced -> Turned (§6.2, §6.3)
    else if (nextElapsed >= inf.totalTurnTimeSec) {
      nextStage = 'turned';

      // Survivor Permanently Dies & Turns!
      const isQuarantined = inf.isQuarantined;
      const deathCause: DeathCause = isQuarantined ? 'euthanized_quarantine' : 'infection_turned';

      // Find location
      const hq = currentState.hq;
      let locationName = hq ? hq.buildingName : 'Settlement Grounds';
      let spawnPos: Point2D = hq ? hq.center : { x: 0, z: 0 };
      let spawnBuildingId: string | number = hq ? hq.buildingId : 'hq';

      if (isQuarantined && inf.quarantineBuildingId) {
        const qBldg = currentState.adaptedBuildings.get(inf.quarantineBuildingId);
        if (qBldg) {
          locationName = qBldg.name;
          spawnPos = qBldg.position;
          spawnBuildingId = qBldg.buildingId;
        }
      }

      // Record permanent death
      const { newState: stateAfterDeath } = recordFallenHero(
        currentState,
        id,
        deathCause,
        locationName,
        inGameDay,
        isQuarantined
          ? `${inf.survivorName} turned inside isolation ward; neutralized safely.`
          : `${inf.survivorName} succumbed to infection and reanimated inside ${locationName}!`
      );
      currentState = stateAfterDeath;

      if (isQuarantined) {
        // Safe containment in isolation ward (§6.3)
        notifications.push({
          title: '🛡️ QUARANTINE CONTAINMENT SECURED',
          desc: `${inf.survivorName} turned in isolation ward. Facility security protocol safely neutralized the threat without settlement exposure.`,
          type: 'info',
        });
      } else {
        // UNQUARANTINED TURN -> BASE OUTBREAK TRIGGERED! (§6.3)
        const turnedZombie = createZombieUnit(
          'runner',
          spawnPos.x + (Math.random() - 0.5) * 4,
          spawnPos.z + (Math.random() - 0.5) * 4,
          0,
          true
        );
        turnedZombie.name = `Turned ${inf.survivorName}`;
        newZombies.push(turnedZombie);

        // Activate building outbreak
        updatedOutbreaks.set(spawnBuildingId, {
          buildingId: spawnBuildingId,
          buildingName: locationName,
          isOutbreakActive: true,
          zombieCount: 1,
          spawnedZombieIds: [turnedZombie.id],
          spreadCountdownSec: 35,
          maxSpreadCountdownSec: 35,
          isContained: false,
          turnedSurvivorName: inf.survivorName,
          originTime: Date.now(),
        });

        notifications.push({
          title: `🚨 BASE OUTBREAK IN ${locationName.toUpperCase()}!`,
          desc: `${inf.survivorName} TURNED into an infected inside the settlement! Contain or dispatch tactical squads immediately!`,
          type: 'warn',
        });
      }
    }

    updatedInfections.set(id, {
      ...inf,
      stage: nextStage,
      elapsedSec: nextElapsed,
      symptomsNoticedAt: nextStage === 'symptomatic' && !inf.symptomsNoticedAt ? Date.now() : inf.symptomsNoticedAt,
    });
  }

  // 2. Process Active Outbreaks & Building-to-Building Contamination Spread (§6.3)
  const adaptedArray = Array.from(currentState.adaptedBuildings.values());

  for (const [bldgId, outbreak] of updatedOutbreaks.entries()) {
    if (!outbreak.isOutbreakActive || outbreak.isContained) continue;

    const nextSpreadCountdown = outbreak.spreadCountdownSec - effectiveDelta;

    if (nextSpreadCountdown <= 0) {
      // Outbreak spreads to an adjacent/connected building! (§6.3)
      const currentBldg = currentState.adaptedBuildings.get(bldgId);
      const uninfectedNeighbors = adaptedArray.filter(
        (b) => String(b.buildingId) !== String(bldgId) && !updatedOutbreaks.get(b.buildingId)?.isOutbreakActive
      );

      if (uninfectedNeighbors.length > 0) {
        // Pick closest neighbor
        let targetNeighbor = uninfectedNeighbors[0];
        let minDist = Infinity;
        if (currentBldg) {
          for (const nb of uninfectedNeighbors) {
            const d = Math.hypot(nb.position.x - currentBldg.position.x, nb.position.z - currentBldg.position.z);
            if (d < minDist) {
              minDist = d;
              targetNeighbor = nb;
            }
          }
        }

        // Spawn spread zombie at neighbor
        const spreadZombie = createZombieUnit(
          'shambler',
          targetNeighbor.position.x + (Math.random() - 0.5) * 6,
          targetNeighbor.position.z + (Math.random() - 0.5) * 6,
          0,
          true
        );
        spreadZombie.name = `Outbreak Infiltrator`;
        newZombies.push(spreadZombie);

        updatedOutbreaks.set(targetNeighbor.buildingId, {
          buildingId: targetNeighbor.buildingId,
          buildingName: targetNeighbor.name,
          isOutbreakActive: true,
          zombieCount: 1,
          spawnedZombieIds: [spreadZombie.id],
          spreadCountdownSec: 30,
          maxSpreadCountdownSec: 30,
          isContained: false,
          turnedSurvivorName: outbreak.turnedSurvivorName,
          originTime: Date.now(),
        });

        notifications.push({
          title: `🚨 OUTBREAK SPREAD: ${targetNeighbor.name.toUpperCase()}`,
          desc: `Uncontained outbreak from ${outbreak.buildingName} has spread into ${targetNeighbor.name}! Dispatch tactical squads!`,
          type: 'warn',
        });
      }

      // Reset spread timer for originating building
      updatedOutbreaks.set(bldgId, {
        ...outbreak,
        spreadCountdownSec: outbreak.maxSpreadCountdownSec,
      });
    } else {
      updatedOutbreaks.set(bldgId, {
        ...outbreak,
        spreadCountdownSec: nextSpreadCountdown,
      });
    }
  }

  currentState.infections = updatedInfections;
  currentState.outbreaks = updatedOutbreaks;

  return {
    newState: currentState,
    newZombies,
    notifications,
  };
}

// ==========================================
// 7. Outbreak Containment & Sweep Action (§6.3)
// ==========================================

export function containOutbreakInBuilding(
  state: SettlementState,
  buildingId: string | number
): { success: boolean; newState: SettlementState; error?: string } {
  const outbreak = state.outbreaks.get(buildingId);
  if (!outbreak || !outbreak.isOutbreakActive) {
    return { success: false, newState: state, error: 'No active outbreak in this building.' };
  }

  const updatedOutbreaks = new Map(state.outbreaks);
  updatedOutbreaks.delete(buildingId);

  return {
    success: true,
    newState: {
      ...state,
      outbreaks: updatedOutbreaks,
    },
  };
}
