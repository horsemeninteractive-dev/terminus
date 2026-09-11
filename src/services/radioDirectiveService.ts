import {
  DirectiveConditionType,
  OperationalDirective,
  RadioDirectiveState,
  RadioTransmission,
  TransmissionClassification,
} from '../types/radioDirective';
import { SettlementState } from '../types/settlement';
import { GameClockState, ZombieUnit } from '../types/combat';
import { getPrimaryHQ } from './buildingOperational';

// ---------------------------------------------------------------------------
// Transmission archive query helpers (pure — unit-tested)
// ---------------------------------------------------------------------------

export type TransmissionReadFilter = 'ALL' | 'UNREAD' | 'READ';

export type TransmissionCategory = 'mission' | 'directive' | 'informational';

export interface TransmissionLogFilters {
  classification?: TransmissionClassification | 'ALL';
  read?: TransmissionReadFilter;
  /** mission-related / directive-related / informational (no relation). */
  category?: TransmissionCategory | 'ALL';
  /** true = only transmissions whose mission was declined. */
  declinedOnly?: boolean;
}

/** A transmission's relationship to missions/directives (archive categorisation). */
export function getTransmissionCategory(tx: RadioTransmission): TransmissionCategory {
  if (tx.missionId) return 'mission';
  if (tx.directiveId) return 'directive';
  return 'informational';
}

/** True when the transmission briefs a mission the player explicitly declined. */
export function isTransmissionDeclined(
  tx: RadioTransmission,
  declinedMissionIds: string[] = []
): boolean {
  return Boolean(tx.missionId && declinedMissionIds.includes(tx.missionId));
}

/**
 * Applies archive filters. `declinedMissionIds` comes from mission state — a
 * transmission counts as declined when its mission was refused.
 */
export function filterTransmissionLog(
  log: RadioTransmission[],
  filters: TransmissionLogFilters,
  declinedMissionIds: string[] = []
): RadioTransmission[] {
  return log.filter((tx) => {
    if (filters.classification && filters.classification !== 'ALL' && tx.classification !== filters.classification) {
      return false;
    }
    if (filters.read === 'UNREAD' && tx.isRead) return false;
    if (filters.read === 'READ' && !tx.isRead) return false;
    if (filters.category && filters.category !== 'ALL' && getTransmissionCategory(tx) !== filters.category) {
      return false;
    }
    if (filters.declinedOnly && !isTransmissionDeclined(tx, declinedMissionIds)) return false;
    return true;
  });
}

export const CLASSIFICATION_COLORS: Record<
  TransmissionClassification,
  { bg: string; border: string; text: string; badge: string; glow: string }
> = {
  SITREP: {
    bg: 'bg-[#0b1712]',
    border: 'border-[#10b981]',
    text: 'text-[#10b981]',
    badge: 'bg-[#064e3b] text-[#10b981] border-[#10b981]/50',
    glow: 'rgba(16, 185, 129, 0.25)',
  },
  WARNING: {
    bg: 'bg-[#1a140b]',
    border: 'border-[#f59e0b]',
    text: 'text-[#fbbf24]',
    badge: 'bg-[#78350f] text-[#fde68a] border-[#f59e0b]/50',
    glow: 'rgba(245, 158, 11, 0.25)',
  },
  DIRECTIVE: {
    bg: 'bg-[#0c141f]',
    border: 'border-[#38bdf8]',
    text: 'text-[#38bdf8]',
    badge: 'bg-[#075985] text-[#bae6fd] border-[#38bdf8]/50',
    glow: 'rgba(56, 189, 248, 0.25)',
  },
  EMERGENCY: {
    bg: 'bg-[#1c0d0f]',
    border: 'border-[#ef4444]',
    text: 'text-[#f87171]',
    badge: 'bg-[#7f1d1d] text-[#fca5a5] border-[#ef4444]/50',
    glow: 'rgba(239, 68, 68, 0.35)',
  },
  INTEL: {
    bg: 'bg-[#150f1f]',
    border: 'border-[#a855f7]',
    text: 'text-[#c084fc]',
    badge: 'bg-[#581c87] text-[#e9d5ff] border-[#a855f7]/50',
    glow: 'rgba(168, 85, 247, 0.25)',
  },
  UPDATE: {
    bg: 'bg-[#0d151c]',
    border: 'border-[#64748b]',
    text: 'text-[#94a3b8]',
    badge: 'bg-[#1e293b] text-[#cbd5e1] border-[#64748b]/50',
    glow: 'rgba(100, 116, 139, 0.2)',
  },
  MILESTONE: {
    bg: 'bg-[#131b14]',
    border: 'border-[#34d399]',
    text: 'text-[#34d399]',
    badge: 'bg-[#065f46] text-[#a7f3d0] border-[#34d399]/50',
    glow: 'rgba(52, 211, 153, 0.3)',
  },
};

/**
 * Initial State for the Safe Zones Radio Directive System
 */
export function getInitialRadioDirectiveState(): RadioDirectiveState {
  const initialTransmission: RadioTransmission = {
    id: 'tx_init_01',
    classification: 'SITREP',
    callsign: 'SGT. VANCE // ADVANCE RECON LEAD',
    frequency: '104.20 MHz',
    timestamp: 'DAY 01 — 08:00:00',
    title: 'GROUND SITREP — HQ SECTOR DESIGNATION',
    message:
      'Chief Operator, reading you loud and clear through the relay. We\'ve reached the sector perimeter with our initial survivors, but the streets are infested and we\'re exposed in the open. We need you to designate a defensible building footprint on your satellite grid as Safe Zone Command HQ before hostiles converge on our position.',
    directiveId: 'dir_hq',
    isRead: false,
    audioCue: 'morse',
    requiresAcknowledgement: true,
    responseOptions: [
      {
        label: 'COPY THAT, VANCE. SCANNING SATELLITE GRID FOR COMMAND HQ.',
        action: 'focus_candidate_hq',
        responseNote: 'Acknowledged. Scanning sector structures for Command HQ placement.',
      },
    ],
  };

  const initialDirective: OperationalDirective = {
    id: 'dir_hq',
    code: 'DIR-01',
    title: 'Establish Safe Zone Command HQ',
    description: 'Select and establish a primary operational headquarters from surviving urban structures.',
    classification: 'DIRECTIVE',
    status: 'active',
    conditionType: 'establish_hq',
    rewardSummary: 'Safe Zone Network Anchor + Resource Depots Unlocked',
    actionType: 'focus_candidate_hq',
    completionTransmissionId: 'tx_hq_complete',
    isPrimary: true,
  };

  return {
    // DIR-01 starts PENDING: it only becomes active — appearing in the quest
    // tracker and unlocking the HQ selection card — once the player pushes to
    // talk and acknowledges the initial transmission (acknowledgeTransmission
    // moves it from pendingDirectives to activeDirectives).
    activeDirectives: [],
    pendingDirectives: [initialDirective],
    completedDirectiveIds: [],
    transmissionLog: [initialTransmission],
    unreadCount: 1,
    currentIncomingTransmission: initialTransmission,
    incomingQueue: ['tx_init_01'],
  };
}

/**
 * Evaluates game world conditions, updates directive statuses, and issues organic follow-up transmissions
 * in strict linear order:
 * 1. Establish Command HQ (dir_hq)
 * 2. Muster Tactical Fireteam (dir_squad)
 * 3. Scavenge First Urban Structure (dir_scavenge)
 * 4. Locate & Contact Survivor Group (dir_survivors)
 */
export function updateRadioDirectiveSystem(
  currentState: RadioDirectiveState,
  settlement: SettlementState,
  gameClock: GameClockState,
  _zombies: ZombieUnit[],
  hasCompletedScavengeInput?: boolean
): {
  newState: RadioDirectiveState;
  newTransmissionsCount: number;
} {
  const updatedDirectives: OperationalDirective[] = [];
  const newlyCompletedDirectiveIds: string[] = [];
  const generatedTransmissions: RadioTransmission[] = [];
  const pendingDirectives: OperationalDirective[] = [...(currentState.pendingDirectives || [])];

  const completedSet = new Set(currentState.completedDirectiveIds || []);
  const activeAndPendingIds = new Set([
    ...currentState.activeDirectives.map((d) => d.id),
    ...pendingDirectives.map((d) => d.id),
    ...Array.from(completedSet),
  ]);
  const nowStr = `DAY ${String(gameClock.day).padStart(2, '0')} — ${String(gameClock.hour).padStart(2, '0')}:${String(gameClock.minute).padStart(2, '0')}:00`;

  // Check hidden survivor groups in map geometry (must be discovered or recruited in-world)
  const hiddenList =
    settlement?.hiddenGroups instanceof Map
      ? Array.from(settlement.hiddenGroups.values())
      : settlement?.hiddenGroups && typeof settlement.hiddenGroups === 'object'
      ? Object.values(settlement.hiddenGroups)
      : [];
  const hasDiscoveredOrRecruitedSurvivorGroup = hiddenList.some(
    (g: any) => g && (g.isDiscovered || g.isRecruited)
  );

  const hasSquad = (settlement.squads?.length || 0) > 0;

  const hasCompletedScavenge =
    hasCompletedScavengeInput ||
    (settlement?.buildingSearches instanceof Map
      ? Array.from(settlement.buildingSearches.values()).some((b: any) => b && b.searched)
      : false) ||
    Boolean(settlement?.searchedBuildings && settlement.searchedBuildings.size > 0) ||
    Boolean(settlement?.squads?.some((s) => (settlement.squadInventories?.[s.id]?.items?.length || 0) > 0));

  // 1. Process and evaluate existing active directives
  for (const directive of currentState.activeDirectives) {
    let isComplete = false;
    let progress = 0;

    switch (directive.conditionType) {
      case 'establish_hq':
        isComplete = Boolean(getPrimaryHQ(settlement));
        progress = isComplete ? 1 : 0;
        break;

      case 'form_squad':
        // Only valid if HQ is completed
        isComplete = completedSet.has('dir_hq') && hasSquad;
        progress = isComplete ? 1 : 0;
        break;

      case 'scavenge_supplies':
        // Only valid if squad is completed
        isComplete = completedSet.has('dir_squad') && hasCompletedScavenge;
        progress = isComplete ? 1 : 0;
        break;

      case 'recruit_survivors':
        // Only valid if scavenge is completed & a hidden map group is discovered/recruited
        isComplete = completedSet.has('dir_scavenge') && hasDiscoveredOrRecruitedSurvivorGroup;
        progress = isComplete ? 1 : 0;
        break;

      default:
        isComplete = false;
        progress = 0;
        break;
    }

    if (isComplete) {
      updatedDirectives.push({
        ...directive,
        status: 'completed',
        currentCount: directive.targetCount || 1,
      });
      if (directive.status === 'active') {
        newlyCompletedDirectiveIds.push(directive.id);
      }
      completedSet.add(directive.id);
    } else {
      updatedDirectives.push({
        ...directive,
        currentCount: Math.round(progress * (directive.targetCount || 1)),
      });
    }
  }

  // Sequential Step-by-Step Progression:

  // --- Step 1 -> Complete HQ & Trigger Step 2 (Muster Squad) ---
  if (Boolean(getPrimaryHQ(settlement))) {
    if (!completedSet.has('dir_hq')) {
      completedSet.add('dir_hq');
      newlyCompletedDirectiveIds.push('dir_hq');
      // Update in active directives list if present
      const hqAct = updatedDirectives.find((d) => d.id === 'dir_hq');
      if (hqAct) {
        hqAct.status = 'completed';
        hqAct.currentCount = 1;
      }
    }

    if (!activeAndPendingIds.has('dir_squad')) {
      const squadTx: RadioTransmission = {
        id: 'tx_hq_complete',
        classification: 'WARNING',
        callsign: 'SGT. VANCE // COMMAND HQ',
        frequency: '104.20 MHz',
        timestamp: nowStr,
        title: 'HQ SECURED — REQUESTING FIRETEAM MUSTER',
        message:
          'Chief Operator, HQ doors are barricaded and our survivors are under cover. But we\'re sitting ducks in here without armed combat patrols. Requesting authorization to issue sidearms and form Fireteam Alpha from our able fighters immediately.',
        directiveId: 'dir_squad',
        isRead: false,
        audioCue: 'alarm',
        requiresAcknowledgement: true,
        responseOptions: [
          {
            label: 'AUTHORIZATION GRANTED, VANCE. MUSTER FIRETEAM ALPHA.',
            action: 'open_squad_panel',
            responseNote: 'Arming personnel and forming tactical combat unit.',
          },
        ],
      };
      generatedTransmissions.push(squadTx);

      const squadDirective: OperationalDirective = {
        id: 'dir_squad',
        code: 'DIR-02',
        title: 'Muster Tactical Fireteam',
        description: 'Form an armed squad from survivors sheltered at HQ to conduct patrols and sorties.',
        classification: 'WARNING',
        status: 'active',
        conditionType: 'form_squad',
        rewardSummary: 'Tactical Squad Response + Combat Patrols',
        actionType: 'open_squad_panel',
        completionTransmissionId: 'tx_squad_complete',
        isPrimary: true,
      };

      // New directives arrive PENDING: they only surface in the quest tracker
      // once the player reads & confirms the accompanying transmission
      // (acknowledgeTransmission moves pendingDirectives -> activeDirectives).
      pendingDirectives.push(squadDirective);
      activeAndPendingIds.add('dir_squad');
    }
  }

  // --- Step 2 -> Complete Squad & Trigger Step 3 (Scavenge First Building) ---
  if (completedSet.has('dir_hq') && hasSquad) {
    if (!completedSet.has('dir_squad')) {
      completedSet.add('dir_squad');
      newlyCompletedDirectiveIds.push('dir_squad');
      const sqAct = updatedDirectives.find((d) => d.id === 'dir_squad');
      if (sqAct) {
        sqAct.status = 'completed';
        sqAct.currentCount = 1;
      }
    }

    if (!activeAndPendingIds.has('dir_scavenge')) {
      const scavengeTx: RadioTransmission = {
        id: 'tx_squad_complete',
        classification: 'DIRECTIVE',
        callsign: 'SGT. VANCE // LOGISTICS & DEPOT',
        frequency: '104.20 MHz',
        timestamp: nowStr,
        title: 'FIRETEAM ACTIVE — COMMENCE SCAVENGE SORTIE',
        message:
          'Chief, Fireteam Alpha is formed, armed, and boots on the ground. But our food stores and ammo bins are running dangerously low. Fireteam Alpha is ready to breach and scavenge an unlooted structure. Designate a building footprint for search on your tactical map.',
        directiveId: 'dir_scavenge',
        isRead: false,
        audioCue: 'chirp',
        requiresAcknowledgement: true,
        responseOptions: [
          {
            label: 'DEPLOY SQUAD TO BREACH AND SCAVENGE STRUCTURE.',
            action: 'trigger_scavenge',
            responseNote: 'Squad dispatched to enter structure footprint and recover provisions.',
          },
        ],
      };
      generatedTransmissions.push(scavengeTx);

      const scavengeDirective: OperationalDirective = {
        id: 'dir_scavenge',
        code: 'DIR-03',
        title: 'Scavenge First Urban Structure',
        description: 'Order your combat squad to enter and search an unlooted building footprint to recover food, ammo, and materials.',
        classification: 'DIRECTIVE',
        status: 'active',
        conditionType: 'scavenge_supplies',
        rewardSummary: '+Food Stockpile +Ammunition +Crafting Materials',
        actionType: 'trigger_scavenge',
        completionTransmissionId: 'tx_scavenge_complete',
        isPrimary: true,
      };

      pendingDirectives.push(scavengeDirective);
      activeAndPendingIds.add('dir_scavenge');
    }
  }

  // --- Step 3 -> Complete Scavenge & Trigger Step 4 (Find First Survivor Group) ---
  if (completedSet.has('dir_squad') && hasCompletedScavenge) {
    if (!completedSet.has('dir_scavenge')) {
      completedSet.add('dir_scavenge');
      newlyCompletedDirectiveIds.push('dir_scavenge');
      const scAct = updatedDirectives.find((d) => d.id === 'dir_scavenge');
      if (scAct) {
        scAct.status = 'completed';
        scAct.currentCount = 1;
      }
    }

    if (!activeAndPendingIds.has('dir_survivors')) {
      const survivorTx: RadioTransmission = {
        id: 'tx_scavenge_complete',
        classification: 'INTEL',
        callsign: 'FIRETEAM ALPHA // SCOUT MILLER',
        frequency: '104.20 MHz',
        timestamp: nowStr,
        title: 'SCAVENGE COMPLETE — CIVILIAN DISTRESS DETECTED',
        message:
          'Chief Operator, supply cache secured and stowed. While moving through the sector, we picked up faint civilian distress signals and smoke plumes coming from a nearby building footprint. Dispatch us to scout the sector and establish contact with trapped survivors.',
        directiveId: 'dir_survivors',
        isRead: false,
        audioCue: 'chirp',
        requiresAcknowledgement: true,
        responseOptions: [
          {
            label: 'DISPATCH FIRETEAM TO RECON AND RESCUE SURVIVORS.',
            action: 'trigger_recruitment',
            responseNote: 'Squad dispatched to investigate civilian distress signal.',
          },
        ],
      };
      generatedTransmissions.push(survivorTx);

      const survivorDirective: OperationalDirective = {
        id: 'dir_survivors',
        code: 'DIR-04',
        title: 'Locate & Contact Survivor Group',
        description: 'Send Fireteam Alpha to scout civilian distress signals and discover or recruit trapped survivors in the sector.',
        classification: 'INTEL',
        status: 'active',
        conditionType: 'recruit_survivors',
        rewardSummary: '+Workforce Labor +Specialist Skills',
        actionType: 'trigger_recruitment',
        completionTransmissionId: 'tx_survivors_complete',
        isPrimary: true,
      };

      pendingDirectives.push(survivorDirective);
      activeAndPendingIds.add('dir_survivors');
    }
  }

  // --- Step 4 -> Complete Survivor Discovery (end of the tutorial chain) ---
  if (completedSet.has('dir_scavenge') && hasDiscoveredOrRecruitedSurvivorGroup) {
    if (!completedSet.has('dir_survivors')) {
      completedSet.add('dir_survivors');
      newlyCompletedDirectiveIds.push('dir_survivors');
      const survAct = updatedDirectives.find((d) => d.id === 'dir_survivors');
      if (survAct) {
        survAct.status = 'completed';
        survAct.currentCount = 1;
      }
    }
  }

  // Combine transmissions (newest first, no duplicates)
  const newLog = [...currentState.transmissionLog];
  for (const tx of generatedTransmissions) {
    if (!newLog.some((existing) => existing.id === tx.id)) {
      newLog.unshift(tx);
    }
  }

  // Maintain the ordered unread queue: preserve existing unread entries,
  // append newly generated unread transmissions, drop anything now read.
  const existingQueue = (currentState.incomingQueue || []).filter((id) => {
    const rec = newLog.find((t) => t.id === id);
    return rec && !rec.isRead;
  });
  const freshUnread = generatedTransmissions
    .filter((tx) => !tx.isRead)
    .map((tx) => tx.id)
    .filter((id) => !existingQueue.includes(id));
  const incomingQueue = [...existingQueue, ...freshUnread];
  const firstQueued = incomingQueue.length > 0 ? newLog.find((t) => t.id === incomingQueue[0]) : null;
  const latestIncoming =
    firstQueued ||
    (generatedTransmissions.length > 0 ? generatedTransmissions[0] : null) ||
    (currentState.currentIncomingTransmission && !currentState.currentIncomingTransmission.isRead
      ? currentState.currentIncomingTransmission
      : null);

  const newUnreadCount = newLog.filter((tx) => !tx.isRead).length;

  return {
    newState: {
      activeDirectives: updatedDirectives,
      pendingDirectives,
      completedDirectiveIds: Array.from(completedSet),
      transmissionLog: newLog,
      unreadCount: newUnreadCount,
      currentIncomingTransmission: latestIncoming,
      incomingQueue,
    },
    newTransmissionsCount: generatedTransmissions.length,
  };
}

/**
 * Marks a transmission as read / acknowledged and moves any associated directive into activeDirectives
 */
export function acknowledgeTransmission(
  state: RadioDirectiveState,
  transmissionId: string
): RadioDirectiveState {
  const targetTx = state.transmissionLog.find((tx) => tx.id === transmissionId);
  const newLog = state.transmissionLog.map((tx) =>
    tx.id === transmissionId ? { ...tx, isRead: true } : tx
  );
  const unreadCount = newLog.filter((tx) => !tx.id || !tx.isRead).length;
  const incomingQueue = (state.incomingQueue || []).filter((id) => id !== transmissionId);
  // The incoming pointer always advances to the next unread queued entry
  // (never left on an already-read transmission).
  const nextQueued =
    incomingQueue.length > 0
      ? newLog.find((t) => t.id === incomingQueue[0]) || null
      : newLog.find((t) => !t.isRead) || null;
  const currentIncoming = nextQueued;

  // Move associated pending directive to activeDirectives (so quest tracker only now populates!)
  let updatedActive = [...state.activeDirectives];
  let updatedPending = [...(state.pendingDirectives || [])];

  if (targetTx?.directiveId) {
    const pendingIdx = updatedPending.findIndex((d) => d.id === targetTx.directiveId);
    if (pendingIdx !== -1) {
      const [activatedDirective] = updatedPending.splice(pendingIdx, 1);
      if (!updatedActive.some((d) => d.id === activatedDirective.id)) {
        updatedActive.push({
          ...activatedDirective,
          status: 'active',
        });
      }
    }
  }

  return {
    ...state,
    activeDirectives: updatedActive,
    pendingDirectives: updatedPending,
    transmissionLog: newLog,
    unreadCount,
    currentIncomingTransmission: currentIncoming,
    incomingQueue,
  };
}

export const createInitialRadioDirectiveState = getInitialRadioDirectiveState;

