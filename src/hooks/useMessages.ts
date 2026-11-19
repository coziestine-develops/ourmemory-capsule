import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { countUnreadMessages, markMessagesDelivered, subscribeToMessages } from '../services/messages';
import { useRelationship } from './useRelationship';

/** Keeps message and unread-count queries fresh while the app is open. Mount once, in the layout. */
export function useMessageRealtime() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const queryClient = useQueryClient();
  const relationshipId = relationship?.id;
  const userId = user?.id;

  useEffect(() => {
    if (!relationshipId || !userId) return;

    // Anything that reaches this device is "Delivered". The call is a no-op once nothing is left to stamp.
    const deliver = () => {
      void markMessagesDelivered(relationshipId, userId).catch(() => {});
    };
    deliver();

    const unsubscribe = subscribeToMessages(relationshipId, () => {
      deliver();
      void queryClient.invalidateQueries({ queryKey: ['messages', relationshipId] });
      void queryClient.invalidateQueries({ queryKey: ['unread-messages', relationshipId] });
    });

    // Safety net in case realtime is not enabled for the table.
    const timer = window.setInterval(deliver, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') deliver();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [relationshipId, userId, queryClient]);
}

export function useUnreadMessages(): number {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id;
  const { data } = useQuery({
    queryKey: ['unread-messages', relationshipId],
    enabled: !!relationshipId && !!user,
    queryFn: () => countUnreadMessages(relationshipId!, user!.id),
    // Safety net in case realtime is not enabled for the table.
    refetchInterval: 30_000,
  });
  return data ?? 0;
}
