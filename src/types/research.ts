export type ResearchBranch =
  | 'medicine'
  | 'communication'
  | 'chemistry'
  | 'arms'
  | 'construction'
  | 'food'
  | 'infection'
  | 'education';

export interface ResearchEffect {
  stat: string;
  value: string;
  description: string;
}

export interface ResearchNode {
  id: string;
  branch: ResearchBranch;
  tier: 1 | 2 | 3 | 4; // depth from the category root; drives the graph columns
  name: string;
  description: string;
  // How long an active project takes, measured in research-worker-seconds.
  // Effective real time = baseTimeSec / researchWorkers, so more researchers
  // assigned to Research Stations complete a project faster.
  baseTimeSec: number;
  // Scientific Materials cost, charged from the stockpile
  // (`stockpile.materials.scientific_materials`) when the project completes.
  // Scientific Materials are produced by staffed Research Centers.
  costSciMat: number;
  prerequisites: string[]; // Node IDs required before this node can be started
  unlockedBuildingTypeId?: string;
  effects: ResearchEffect[];
  categoryTag: string;
}

export interface ResearchTreeState {
  unlockedNodes: string[];
  // Currently active time-based project (one at a time, IFZ-style).
  activeResearchId: string | null;
  // Research-worker-seconds accumulated toward the active project.
  activeProgressSec: number;
}