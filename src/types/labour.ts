import { JobSector, WorkerJobTypeId } from './population';

export type LabourCommitmentKind =
  | 'building'
  | 'resource_gathering'
  | 'construction'
  | 'deconstruction'
  | 'squad';

export interface LabourCommitment {
  id: string;
  kind: LabourCommitmentKind;
  workerCount: number;
  jobType?: WorkerJobTypeId;
  sector?: JobSector;
  label?: string;
}
