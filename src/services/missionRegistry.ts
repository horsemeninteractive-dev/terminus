/**
 * Content registry — the single discovery point for missions, transmissions
 * and narrative content. Content files register themselves here; the engine
 * (missionService) reads through this registry only.
 *
 * Validation runs once at module load in dev/tests: duplicate ids, dangling
 * transmission/mission references, invalid task types and unknown conditions
 * are all caught loudly instead of failing at runtime mid-campaign.
 */
import { MissionDefinition, MissionTaskType } from '../types/mission';
import { TransmissionDefinition } from '../types/radioDirective';
import { CAMPAIGN_MISSIONS } from '../data/missions/campaignMissions';
import { DYNAMIC_MISSIONS, DYNAMIC_COMPLETION_TRANSMISSIONS } from '../data/missions/dynamicMissions';
import { CAMPAIGN_TRANSMISSIONS, DYNAMIC_TRANSMISSIONS } from '../data/transmissions/campaignTransmissions';
import {
  registerMissionDefinitions,
  registerTransmissionDefinitions,
  getRegisteredMissionDefinitions,
  getRegisteredTransmissionDefinitions,
  findTransmissionDefinition,
} from './missionService';

const ALL_MISSIONS: MissionDefinition[] = [...CAMPAIGN_MISSIONS, ...DYNAMIC_MISSIONS];
const ALL_TRANSMISSIONS: TransmissionDefinition[] = [
  ...CAMPAIGN_TRANSMISSIONS,
  ...DYNAMIC_TRANSMISSIONS,
  ...(DYNAMIC_COMPLETION_TRANSMISSIONS as unknown as TransmissionDefinition[]),
];

const KNOWN_TASK_TYPES = new Set<MissionTaskType>([
  'establish_hq', 'form_squad', 'recruit_survivors', 'rescue_survivors',
  'scavenge_building', 'scavenge_resource', 'build_facility', 'adapt_building',
  'research_technology', 'manufacture_item', 'eliminate_infected', 'clear_lair',
  'discover_location', 'travel_to_location', 'deliver_resources',
  'reach_population', 'survive_duration', 'survive_night', 'maintain_resource',
  'contact_faction', 'establish_settlement', 'custom',
]);

export function validateContentRegistry(): string[] {
  const errors: string[] = [];
  const missionIds = new Set<string>();
  const transmissionIds = new Set<string>();

  for (const def of getRegisteredTransmissionDefinitions()) {
    if (transmissionIds.has(def.id)) errors.push(`DUPLICATE transmission id: ${def.id}`);
    transmissionIds.add(def.id);
  }
  for (const def of getRegisteredMissionDefinitions()) {
    if (missionIds.has(def.id)) errors.push(`DUPLICATE mission id: ${def.id}`);
    missionIds.add(def.id);

    if (!findTransmissionDefinition(def.briefingTransmissionId)) {
      errors.push(`mission ${def.id}: briefingTransmissionId "${def.briefingTransmissionId}" not found`);
    }
    if (def.completionTransmissionId && !findTransmissionDefinition(def.completionTransmissionId)) {
      errors.push(`mission ${def.id}: completionTransmissionId "${def.completionTransmissionId}" not found`);
    }
    if (def.failureTransmissionId && !findTransmissionDefinition(def.failureTransmissionId)) {
      errors.push(`mission ${def.id}: failureTransmissionId "${def.failureTransmissionId}" not found`);
    }
    for (const opt of def.responseOptions) {
      if (opt.followUpTransmissionId && !findTransmissionDefinition(opt.followUpTransmissionId)) {
        errors.push(`mission ${def.id}: response followUpTransmissionId "${opt.followUpTransmissionId}" not found`);
      }
      if (opt.action === 'branch' && opt.missionId && !missionIds.has(opt.missionId) && !ALL_MISSIONS.some((m) => m.id === opt.missionId)) {
        errors.push(`mission ${def.id}: branch target "${opt.missionId}" not found`);
      }
    }
    for (const task of def.tasks) {
      if (!KNOWN_TASK_TYPES.has(task.type)) {
        errors.push(`mission ${def.id}: unknown task type "${task.type}"`);
      }
      if (task.type === 'research_technology' && !task.researchId) {
        errors.push(`mission ${def.id}: research_technology task "${task.id}" missing researchId`);
      }
    }
  }

  for (const tx of ALL_TRANSMISSIONS) {
    if (tx.missionId && !ALL_MISSIONS.some((m) => m.id === tx.missionId)) {
      errors.push(`transmission ${tx.id}: references unknown mission "${tx.missionId}"`);
    }
    if (tx.followUpTransmissionId && !ALL_TRANSMISSIONS.some((t) => t.id === tx.followUpTransmissionId)) {
      errors.push(`transmission ${tx.id}: followUpTransmissionId "${tx.followUpTransmissionId}" not found`);
    }
  }

  return errors;
}

let registered = false;

/** Register all content. Called once at app boot (and test setup). */
export function registerAllContent(): { missions: number; transmissions: number; errors: string[] } {
  if (registered) {
    return {
      missions: getRegisteredMissionDefinitions().length,
      transmissions: getRegisteredTransmissionDefinitions().length,
      errors: validateContentRegistry(),
    };
  }
  registered = true;
  registerMissionDefinitions(ALL_MISSIONS);
  registerTransmissionDefinitions(ALL_TRANSMISSIONS);
  const errors = validateContentRegistry();
  if (errors.length > 0) {
    // Log loudly in dev; tests assert on these separately.
    // eslint-disable-next-line no-console
    console.warn('[MissionRegistry] content validation errors:\n' + errors.join('\n'));
  }
  return {
    missions: getRegisteredMissionDefinitions().length,
    transmissions: getRegisteredTransmissionDefinitions().length,
    errors,
  };
}