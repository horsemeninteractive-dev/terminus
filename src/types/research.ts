export type ResearchBranch =
  | 'survival'
  | 'defense'
  | 'medical'
  | 'production'
  | 'logistics'
  | 'communications';

export interface ResearchEffect {
  stat: string;
  value: string;
  description: string;
}

export interface ResearchNode {
  id: string;
  branch: ResearchBranch;
  tier: 1 | 2 | 3 | 4;
  name: string;
  tagline: string;
  description: string;
  iconName: string;
  costRP: number;
  prerequisites: string[]; // Node IDs required before unlocking this node
  unlockedBuildingTypeId?: string;
  effects: ResearchEffect[];
  categoryTag: string;
}

export interface ResearchTreeState {
  researchPoints: number;
  totalAccumulatedRP: number;
  passiveRatePerSec: number;
  unlockedNodes: string[];
  activeResearchId: string | null;
  activeProgressSec: number;
}
