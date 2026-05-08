import type { PendingChange } from "@life-os/shared";

export interface SyncBatch {
  userId: string;
  baseSyncVersion: number;
  changes: PendingChange[];
}

export interface SyncResult {
  acceptedChangeIds: string[];
  rejectedChangeIds: string[];
  nextSyncVersion: number;
}

export function createEmptySyncResult(nextSyncVersion: number): SyncResult {
  return {
    acceptedChangeIds: [],
    rejectedChangeIds: [],
    nextSyncVersion
  };
}
