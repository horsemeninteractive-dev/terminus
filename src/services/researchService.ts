import { RESEARCH_TREE_NODES } from '../data/researchTreeData';
import { ResearchNode, ResearchTreeState } from '../types/research';
import { SettlementState } from '../types/settlement';

/**
 * Creates the initial research tree state.
 */
export function createInitialResearchState(): ResearchTreeState {
  return {
    researchPoints: 5, // Enough to fund the first tier-1 project immediately
    passiveRatePerSec: 0.02,
    unlockedNodes: [],
    activeResearchId: null,
    activeProgressSec: 0,
  };
}

export function isResearchUnlocked(settlement: SettlementState, nodeId: string): boolean {
  if (!settlement?.research?.unlockedNodes) return false;
  return settlement.research.unlockedNodes.includes(nodeId);
}

/** The single authoritative list of nodes. */
export function getAllResearchNodes(): ResearchNode[] {
  return Object.values(RESEARCH_TREE_NODES);
}

/**
 * Counts how many research workers are assigned to completed Research Stations.
 * Research speed scales directly with this count.
 */
export function getResearchWorkerCount(settlement: SettlementState): number {
  let workers = 0;
  const sourceNodes = [
    ...((settlement.adaptedBuildings instanceof Map
      ? Array.from(settlement.adaptedBuildings.values())
      : Object.values(settlement.adaptedBuildings || {})) as any[]),
    ...(settlement.freestandingBuildings || []),
  ];
  for (const bldg of sourceNodes) {
    if (!bldg || bldg.constructionStatus !== 'completed') continue;
    if (bldg.typeId === 'research_lab') workers += bldg.assignedWorkers || 0;
  }
  return workers;
}

/**
 * Effective research work rate. The colony always keeps a minimal "HQ research
 * bench" effort (1 equivalent worker) so research is never soft-locked; assigning
 * workers to Research Stations accelerates every project. Returns worker count
 * actually used and the RP generation rate (green book currency) from stations.
 */
export function calculateResearchGenerationRate(settlement: SettlementState): {
  totalRatePerSec: number;
  baseRate: number;
  survivorBonus: number;
  buildingBonus: number;
  researchWorkers: number;
  details: string[];
} {
  const baseRate = 0.02; // baseline colony intellectual effort
  let survivorBonus = 0;
  const researchWorkers = getResearchWorkerCount(settlement);
  const buildingBonus = researchWorkers * 0.08;
  const details: string[] = [
    'Household knowledge: +0.02 RP/s',
    ...(researchWorkers > 0
      ? [`Research Station workers (${researchWorkers}): +${(researchWorkers * 0.08).toFixed(2)} RP/s`]
      : []),
  ];

  return {
    totalRatePerSec: Math.round((baseRate + survivorBonus + buildingBonus) * 100) / 100,
    baseRate,
    survivorBonus: Math.round(survivorBonus * 100) / 100,
    buildingBonus: Math.round(buildingBonus * 100) / 100,
    researchWorkers,
    details,
  };
}

function missingPrereqs(settlement: SettlementState, node: ResearchNode): string[] {
  const unlocked = settlement.research?.unlockedNodes || [];
  return (node.prerequisites || []).filter((p) => !unlocked.includes(p));
}

/**
 * Whether a project can be started right now (prerequisites met, research points
 * available, and not already unlocked or active). Used to drive node state + the
 * Start Research button.
 */
export function canUnlockResearchNode(
  settlement: SettlementState,
  nodeId: string
): { allowed: boolean; reason?: string } {
  const node = RESEARCH_TREE_NODES[nodeId];
  if (!node) return { allowed: false, reason: 'Unknown research node.' };

  if (settlement.research?.unlockedNodes?.includes(nodeId)) {
    return { allowed: false, reason: 'Already researched.' };
  }

  const missing = missingPrereqs(settlement, node);
  if (missing.length > 0) {
    const names = missing.map((p) => RESEARCH_TREE_NODES[p]?.name || p).join(', ');
    return { allowed: false, reason: `Requires prerequisite: ${names}` };
  }

  const currentRP = settlement.research?.researchPoints || 0;
  if (currentRP < node.costRP) {
    return { allowed: false, reason: `Insufficient Research Points. Needs ${node.costRP} (have ${Math.floor(currentRP)}).` };
  }

  return { allowed: true };
}

/** Estimated real-time seconds to complete a project at the current worker count. */
export function getEstimatedResearchSeconds(settlement: SettlementState, node: ResearchNode, progressSec = 0): number {
  const { researchWorkers } = calculateResearchGenerationRate(settlement);
  const effectiveWorkers = Math.max(1, researchWorkers);
  return Math.max(0, (node.baseTimeSec - progressSec)) / effectiveWorkers;
}

/**
 * Starts (or resumes) a time-based research project. Research Points are charged
 * on completion, not up front. Only one project can run at a time.
 */
export function startResearchNode(
  settlement: SettlementState,
  nodeId: string
): { updatedSettlement: SettlementState; node: ResearchNode } {
  const node = RESEARCH_TREE_NODES[nodeId];
  if (!node) throw new Error(`Invalid research node: ${nodeId}`);

  if (settlement.research?.activeResearchId) {
    throw new Error('Another research project is already running. Pause it first.');
  }

  const check = canUnlockResearchNode(settlement, nodeId);
  if (!check.allowed) throw new Error(check.reason || 'Cannot start research.');

  const updatedSettlement: SettlementState = {
    ...settlement,
    research: {
      ...settlement.research,
      activeResearchId: nodeId,
      activeProgressSec: 0,
    },
  };
  return { updatedSettlement, node };
}

/** Pauses the active project and preserves its accumulated progress. */
export function pauseResearch(settlement: SettlementState): SettlementState {
  return {
    ...settlement,
    research: {
      ...settlement.research,
      activeResearchId: null,
    },
  };
}

/**
 * Ticks research over time:
 * 1. Generates Research Points from stations/workers.
 * 2. Advances the active project by worker-seconds. When the duration completes
 *    the node is unlocked and its Research Point cost is charged.
 */
export function tickResearchSimulation(
  settlement: SettlementState,
  deltaRealSeconds: number,
  clockSpeed = 1
): SettlementState {
  if (!settlement.research) {
    return { ...settlement, research: createInitialResearchState() };
  }
  if (clockSpeed === 0 || deltaRealSeconds <= 0) return settlement;

  const { totalRatePerSec, researchWorkers } = calculateResearchGenerationRate(settlement);
  const effectiveDeltaSec = deltaRealSeconds * clockSpeed;
  const effectiveWorkers = Math.max(1, researchWorkers);

  let research = {
    ...settlement.research,
    passiveRatePerSec: totalRatePerSec,
    researchPoints:
      Math.round((settlement.research.researchPoints + totalRatePerSec * effectiveDeltaSec) * 100) / 100,
  };

  const activeId = research.activeResearchId;
  if (activeId) {
    const node = RESEARCH_TREE_NODES[activeId];
    if (node) {
      const gainedWorkerSec = effectiveWorkers * effectiveDeltaSec;
      const nextProgress = research.activeProgressSec + gainedWorkerSec;
      if (nextProgress >= node.baseTimeSec) {
        // Project complete: unlock, charge RP, clear active slot.
        research = {
          ...research,
          researchPoints: Math.max(0, research.researchPoints - node.costRP),
          unlockedNodes: [...research.unlockedNodes, node.id],
          activeResearchId: null,
          activeProgressSec: 0,
        };
      } else {
        research = { ...research, activeProgressSec: nextProgress };
      }
    }
  }

  return { ...settlement, research };
}

/** Instant unlock used for scripted quest/directive rewards (bypasses research time). */
export function unlockResearchNode(
  settlement: SettlementState,
  nodeId: string
): { updatedSettlement: SettlementState; node: ResearchNode } {
  const node = RESEARCH_TREE_NODES[nodeId];
  if (!node) throw new Error(`Invalid research node: ${nodeId}`);
  if (settlement.research?.unlockedNodes?.includes(nodeId)) {
    return { updatedSettlement: settlement, node };
  }
  return {
    updatedSettlement: {
      ...settlement,
      research: {
        ...settlement.research,
        unlockedNodes: [...(settlement.research?.unlockedNodes || []), nodeId],
      },
    },
    node,
  };
}

/** Grants research points for testing/verification. */
export function grantDebugResearchPoints(settlement: SettlementState, amount: number): SettlementState {
  const current = settlement.research || createInitialResearchState();
  return {
    ...settlement,
    research: { ...current, researchPoints: Math.max(0, current.researchPoints + amount) },
  };
}