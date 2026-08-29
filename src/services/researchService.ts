import { RESEARCH_TREE_NODES } from '../data/researchTreeData';
import { ResearchTreeState } from '../types/research';
import { SettlementState } from '../types/settlement';

/**
 * Creates the initial research tree state
 */
export function createInitialResearchState(): ResearchTreeState {
  return {
    researchPoints: 120, // Start with 120 RP so player can test unlocking a Tier-1 tech immediately
    totalAccumulatedRP: 120,
    passiveRatePerSec: 1.5,
    unlockedNodes: [],
    activeResearchId: null,
    activeProgressSec: 0,
  };
}

/**
 * Checks if a specific research node is unlocked in the settlement
 */
export function isResearchUnlocked(settlement: SettlementState, nodeId: string): boolean {
  if (!settlement?.research?.unlockedNodes) return false;
  return settlement.research.unlockedNodes.includes(nodeId);
}

/**
 * Calculates current Research Points (RP) generation rate per second (§10)
 * Passive baseline + intellectual survivors + functional Research Labs
 */
export function calculateResearchGenerationRate(settlement: SettlementState): {
  totalRatePerSec: number;
  baseRate: number;
  survivorBonus: number;
  buildingBonus: number;
  details: string[];
} {
  let baseRate = 1.0; // Base baseline rate per second
  let survivorBonus = 0;
  let buildingBonus = 0;
  const details: string[] = ['Base Colony Ingestion: +1.0 RP/s'];

  // 1. Intellectual & Specialist Survivors Contribution
  if (settlement.namedSurvivors && settlement.namedSurvivors.length > 0) {
    for (const survivor of settlement.namedSurvivors) {
      let bonus = 0;
      
      // Medical skill contributes to virology and bio-research
      if (survivor.stats?.medical === 'expert') {
        bonus += 1.2;
      } else if (survivor.stats?.medical === 'skilled') {
        bonus += 0.6;
      }

      // Production skill contributes to engineering research
      if (survivor.stats?.production === 'expert') {
        bonus += 1.0;
      } else if (survivor.stats?.production === 'skilled') {
        bonus += 0.5;
      }

      // Background specialty bonuses
      const bg = survivor.background.toLowerCase();
      if (bg.includes('doctor') || bg.includes('scientist') || bg.includes('engineer') || bg.includes('biologist') || bg.includes('professor') || bg.includes('researcher')) {
        bonus += 0.8;
      }

      if (bonus > 0) {
        survivorBonus += bonus;
        details.push(`${survivor.name} (${survivor.background.split('•')[0] || 'Scholar'}): +${bonus.toFixed(1)} RP/s`);
      }
    }
  }

  // 2. Functional Buildings Bonus (Research Labs, Comms Relays)
  const allBuildings = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...settlement.freestandingBuildings,
  ];

  let labCount = 0;
  let commsCount = 0;

  for (const bldg of allBuildings) {
    if (bldg.constructionStatus !== 'completed') continue;

    if (bldg.typeId === 'research_lab') {
      labCount++;
      const bonus = 4.0 + (bldg.assignedWorkers || 0) * 1.0;
      buildingBonus += bonus;
    } else if (bldg.typeId === 'comms_relay') {
      commsCount++;
      buildingBonus += 1.0;
    }
  }

  if (labCount > 0) {
    details.push(`Research & Tech Labs (${labCount} active): +${(labCount * 4.0).toFixed(1)} RP/s`);
  }
  if (commsCount > 0) {
    details.push(`Radio Comms Relays (${commsCount} active): +${(commsCount * 1.0).toFixed(1)} RP/s`);
  }

  const totalRatePerSec = Math.round((baseRate + survivorBonus + buildingBonus) * 10) / 10;

  return {
    totalRatePerSec,
    baseRate,
    survivorBonus: Math.round(survivorBonus * 10) / 10,
    buildingBonus: Math.round(buildingBonus * 10) / 10,
    details,
  };
}

/**
 * Checks whether a node can be unlocked
 */
export function canUnlockResearchNode(
  settlement: SettlementState,
  nodeId: string
): { allowed: boolean; reason?: string } {
  const node = RESEARCH_TREE_NODES[nodeId];
  if (!node) {
    return { allowed: false, reason: 'Unknown research node.' };
  }

  const unlocked = settlement.research?.unlockedNodes || [];
  if (unlocked.includes(nodeId)) {
    return { allowed: false, reason: 'Already researched.' };
  }

  // Check prerequisites
  for (const prereqId of node.prerequisites) {
    if (!unlocked.includes(prereqId)) {
      const prereqNode = RESEARCH_TREE_NODES[prereqId];
      return {
        allowed: false,
        reason: `Requires prerequisite: ${prereqNode ? prereqNode.name : prereqId}`,
      };
    }
  }

  // Check RP cost
  const currentRP = settlement.research?.researchPoints || 0;
  if (currentRP < node.costRP) {
    return {
      allowed: false,
      reason: `Insufficient Research Points. Needs ${node.costRP} RP (have ${Math.floor(currentRP)} RP).`,
    };
  }

  return { allowed: true };
}

/**
 * Unlocks a research node and applies direct state modifiers (§10)
 */
export function unlockResearchNode(
  settlement: SettlementState,
  nodeId: string
): { updatedSettlement: SettlementState; node: typeof RESEARCH_TREE_NODES[string] } {
  const node = RESEARCH_TREE_NODES[nodeId];
  if (!node) {
    throw new Error(`Invalid research node: ${nodeId}`);
  }

  const check = canUnlockResearchNode(settlement, nodeId);
  if (!check.allowed) {
    throw new Error(check.reason || 'Cannot unlock node.');
  }

  const currentRP = settlement.research.researchPoints;
  const newUnlocked = [...settlement.research.unlockedNodes, nodeId];

  let newSquadCapacity = settlement.squadCapacity;
  let newStorageCapacity = settlement.totalStorageCapacity;
  let newLivingCapacity = settlement.totalLivingCapacity;

  // Apply instant settlement-level stat unlocks
  if (nodeId === 'communications_regional_command') {
    newSquadCapacity = Math.max(3, newSquadCapacity + 1);
  }
  if (nodeId === 'logistics_cargo_racks') {
    newStorageCapacity += 100;
  }
  if (nodeId === 'survival_insulation') {
    newLivingCapacity = Math.round(newLivingCapacity * 1.25);
  }

  const updatedSettlement: SettlementState = {
    ...settlement,
    squadCapacity: newSquadCapacity,
    totalStorageCapacity: newStorageCapacity,
    totalLivingCapacity: newLivingCapacity,
    research: {
      ...settlement.research,
      researchPoints: Math.max(0, currentRP - node.costRP),
      unlockedNodes: newUnlocked,
    },
  };

  return { updatedSettlement, node };
}

/**
 * Ticks research generation over time
 */
export function tickResearchSimulation(
  settlement: SettlementState,
  deltaRealSeconds: number,
  clockSpeed = 1
): SettlementState {
  if (!settlement.research) {
    return {
      ...settlement,
      research: createInitialResearchState(),
    };
  }

  if (clockSpeed === 0 || deltaRealSeconds <= 0) {
    return settlement;
  }

  const { totalRatePerSec } = calculateResearchGenerationRate(settlement);
  const rpGained = totalRatePerSec * deltaRealSeconds * clockSpeed;

  return {
    ...settlement,
    research: {
      ...settlement.research,
      passiveRatePerSec: totalRatePerSec,
      researchPoints: Math.round((settlement.research.researchPoints + rpGained) * 10) / 10,
      totalAccumulatedRP: Math.round((settlement.research.totalAccumulatedRP + rpGained) * 10) / 10,
    },
  };
}

/**
 * Grants debug Research Points for testing and verification
 */
export function grantDebugResearchPoints(
  settlement: SettlementState,
  amount: number
): SettlementState {
  const current = settlement.research || createInitialResearchState();
  return {
    ...settlement,
    research: {
      ...current,
      researchPoints: Math.max(0, current.researchPoints + amount),
      totalAccumulatedRP: Math.max(0, current.totalAccumulatedRP + (amount > 0 ? amount : 0)),
    },
  };
}
