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
}
