import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTableRealtime } from '../../hooks/useTableRealtime';
import { listMemoryReactions, setMemoryReaction } from '../../services/memoryInteractions';
import { summarizeReactions } from '../../lib/reactions';
import { errorMessage } from '../../lib/format';
import type { MemoryReaction, ReactionKey } from '../../types';

export function MemoryReactions({ memoryId }: { memoryId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['memory-reactions', memoryId];

  const reactions = useQuery({
    queryKey,
    queryFn: () => listMemoryReactions(memoryId),
  });
  useTableRealtime('memory_reactions', `memory_id=eq.${memoryId}`, queryKey);

  const toggle = useMutation({
    mutationFn: ({ reaction, on }: { reaction: ReactionKey; on: boolean }) =>
      setMemoryReaction(memoryId, user!.id, reaction, on),
    // Update the counts immediately, then roll back if the server refuses.
    onMutate: async ({ reaction, on }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MemoryReaction[]>(queryKey);
      queryClient.setQueryData<MemoryReaction[]>(queryKey, (rows = []) =>
        on
          ? [...rows, { memory_id: memoryId, user_id: user!.id, reaction }]
          : rows.filter((row) => !(row.user_id === user!.id && row.reaction === reaction)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast(errorMessage(error), 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const summary = summarizeReactions(reactions.data ?? [], user?.id ?? '');

  return (
    <section aria-label="Reactions" className="flex flex-wrap items-center gap-2">
      {summary.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.mine}
          aria-label={item.count > 0 ? `${item.label}, ${item.count}` : item.label}
          title={item.label}
          disabled={!user || reactions.isLoading}
          onClick={() => toggle.mutate({ reaction: item.key, on: !item.mine })}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-base transition disabled:opacity-60 ${
            item.mine
              ? 'border-rose bg-blush text-espresso shadow-sm'
              : 'border-blush bg-white/80 text-mocha hover:bg-blush/60'
          }`}
        >
          <span aria-hidden="true">{item.emoji}</span>
          {item.count > 0 && <span className="text-sm font-semibold">{item.count}</span>}
        </button>
      ))}
    </section>
  );
}
