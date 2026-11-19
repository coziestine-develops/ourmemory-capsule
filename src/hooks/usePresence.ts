import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPresenceSnapshot, startPresence, subscribePresence, type PresenceState } from '../lib/presence';
import { useRelationship } from './useRelationship';

/** Marks me as online while the app is open. Mount once, in the layout. */
export function usePresence() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id;
  const userId = user?.id;

  useEffect(() => {
    if (!relationshipId || !userId) return;
    return startPresence(relationshipId, userId);
  }, [relationshipId, userId]);
}

/** Who is online and who is typing right now. */
export function usePresenceState(): PresenceState {
  return useSyncExternalStore(subscribePresence, getPresenceSnapshot, getPresenceSnapshot);
}
