import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { readRelationshipCache, writeRelationshipCache } from '../lib/relationshipCache';
import { getCurrentRelationship } from '../services/relationships';
import type { Relationship } from '../types';

/** Fetches the user's space and remembers it locally for instant refreshes. */
export async function fetchRelationship(userId: string): Promise<Relationship | null> {
  const relationship = await getCurrentRelationship(userId);
  writeRelationshipCache(userId, relationship);
  return relationship;
}

export function useRelationship() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['relationship', user?.id],
    enabled: !!user,
    queryFn: () => fetchRelationship(user!.id),
    // Paint from the last known space right away, then refresh it in the background.
    initialData: () => readRelationshipCache(user?.id),
    initialDataUpdatedAt: 0,
  });
}
