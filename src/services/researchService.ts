import { RESEARCH_TREE_NODES } from '../data/researchTreeData';
import { ResearchNode, ResearchTreeState } from '../types/research';
import { SettlementState } from '../types/settlement';
import { getPoweredBuildingIds } from './powerService';

/**
 * Creates the initial research tree state. Research is funded by Scientific
 * Materials in the stockpile and progresses only while a Research Center is
 * staffed — there is no free baseline trickle.
 */
export function createInitialResearchState(): ResearchTreeState {
  return {
    unlockedNodes: [],
    activeResearchId: null,
    activeProgressSec: 0,
  };
}

export function isResearchUnlocked(settlement: SettlementState, nodeId: string): boolean {
  if (!settlement?.research?.unlockedNodes) return false;
  return settlement.research.unlockedNodes.includes(nodeId);
}

/** Human-readable name for a research node id (falls back to the raw id). */
export function getResearchNodeName(nodeId: string): string {
  return RESEARCH_TREE_NODES[nodeId]?.name || nodeId;
}

/**
 * Whether a building (identified by its optional researchRequirement node id) is
 * currently unlocked. Buildings with no requirement are available from the start.
 */
export function getBuildingLockStatus(
  settlement: SettlementState,
  researchRequirement?: string
): { unlocked: boolean; requiredName?: string } {
  if (!researchRequirement) return { unlocked: true };
  const unlocked = isResearchUnlocked(settlement, researchRequirement);
  return { unlocked, requiredName: getResearchNodeName(researchRequirement) };
}

/** The single authoritative list of nodes. */
export function getAllResearchNodes(): ResearchNode[] {
  return Object.values(RESEARCH_TREE_NODES);
}

/**
 * Scientific Materials currently held in the colony stockpile. Research Center
 * production adds to this bucket; completing a research project spends it.
 */
export function getScientificMaterials(settlement: SettlementState): number {
  return Math.max(0, settlement.stockpile?.materials?.scientific_materials ?? 0);
}

/**
 * Counts how many research workers are assigned to completed Research Centers.
 * Both the canonical Research Center and the legacy Research Lab alias count as
 * research stations. Research progress scales directly with this count (worker
 * seconds), and the stations' production of Scientific Materials also depends
 * on these workers.
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
    if (bldg.typeId === 'research_center' || bldg.typeId === 'research_lab') {
      workers += bldg.assignedWorkers || 0;
    }
  }
  return workers;
}

function missingPrereqs(settlement: SettlementState, node: ResearchNode): string[] {
  const unlocked = settlement.research?.unlockedNodes || [];
  return (node.prerequisites || []).filter((p) => !unlocked.includes(p));
}

/**
 * Whether a project can be started right now (prerequisites met and enough
 * Scientific Materials banked to fund it, and not already unlocked or active).
 * Used to drive node state + the Start Research button.
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

  const currentSciMat = getScientificMaterials(settlement);
  if (currentSciMat < node.costSciMat) {
    return {
      allowed: false,
      reason: `Insufficient Scientific Materials. Needs ${node.costSciMat} (have ${Math.floor(currentSciMat)}).`,
    };
  }

  return { allowed: true };
}

/**
 * Estimated real-time seconds to complete a project at the current worker
 * count. With no researchers assigned the project cannot advance at all —
 * reported as infinite so the UI can show that staffing is required.
 */
export function getEstimatedResearchSeconds(settlement: SettlementState, node: ResearchNode, progressSec = 0): number {
  const researchWorkers = getResearchWorkerCount(settlement);
  if (researchWorkers <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, node.baseTimeSec - progressSec) / researchWorkers;
}

/**
 * Starts (or resumes) a time-based research project. Scientific Materials are
 * charged on completion, not up front (the stockpile is only gated so the
 * colony can actually fund the project when it lands). Only one project can
 * run at a time.
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
 * - The active project advances by research-worker-seconds (staffed Research
 *   Centers only). Zero researchers means zero progress — the project simply
 *   holds until scientists are assigned.
 * - When the duration completes the node is unlocked and its Scientific
 *   Materials cost is consumed from the stockpile.
 */
export function tickResearchSimulation(
  settlement: SettlementState,
  deltaRealSeconds: number,
  clockSpeed = 1,
  isNight = false
): SettlementState {
  if (!settlement.research) {
    return { ...settlement, research: createInitialResearchState() };
  }
  if (clockSpeed === 0 || deltaRealSeconds <= 0) return settlement;

  // Research-station workers are sheltered at night: the project holds.
  const researchWorkers = isNight ? 0 : getResearchWorkerCount(settlement);
  // §Terminus power grid: a powered Research Center runs its instruments
  // round the clock — research progresses 50% faster per powered center.
  const poweredCenters = getPoweredBuildingIds(settlement).size > 0
    ? Math.max(0, getPoweredResearchCenterCount(settlement))
    : 0;
  const researchSpeed = 1 + 0.5 * poweredCenters;
  const effectiveDeltaSec = deltaRealSeconds * clockSpeed;

  let research = { ...settlement.research };

  const activeId = research.activeResearchId;
  if (activeId) {
    const node = RESEARCH_TREE_NODES[activeId];
    if (node) {
      const gainedWorkerSec = researchWorkers * effectiveDeltaSec * researchSpeed;
      const nextProgress = research.activeProgressSec + gainedWorkerSec;
      if (nextProgress >= node.baseTimeSec) {
        // Project complete: consume Scientific Materials, unlock, clear slot.
        const materials = {
          ...settlement.stockpile.materials,
          scientific_materials: Math.max(
            0,
            (settlement.stockpile.materials.scientific_materials ?? 0) - node.costSciMat
          ),
        };
        research = {
          ...research,
          unlockedNodes: [...research.unlockedNodes, node.id],
          activeResearchId: null,
          activeProgressSec: 0,
        };
        return {
          ...settlement,
          stockpile: { ...settlement.stockpile, materials },
          research,
        };
      }
      research = { ...research, activeProgressSec: nextProgress };
    }
  }

  return { ...settlement, research };
}

/** Number of operational research centers receiving power this tick. */
function getPoweredResearchCenterCount(settlement: SettlementState): number {
  const powered = getPoweredBuildingIds(settlement);
  let count = 0;
  const all = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...(settlement.freestandingBuildings || []),
  ];
  for (const b of all) {
    if ((b.typeId === 'research_center' || b.typeId === 'research_lab') && powered.has(String(b.buildingId))) {
      count++;
    }
  }
  return count;
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

/** Grants Scientific Materials (stockpile bucket) for testing/verification. */
export function grantScientificMaterials(settlement: SettlementState, amount: number): SettlementState {
  return {
    ...settlement,
    stockpile: {
      ...settlement.stockpile,
      materials: {
        ...settlement.stockpile.materials,
        scientific_materials: Math.max(
          0,
          (settlement.stockpile.materials.scientific_materials ?? 0) + amount
        ),
      },
    },
  };
}

/** Legacy alias kept for callers predating the Scientific Materials model. */
export const grantDebugResearchPoints = grantScientificMaterials;
