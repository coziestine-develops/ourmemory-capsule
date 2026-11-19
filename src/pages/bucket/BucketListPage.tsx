import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faLink, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { faCircle as faCircleOutline } from '@fortawesome/free-regular-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { useTableRealtime } from '../../hooks/useTableRealtime';
import { createBucketItem, deleteBucketItem, listBucketItems, setBucketItemDone } from '../../services/bucketList';
import { listMemoryPicker } from '../../services/memories';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { errorMessage, formatDate } from '../../lib/format';
import { filterBucket, sortBucket, summarizeBucket, type BucketFilter } from '../../lib/bucket';
import { BUCKET_CATEGORIES, type BucketCategory, type BucketItem } from '../../types';

const FILTERS: { key: BucketFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'done', label: 'Done' },
];

export default function BucketListPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<BucketFilter>('all');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<BucketCategory>('Dream');
  const [tickingId, setTickingId] = useState<string | null>(null);
  const [linkMemoryId, setLinkMemoryId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<BucketItem | null>(null);

  const queryKey = ['bucket-list', relationshipId];

  const items = useQuery({
    queryKey,
    enabled: !!relationshipId,
    queryFn: () => listBucketItems(relationshipId),
  });
  useTableRealtime('bucket_items', relationshipId ? `relationship_id=eq.${relationshipId}` : null, queryKey);

  // Only load the memory list once someone starts ticking an item off.
  const memories = useQuery({
    queryKey: ['memory-picker', relationshipId],
    enabled: !!relationshipId && tickingId !== null,
    queryFn: () => listMemoryPicker(relationshipId),
  });

  const visible = useMemo(() => filterBucket(sortBucket(items.data ?? []), filter), [items.data, filter]);
  const summary = useMemo(() => summarizeBucket(items.data ?? []), [items.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: () => createBucketItem(relationshipId, user!.id, { title, notes, category }),
    onSuccess: async () => {
      setTitle('');
      setNotes('');
      await refresh();
      toast('Added to your list.');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const tick = useMutation({
    mutationFn: ({ id, done, memoryId }: { id: string; done: boolean; memoryId?: string | null }) =>
      setBucketItemDone(id, done, memoryId ?? null),
    onSuccess: async (_data, vars) => {
      setTickingId(null);
      setLinkMemoryId('');
      await refresh();
      toast(vars.done ? 'Ticked off together.' : 'Moved back to your list.');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBucketItem(id),
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
      toast('Removed from your list.');
    },
    onError: (error) => {
      setPendingDelete(null);
      toast(errorMessage(error), 'error');
    },
  });

  const onCheck = (item: BucketItem) => {
    if (item.completed_at) {
      tick.mutate({ id: item.id, done: false });
      return;
    }
    setLinkMemoryId('');
    setTickingId(tickingId === item.id ? null : item.id);
  };

  const canAdd = title.trim().length > 0 && !add.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      <PageHeader title="Our Bucket List" subtitle="Dreams we're making real, together" />

      <section aria-label="Progress" className="card space-y-4 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-2xl font-semibold">
            {summary.done} of {summary.total} done
          </p>
          <p className="text-sm text-mocha">{summary.percent}%</p>
        </div>
        <div
          role="progressbar"
          aria-label="Bucket list progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          className="h-3 overflow-hidden rounded-full bg-blush/60"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-rose to-mocha transition-all duration-500" style={{ width: `${summary.percent}%` }} />
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) add.mutate();
        }}
        className="card space-y-4 p-6"
        aria-label="Add a dream"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <div>
            <label htmlFor="bucket-title" className="label">A dream we share</label>
            <input
              id="bucket-title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="See the northern lights"
            />
          </div>
          <div>
            <label htmlFor="bucket-category" className="label">Category</label>
            <select id="bucket-category" value={category} onChange={(e) => setCategory(e.target.value as BucketCategory)} className="input">
              {BUCKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="bucket-notes" className="label">Notes (optional)</label>
          <textarea
            id="bucket-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input resize-y"
            placeholder="Somewhere in Iceland, maybe in winter"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={!canAdd}>
          <FontAwesomeIcon icon={faPlus} /> {add.isPending ? 'Adding…' : 'Add to list'}
        </button>
      </form>

      <div role="tablist" aria-label="Filter dreams" className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === f.key ? 'bg-rose text-white shadow-romantic' : 'bg-white/70 text-mocha hover:bg-blush/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.isLoading && <p className="handwritten animate-pulse text-xl text-mocha">Gathering your dreams…</p>}

      {items.data && items.data.length === 0 && (
        <EmptyState
          icon={faCircleCheck}
          title="Nothing on the list yet"
          message="Add the first dream you want to share. Tick it off together when it happens."
        />
      )}

      {items.data && items.data.length > 0 && visible.length === 0 && (
        <p className="handwritten py-6 text-center text-lg text-mocha">Nothing in this view yet.</p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((item) => {
            const done = item.completed_at !== null;
            const ticking = tickingId === item.id;
            return (
              <li key={item.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onCheck(item)}
                    aria-pressed={done}
                    aria-label={done ? `Mark "${item.title}" as not done` : `Tick off "${item.title}"`}
                    disabled={tick.isPending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-rose transition hover:bg-blush/60"
                  >
                    <FontAwesomeIcon icon={done ? faCircleCheck : faCircleOutline} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`break-words font-semibold ${done ? 'text-mocha line-through' : 'text-espresso'}`}>{item.title}</p>
                    <p className="mt-1 text-xs text-mocha">
                      {item.category}
                      {done && item.completed_at && ` · ticked off ${formatDate(item.completed_at, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                    {item.notes && <p className="mt-2 whitespace-pre-line text-sm text-mocha">{item.notes}</p>}
                    {item.completed_memory_id && (
                      <Link to={`/memories/${item.completed_memory_id}`} className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-rose hover:underline">
                        <FontAwesomeIcon icon={faLink} /> See the memory
                      </Link>
                    )}

                    {ticking && (
                      <div className="mt-4 space-y-3 rounded-2xl bg-blush/40 p-4">
                        <label htmlFor={`link-${item.id}`} className="label">Link a memory (optional)</label>
                        <select id={`link-${item.id}`} value={linkMemoryId} onChange={(e) => setLinkMemoryId(e.target.value)} className="input">
                          <option value="">No memory</option>
                          {(memories.data ?? []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title} · {formatDate(m.memory_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={tick.isPending}
                            onClick={() => tick.mutate({ id: item.id, done: true, memoryId: linkMemoryId || null })}
                          >
                            Tick off
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setTickingId(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove "${item.title}"`}
                    onClick={() => setPendingDelete(item)}
                    className="-mr-2 rounded-full p-2 text-mocha hover:bg-blush/60"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this dream?"
        message="It will be removed from the list for both of you. This can't be undone."
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
