export type TransmissionClassification =
  | 'SITREP'
  | 'WARNING'
  | 'DIRECTIVE'
  | 'EMERGENCY'
  | 'INTEL'
  | 'UPDATE'
  | 'MILESTONE';

export interface RadioResponseOption {
  label: string;
  action: string;
  responseNote?: string;
  followUpTransmissionId?: string;
}

export type TransmissionPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

/**
 * Content-side transmission definition (data files). Timestamp and read state
 * are filled in by the engine when the transmission is materialised.
 */
export interface TransmissionDefinition {
  id: string;
  classification: TransmissionClassification;
  callsign: string;
  frequency?: string;
  title: string;
  message: string;
  audioCue?: 'chirp' | 'morse' | 'alarm' | 'static';
  requiresAcknowledgement?: boolean;
  priority?: TransmissionPriority;
  source?: string;
  missionId?: string;
  responseOptions?: RadioResponseOption[];
  /** Optional id of the transmission queued right after this one. */
  followUpTransmissionId?: string;
}

export interface RadioTransmission {
  id: string;
  classification: TransmissionClassification;
  callsign: string;
  frequency: string;
  timestamp: string;
  title: string;
  message: string;
  directiveId?: string;
  isRead: boolean;
  audioCue?: 'chirp' | 'morse' | 'alarm' | 'static';
  responseOptions?: RadioResponseOption[];
  requiresAcknowledgement?: boolean;
  /** Transmission urgency — drives whether the game pauses/interrupts. */
  priority?: TransmissionPriority;
  /** In-world radio source (SZO Network, survivors, faction, automated…). */
  source?: string;
  /** Mission definition id this transmission briefs / belongs to. */
  missionId?: string;
}

export type DirectiveConditionType =
  | 'establish_hq'
  | 'recruit_survivors'
  | 'form_squad'
  | 'scavenge_supplies'
  | 'survive_night'
  | 'build_facility'
  | 'research_tech'
  | 'eliminate_threat'
  | 'expand_network'
  | 'custom';

export interface OperationalDirective {
  id: string;
  code: string;
  title: string;
  description: string;
  classification: TransmissionClassification;
  status: 'active' | 'completed' | 'failed';
  conditionType: DirectiveConditionType;
  targetCount?: number;
  currentCount?: number;
  rewardSummary?: string;
  actionType?: string;
  completionTransmissionId?: string;
  isPrimary?: boolean;
}

export interface RadioDirectiveState {
  activeDirectives: OperationalDirective[];
  pendingDirectives?: OperationalDirective[];
  completedDirectiveIds: string[];
  transmissionLog: RadioTransmission[];
  unreadCount: number;
  currentIncomingTransmission: RadioTransmission | null;
  /**
   * Ordered queue of unread transmission ids. Supports several pending
   * transmissions at once without overwriting: `currentIncomingTransmission`
   * is always the first unread entry. Absent on legacy saves (defaults []).
   */
  incomingQueue?: string[];
}
