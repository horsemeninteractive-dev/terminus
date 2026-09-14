import {
  CheckupDiagnosis,
  createEmptyPopulationInfectionState,
  DeathCause,
  FallenHeroRecord,
  InfectionStage,
  PopulationInfectionState,
  SurvivorInfection,
  TreatmentResult,
  BuildingOutbreakState,
} from '../types/infection';
import { BuildingPolygon, Point2D } from '../types/map';
import { NamedSurvivor, StatTier, SurvivorStats } from '../types/population';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { ZombieUnit, ZombieVariant } from '../types/combat';
import { createZombieUnit } from './combatService';
import { getPrimaryHQ } from './buildingOperational';
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
  if (settlement && isResearchUnlocked(settlement, 'vaccine')) {
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

  const hasAntiseptics = settlement ? isResearchUnlocked(settlement, 'first_aid') : false;
  const hasAntivirals = settlement ? isResearchUnlocked(settlement, 'symptomatic_treatment') : false;
  const hasVaccine = settlement ? isResearchUnlocked(settlement, 'vaccine') : false;

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

  // Deduct medical supplies. Dosing Optimisation (-40% first aid kits) and
  // Clinical Efficiency (-25% overall supply usage) make each treatment draw
  // fewer items — probabilistically, so a single treatment still consumes at
  // least the antibiotics dose but kits/bandages are conserved over time.
  const updatedMedical = { ...med };
  const supplyUseMult = isResearchUnlocked(state, 'clinical_efficiency') ? 0.75 : 1;
  updatedMedical.antibiotics -= 1;
  const kitChance = (isResearchUnlocked(state, 'dosing_optimisation') ? 0.6 : 1) * supplyUseMult;
  if (updatedMedical.first_aid_kits >= 1) {
    if (Math.random() < kitChance) updatedMedical.first_aid_kits -= 1;
  } else if (updatedMedical.sterile_bandages >= 1) {
    if (Math.random() < kitChance) updatedMedical.sterile_bandages -= 1;
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
  const hasAntiseptics = isResearchUnlocked(state, 'first_aid');
  const hasAntivirals = isResearchUnlocked(state, 'symptomatic_treatment');
  const hasVaccine = isResearchUnlocked(state, 'vaccine');

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

  // QUARANTINE IS A CONTROL, NOT AN INFECTION SOURCE (§6.2 regression fix):
  // the old implementation created a brand-new incubating infection record
  // ('Precautionary Isolation') whenever a HEALTHY survivor was confined —
  // quarantining the healthy literally infected them. Preventive isolation of
  // a healthy survivor is tracked independently (preventiveIsolationIds) and
  // never touches the infection map.
  if (!infection || infection.stage === 'uninfected' || infection.stage === 'cured') {
    if (quarantine) {
      const updatedPreventive = new Set(state.preventiveIsolationIds || []);
      if (updatedPreventive.has(survivorId)) {
        return { success: true, newState: state, message: `${survivor?.name ?? 'Survivor'} is already in preventive isolation.` };
      }
      const withRoleVacated = survivor ? vacateSurvivorRole(state, survivorId) : state;
      updatedPreventive.add(survivorId);
      return {
        success: true,
        newState: {
          ...withRoleVacated,
          preventiveIsolationIds: updatedPreventive,
        },
        message: `${survivor?.name ?? 'Survivor'} placed in PREVENTIVE isolation (no infection detected). Release if symptoms appear.`,
      };
    }
    // Releasing someone who was preventively isolated.
    const preventive = state.preventiveIsolationIds;
    if (preventive && preventive.has(survivorId)) {
      const updatedPreventive = new Set(preventive);
      updatedPreventive.delete(survivorId);
      return {
        success: true,
        newState: { ...state, preventiveIsolationIds: updatedPreventive },
        message: `${survivor?.name ?? 'Survivor'} released from preventive isolation.`,
      };
    }
    return { success: false, newState: state, message: 'Survivor is not infected and not in preventive isolation.' };
  }

  let updatedState = state;

  // If putting into quarantine, vacate any active roles/squads so they don't roam
  if (quarantine && survivor) {
    updatedState = vacateSurvivorRole(updatedState, survivorId);
  }

  const updatedInfections = new Map(updatedState.infections);
  const existingInfection = updatedInfections.get(survivorId)!;

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
  // COMBAT DEATH CANCELS INFECTION (§6.2 lifecycle correction): death and
  // turning are different events. A survivor killed in combat (or any cause
  // other than an actual turn) had their active infection TERMINATED by the
  // kill — the old code blindly stamped stage:'turned' onto whatever record
  // existed, so a bitten-then-killed leader later 'turned' posthumously in
  // the UI. Only the infection tick itself (cause 'infection_turned' or
  // 'euthanized_quarantine') may mark a record as turned.
  if (cause !== 'infection_turned' && cause !== 'euthanized_quarantine') {
    // NOTE: fall through — the shared cleanup below handles every cause; the
    // branch only exists so the turn-vs-cancel distinction in step 3 is
    // explicit at the top of the function.
  }
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

  // 3. Resolve any existing infection record by CAUSE of death:
  //    - a true turn (infection_turned / euthanized_quarantine) marks stage
  //      'turned' so memorial/medical history is accurate;
  //    - any other death TERMINATES the infection — a killed survivor can
  //      never turn afterwards (combat death wins over infection).
  const updatedInfections = new Map(cleanedState.infections);
  if (infection) {
    updatedInfections.set(survivorId, {
      ...infection,
      stage:
        cause === 'infection_turned' || cause === 'euthanized_quarantine'
          ? 'turned'
          : 'cured', // terminal resolved state: not active, not turned
      lastTreatedAt: Date.now(),
    });
  }
  // Preventive isolation ends with death too.
  let preventive = cleanedState.preventiveIsolationIds;
  if (preventive && preventive.has(survivorId)) {
    const updatedPreventive = new Set(preventive);
    updatedPreventive.delete(survivorId);
    preventive = updatedPreventive;
  }

  const newState: SettlementState = {
    ...cleanedState,
    namedSurvivors: updatedNamed,
    generalPopulation: updatedGeneral,
    infections: updatedInfections,
    preventiveIsolationIds: preventive,
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
  inGameDay: number,
  worldZombies?: ZombieUnit[]
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

  const hasCryoQuarantine = isResearchUnlocked(currentState, 'clinical_efficiency');

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
      const hq = getPrimaryHQ(currentState);
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

    // OUTBREAK LIFECYCLE — the outbreak's zombies are REAL world entities;
    // reconcile the outbreak state against them every tick. When tactical
    // squads (or tower fire) kill the last outbreak infected, the outbreak is
    // actually contained: the record resolves, the spread timer stops, and
    // the player is told their squads cleared the building. Without this the
    // outbreak used to spread forever on hidden timers regardless of the
    // zombies already lying dead in the street.
    if (worldZombies) {
      // The authoritative world list PLUS zombies this same tick spawned —
      // a fresh turn/infiltrator is alive immediately, not "missing".
      const worldNow = [...worldZombies, ...newZombies];
      const livingIds = outbreak.spawnedZombieIds.filter((zid) => {
        const z = worldNow.find((wz) => wz.id === zid);
        return z && z.currentHp > 0 && z.state !== 'dead';
      });
      if (livingIds.length === 0) {
        updatedOutbreaks.set(bldgId, {
          ...outbreak,
          zombieCount: 0,
          spawnedZombieIds: [],
          isOutbreakActive: false,
          isContained: true,
        });
        notifications.push({
          title: `OUTBREAK CONTAINED: ${outbreak.buildingName.toUpperCase()}`,
          desc: `Every outbreak infected in ${outbreak.buildingName} has been eliminated. The building is secure again.`,
          type: 'success',
        });
        continue;
      }
      if (livingIds.length !== outbreak.zombieCount) {
        updatedOutbreaks.set(bldgId, {
          ...outbreak,
          zombieCount: livingIds.length,
          spawnedZombieIds: livingIds,
        });
      }
    }    const currentOutbreak = updatedOutbreaks.get(bldgId) ?? outbreak;
    if (!currentOutbreak.isOutbreakActive || currentOutbreak.isContained) continue;
    const nextSpreadCountdown = currentOutbreak.spreadCountdownSec - effectiveDelta;

    if (nextSpreadCountdown <= 0) {
      // OUTBREAK SPREAD AS DISEASE, NOT MANUFACTURE (§6.3 rework): the old
      // timer spawned a fresh 'Outbreak Infiltrator' zombie in the nearest
      // clean building — an invisible chain-reaction factory. Now an
      // uncontained outbreak EXPOSES the colony's general population instead
      // (visible in the medical UI, containable by quarantine/treatment),
      // and a physical infected appears only when an exposed citizen actually
      // turns (the population stage spawns it).
      let pi = currentState.populationInfection ?? createEmptyPopulationInfectionState();
      // Exposure draws from the HEALTHY pool only — a settlement with no
      // general population cannot have workers exposed, and the pool can
      // never go negative (healthy = total − already sick).
      const generalTotal = currentState.generalPopulation?.total ?? 0;
      const healthyPool = Math.max(0, generalTotal - pi.exposed - pi.symptomatic);
      const wanted = Math.random() < 0.65 ? 1 : 2;
      const exposedInc = Math.min(wanted, healthyPool);
      if (exposedInc > 0) {
        pi = { ...pi, exposed: pi.exposed + exposedInc };
        currentState = { ...currentState, populationInfection: pi };
      }

      notifications.push({
        title: `☣️ OUTBREAK SPREADING: ${outbreak.buildingName.toUpperCase()}`,
        desc: exposedInc > 0
          ? `The uncontained outbreak is exposing colony workers (${exposedInc} new possible exposure${exposedInc === 1 ? '' : 's'}). Quarantine the sick and clear the infected before it spreads further!`
          : 'The uncontained outbreak keeps spreading inside the building — clear the infected before it reaches more of the colony!',
        type: 'warn',
      });

      // Reset spread timer for originating building (carrying forward the
      // reconciled living count so the UI stays truthful).
      updatedOutbreaks.set(bldgId, {
        ...currentOutbreak,
        spreadCountdownSec: currentOutbreak.maxSpreadCountdownSec,
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

  // 3. GENERAL POPULATION ILLNESS — the aggregated IFZ-style epidemic stage.
  const popResult = tickPopulationInfection(currentState, effectiveDelta, worldZombies);

  return {
    newState: popResult.newState,
    newZombies: [...newZombies, ...popResult.newZombies],
    notifications: [...notifications, ...popResult.notifications],
  };
}

// ==========================================
// 6b. General Population Infection (aggregated ESS model)
// ==========================================
// Anonymous citizens are deliberately NOT individual records. Illness is a
// compartment model over `generalPopulation.total`: healthy → exposed →
// symptomatic → resolved (treated / recovered / turned). The compartments are
// subtracted from the available labour pool by `calculateCitizenBreakdownStats`,
// so sick citizens genuinely stop being workers while ill.

// ---- Tuning (conservative, IFZ-flavoured) ----
// Exposures roll on a slow cadence and only when the colony is genuinely at
// risk (active outbreak in an occupied structure, or uncontained turned
// infected inside the settlement footprint).
const POP_SPREAD_CHECK_INTERVAL_SEC = 25;
// Per-check probability that ONE healthy citizen is exposed, scaled by hazard.
const POP_EXPOSURE_BASE_CHANCE = 0.06;
// Progression: an exposed citizen becomes symptomatic after roughly 40–80s of
// game time (probabilistic per tick so batches don't move in lockstep).
const POP_EXPOSED_TO_SYMPTOMATIC_RATE = 1 / 60; // per-second hazard
// Symptomatic citizens resolve: treatment capacity + time determines whether
// they recover or deteriorate toward turning.
const POP_RECOVERY_BASE_RATE = 1 / 90; // per-second hazard without treatment
const POP_RECOVERY_TREATED_MULT = 3.0; // treated patients recover 3× faster
const POP_TURN_RATE = 1 / 150; // per-second hazard of deteriorating to turn
const POP_TURN_TREATED_REDUCTION = 0.35; // treatment cuts turn hazard 65%
// Quarantined citizens spread far less and recover somewhat faster (rest).
const POP_QUARANTINE_SPREAD_MULT = 0.25;
const POP_QUARANTINE_RECOVERY_MULT = 1.25;

export interface PopulationInfectionTickResult {
  newState: SettlementState;
  newZombies: ZombieUnit[];
  notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[];
}

/** Treatment/isolation capacity: medbay beds + hospital beds (× vaccine-era
 *  clinical efficiency). Drives how many symptomatic can be treated at once. */
export function medicalCapacityFor(state: SettlementState): { beds: number; treated: number } {
  let beds = 0;
  let cureBonus = 0;
  for (const b of state.adaptedBuildings.values()) {
    if (b.constructionStatus !== 'completed' || !['medbay', 'hospital', 'infirmary_clinic'].includes(b.typeId)) continue;
    const props = (b as { medicalProperties?: { bedCapacity?: number; cureOddsBonusPct?: number } }).medicalProperties;
    beds += props?.bedCapacity ?? (b.typeId === 'hospital' ? 16 : 6);
    cureBonus += props?.cureOddsBonusPct ?? 0;
  }
  // Clinical efficiency research stretches capacity by 25%.
  if (isResearchUnlocked(state, 'clinical_efficiency')) beds = Math.round(beds * 1.25);
  // How many of the current symptomatic can be actively treated: min(symptomatic, beds).
  const pi = state.populationInfection;
  const symptomatic = pi?.symptomatic ?? 0;
  return { beds, treated: Math.min(symptomatic, beds) };
}

export function tickPopulationInfection(
  state: SettlementState,
  effectiveDelta: number,
  worldZombies?: ZombieUnit[]
): PopulationInfectionTickResult {
  const notifications: PopulationInfectionTickResult['notifications'] = [];
  const newZombies: ZombieUnit[] = [];
  const pi = state.populationInfection ?? createEmptyPopulationInfectionState();
  const generalPop = state.generalPopulation;
  const healthy = Math.max(
    0,
    (generalPop?.total ?? 0) - pi.exposed - pi.symptomatic
  );

  // ---- 1. New exposures ----
  // Sources the player can SEE and respond to: an active uncontained outbreak
  // inside the settlement, or living turned/infiltrator infected inside any
  // adapted building footprint (the outbreak model's physical reality).
  let hazard = 0;
  for (const outbreak of state.outbreaks.values()) {
    if (outbreak.isOutbreakActive && !outbreak.isContained) hazard += 1;
  }
  if (worldZombies) {
    // Infected physically inside settlement structures threaten the general
    // population (raiders that reached the base, uncontained turners).
    // Counted per-infected but saturating so a huge siege doesn't skyrocket it.
    const insideThreat = worldZombies.filter(
      (z) => z.currentHp > 0 && z.state !== 'dead' && state.adaptedBuildings.size > 0
    );
    // Approximate "inside the settlement" as within 60 m of any adapted building.
    let insideCount = 0;
    for (const z of insideThreat) {
      for (const b of state.adaptedBuildings.values()) {
        if (Math.hypot(z.x - b.position.x, z.z - b.position.z) < 60) {
          insideCount += 1;
          break;
        }
      }
      if (insideCount >= 6) break; // saturate
    }
    hazard += insideCount * 0.5;
  }

  const hasEarlyDiagnosis = isResearchUnlocked(state, 'early_diagnosis');
  const hasVaccine = isResearchUnlocked(state, 'vaccine');
  const hasDosing = isResearchUnlocked(state, 'dosing_optimisation');
  const hasTurnPrevention = isResearchUnlocked(state, 'turning_prevention');

  let exposed = pi.exposed;
  let symptomatic = pi.symptomatic;
  let quarantined = pi.quarantined;
  let totalLost = pi.totalLost;
  let totalRecovered = pi.totalRecovered;

  const spreadAccum = pi.spreadAccumSec + effectiveDelta;
  // ---- 1b. Internal (endogenous) transmission ----
  // Once illness exists in the colony it keeps spreading on its own: each
  // symptomatic citizen is a local infection source. Quarantined patients are
  // isolated and spread far less (POP_QUARANTINE_SPREAD_MULT); untreated sick
  // walking among the healthy are the main vector. Physical outbreaks remain
  // the EXTERNAL trigger (see hazard above) — this block is purely
  // person-to-person and needs no zombie nearby.
  const freeSick = Math.max(0, symptomatic - Math.min(quarantined, symptomatic));
  const internalHazard =
    (freeSick + (quarantined * POP_QUARANTINE_SPREAD_MULT)) * 0.5;
  const totalHazard = hazard + internalHazard;
  if (totalHazard > 0 && healthy > 0 && spreadAccum >= POP_SPREAD_CHECK_INTERVAL_SEC) {
    const checks = Math.floor(spreadAccum / POP_SPREAD_CHECK_INTERVAL_SEC);
    let newExposed = 0;
    for (let i = 0; i < checks; i++) {
      // Vaccine campaign massively cuts susceptibility; preventive isolation
      // of healthy survivors reduces their exposure too. The hazard scales
      // linearly with the sick population (uncapped — quarantining the sick
      // genuinely lowers it), bounded instead by the max exposures per check.
      let chance = Math.min(0.9, POP_EXPOSURE_BASE_CHANCE * totalHazard);
      if (hasVaccine) chance *= 0.35;
      // Early diagnosis triggers contact tracing around detected cases.
      if (hasEarlyDiagnosis) chance *= 0.75;
      const isolated = state.preventiveIsolationIds?.size ?? 0;
      if (isolated > 0) chance *= Math.max(0.4, 1 - isolated * 0.05);
      if (Math.random() < chance && healthy - newExposed > 0 && newExposed < 3) newExposed += 1;
    }
    if (newExposed > 0) {
      exposed += newExposed;
      notifications.push({
        title: '⚠️ EXPOSURE IN THE COLONY',
        desc: internalHazard > hazard
          ? `${newExposed} settler${newExposed === 1 ? '' : 's'} may have caught the illness from sick colonists${hasEarlyDiagnosis ? ' — Early Diagnosis screening flagged the contact chain' : ''}. Isolate the ill to stop the chain.`
          : `${newExposed} settler${newExposed === 1 ? '' : 's'} may have been exposed to the necrotic virus${hasEarlyDiagnosis ? ' — Early Diagnosis screening flagged the contact chain' : ''}. Watch for symptoms.`,
        type: 'warn',
      });
    }
  }

  // ---- 2. Progression & resolution (per-second hazards, integrated in bulk) ----
  const dt = effectiveDelta;
  const { beds } = medicalCapacityFor(state);

  // ---- 2a. Automatic quarantine admission ----
  // Symptomatic citizens are admitted into isolation automatically, bounded by
  // operational Medbay/Hospital bed capacity (no micromanagement: the colony's
  // medical staff triage on their own). `quarantined` IS the treated cohort —
  // beds, care and containment all key off it. No beds → no admission → the
  // sick stay untreated at home (the pressure to build medical capacity).
  const quarantineCapacity = Math.max(0, beds - quarantined);
  const admitted = Math.min(symptomatic - quarantined, quarantineCapacity);
  if (admitted > 0) {
    quarantined += admitted;
    notifications.push({
      title: '🏥 ISOLATION ADMISSIONS',
      desc: `${admitted} ill settler${admitted === 1 ? '' : 's'} admitted to medical isolation${hasEarlyDiagnosis ? ' after early-diagnosis screening' : ''}. Care and containment begin immediately.`,
      type: 'info',
    });
  }
  const treatedCount = Math.min(quarantined, symptomatic);
  const untreatedCount = symptomatic - treatedCount;

  // exposed → symptomatic (early diagnosis catches cases earlier: moves part
  // of the exposed cohort into a detectable, treatable state sooner)
  const exposeRate = POP_EXPOSED_TO_SYMPTOMATIC_RATE * (hasEarlyDiagnosis ? 1.3 : 1);
  const newlySymptomatic = Math.min(
    exposed,
    binomialApprox(exposed, exposeRate * dt)
  );
  exposed -= newlySymptomatic;
  symptomatic += newlySymptomatic;
  if (newlySymptomatic > 0) {
    notifications.push({
      title: '⚠️ MEDICAL ALERT: COLONY ILLNESS',
      desc: `${newlySymptomatic} settler${newlySymptomatic === 1 ? ' has' : 's have'} fallen visibly ill${untreatedCount > 0 && (state.adaptedBuildings.size > 0) ? ' — Medbay triage and quarantine recommended' : ''}.`,
      type: 'warn',
    });
  }

  // symptomatic → recovered / turned, resolved SEQUENTIALLY per cohort:
  // turning is rolled first, recoveries are rolled against the REMAINING
  // cohort — so recovered + turned can never exceed the symptomatic pool.
  const hasSymptomaticTreatment = isResearchUnlocked(state, 'symptomatic_treatment');

  const turnRateUntreated = POP_TURN_RATE * (hasTurnPrevention ? POP_TURN_TREATED_REDUCTION : 1) * dt;
  const turnRateTreated = turnRateUntreated * POP_TURN_TREATED_REDUCTION;
  const turnedFromTreated = binomialApprox(treatedCount, turnRateTreated);
  const turnedFromUntreated = binomialApprox(untreatedCount, turnRateUntreated);

  const recTreated =
    POP_RECOVERY_BASE_RATE * POP_RECOVERY_TREATED_MULT * POP_QUARANTINE_RECOVERY_MULT * dt * (hasSymptomaticTreatment ? 1.2 : 1);
  const recUntreated = POP_RECOVERY_BASE_RATE * dt;
  const recoveredFromTreated = binomialApprox(treatedCount - turnedFromTreated, recTreated);
  const recoveredFromUntreated = binomialApprox(untreatedCount - turnedFromUntreated, recUntreated);

  const recovered = recoveredFromTreated + recoveredFromUntreated;
  const turned = turnedFromTreated + turnedFromUntreated;

  // Quarantined patients who RECOVERED free their beds. Those who TURNED keep
  // theirs until the containment step below — `quarantined` is what makes the
  // turn contained (the patient was already in isolation when they turned).
  quarantined = Math.max(0, quarantined - recoveredFromTreated);
  symptomatic -= recovered + turned;
  if (symptomatic < 0) symptomatic = 0;
  totalRecovered += recovered;
  if (recovered > 0) {
    notifications.push({
      title: 'PATIENTS RECOVERED',
      desc: `${recovered} ill settler${recovered === 1 ? '' : 's'} recovered from the illness${treatedCount > 0 ? ' — medbay care made the difference' : ''}.`,
      type: 'success',
    });
  }

  // ---- 3. Turning: population loss + physical infected when uncontained ----
  if (turned > 0) {
    // Quarantine capacity contains turns safely: quarantined patients turn
    // inside isolation and are neutralized without outbreak.
    const containedTurns = Math.min(quarantined, turned);
    const freeTurns = turned - containedTurns;
    quarantined = Math.max(0, quarantined - containedTurns);
    totalLost += turned;

    if (freeTurns > 0) {
      // Uncontained turn → physical turned infected + local outbreak pressure.
      const hq = getPrimaryHQ(state);
      const spawnPos = hq ? hq.center : { x: 0, z: 0 };
      const spawnBldg = hq ? hq.buildingId : 'hq';
      const spawnName = hq ? hq.buildingName : 'Settlement Grounds';
      for (let i = 0; i < freeTurns; i++) {
        const turnedZombie = createZombieUnit('runner', spawnPos.x + (Math.random() - 0.5) * 6, spawnPos.z + (Math.random() - 0.5) * 6, 0, true);
        turnedZombie.name = 'Turned Settler';
        newZombies.push(turnedZombie);
      }
      // Outbreak record so the player has something visible to respond to.
      const existing = state.outbreaks.get(spawnBldg);
      const outbreaks = new Map(state.outbreaks);
      outbreaks.set(spawnBldg, {
        buildingId: spawnBldg,
        buildingName: spawnName,
        isOutbreakActive: true,
        zombieCount: (existing?.zombieCount ?? 0) + freeTurns,
        spawnedZombieIds: [
          ...(existing?.spawnedZombieIds ?? []),
          ...newZombies.map((z) => z.id),
        ],
        spreadCountdownSec: existing?.spreadCountdownSec ?? 35,
        maxSpreadCountdownSec: existing?.maxSpreadCountdownSec ?? 35,
        isContained: false,
        turnedSurvivorName: 'Colonial Settlers',
        originTime: Date.now(),
      });
      state = { ...state, outbreaks };
      notifications.push({
        title: `🚨 OUTBREAK IN ${spawnName.toUpperCase()}!`,
        desc: `${freeTurns} ill settler${freeTurns === 1 ? '' : 's'} TURNED without containment! Infected are loose inside the colony — contain them!`,
        type: 'warn',
      });
    } else {
      notifications.push({
        title: '🛡️ ISOLATION WARD CONTAINMENT',
        desc: `${containedTurns} quarantined patient${containedTurns === 1 ? '' : 's'} turned inside isolation. Security neutralized the threat — no colony exposure.`,
        type: 'info',
      });
    }
  }

  // ---- 4. Population accounting: lost citizens leave the headcount ----
  let updatedGeneral = state.generalPopulation;
  if (turned > 0 && updatedGeneral) {
    updatedGeneral = { ...updatedGeneral, total: Math.max(0, updatedGeneral.total - turned) };
    // Quarantined patients who turned freed their beds.
  }

  const newState: SettlementState = {
    ...state,
    generalPopulation: updatedGeneral,
    populationInfection: {
      exposed,
      symptomatic,
      quarantined,
      totalLost,
      totalRecovered,
      accumSec: pi.accumSec + effectiveDelta,
      spreadAccumSec: spreadAccum % POP_SPREAD_CHECK_INTERVAL_SEC,
    },
  };

  return { newState, newZombies, notifications };
}

/** Expected value helper: probabilistic count of successes for n trials at
 *  per-second hazard h over dt (used so aggregated compartments move smoothly
 *  instead of every citizen flipping on the same tick). */
function binomialApprox(n: number, p: number): number {
  if (n <= 0) return 0;
  const prob = Math.min(0.95, Math.max(0, p));
  const expected = n * prob;
  const whole = Math.floor(expected);
  const frac = expected - whole;
  return whole + (Math.random() < frac ? 1 : 0);
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
