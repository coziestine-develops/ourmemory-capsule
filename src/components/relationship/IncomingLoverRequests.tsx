import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../contexts/ToastContext';
import { useLoverRequests } from '../../hooks/useLoverRequests';
import { describeLoverError, respondLoverRequest } from '../../services/loverRequests';

/** Requests sent to you by someone who wants to add you as their lover. Renders nothing when there are none. */
export function IncomingLoverRequests() {
  const requests = useLoverRequests();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const incoming = (requests.data ?? []).filter((r) => r.direction === 'incoming');

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondLoverRequest(id, accept),
    onSuccess: async (_relationshipId, { accept }) => {
      toast(accept ? 'You are sharing a memory space now.' : 'Request declined.');
      // Accepting changes your space, so refresh everything that depends on it.
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast(describeLoverError(e), 'error'),
  });

  if (incoming.length === 0) return null;

  return (
    <section aria-labelledby="lover-requests-heading" className="card p-5 sm:p-6">
      <h2 id="lover-requests-heading" className="font-heading text-xl font-semibold">Lover requests</h2>
      <ul className="mt-4 space-y-3">
        {incoming.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-espresso">{r.other_name}</p>
              <p className="text-sm text-mocha">{r.other_username ? `@${r.other_username} wants to add you as their lover.` : 'Wants to add you as their lover.'}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-primary py-2" onClick={() => respond.mutate({ id: r.id, accept: true })} disabled={respond.isPending}>
                <FontAwesomeIcon icon={faCheck} /> Accept
              </button>
              <button type="button" className="btn-ghost py-2" onClick={() => respond.mutate({ id: r.id, accept: false })} disabled={respond.isPending}>
                <FontAwesomeIcon icon={faXmark} /> Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
