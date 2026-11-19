import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type RealtimeTable = 'bucket_items' | 'memory_reactions' | 'memory_comments';

/**
 * Refetches a query whenever rows matching `filter` change, so both partners see
 * ticks, reactions and comments without reloading. Pass a null filter to pause it.
 */
export function useTableRealtime(table: RealtimeTable, filter: string | null, queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  const keyJson = JSON.stringify(queryKey);

  useEffect(() => {
    if (!filter) return;
    const channel = supabase
      .channel(`${table}:${filter}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => void queryClient.invalidateQueries({ queryKey: JSON.parse(keyJson) as QueryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, keyJson, queryClient]);
}
