import type { Capsule } from '../types';

export type CapsuleStatus = 'draft' | 'sealed' | 'ready' | 'opened';

export function capsuleStatus(capsule: Capsule, now: Date = new Date()): CapsuleStatus {
  if (capsule.opened_at) return 'opened';
  if (!capsule.sealed_at) return 'draft';
  if (now.getTime() >= new Date(capsule.open_at).getTime()) return 'ready';
  return 'sealed';
}

export const CAPSULE_STATUS_LABEL: Record<CapsuleStatus, string> = {
  draft: 'Draft',
  sealed: 'Sealed',
  ready: 'Ready to open',
  opened: 'Opened',
};
