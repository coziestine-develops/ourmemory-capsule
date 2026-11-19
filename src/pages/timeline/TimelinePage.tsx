import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { useRelationship } from '../../hooks/useRelationship';
import { listImportantDates, listTimelineMemories } from '../../services/calendar';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { SignedMedia } from '../../components/memories/SignedMedia';
import { coverOf } from '../../components/memories/coverOf';
import { errorMessage, formatDate } from '../../lib/format';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import type { ImportantDate, Memory } from '../../types';
import { BrandIcon } from '../../components/common/BrandIcon';

type Entry =
  | { kind: 'memory'; date: string; memory: Memory }
  | { kind: 'milestone'; date: string; milestone: ImportantDate };

export default function TimelinePage() {
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const [year, setYear] = useState<number | null>(null);

  const memories = useQuery({
    queryKey: ['timeline-memories', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listTimelineMemories(relationshipId),
  });
  const dates = useQuery({
    queryKey: ['dates', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listImportantDates(relationshipId),
  });

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = (memories.data ?? []).map((memory) => ({ kind: 'memory', date: memory.memory_date, memory }));
    (dates.data ?? [])
      .filter((d) => d.event_type === 'milestone')
      .forEach((milestone) => list.push({ kind: 'milestone', date: milestone.event_date, milestone }));
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [memories.data, dates.data]);

  const years = useMemo(() => [...new Set(entries.map((e) => Number(e.date.slice(0, 4))))], [entries]);
  const visible = year ? entries.filter((e) => Number(e.date.slice(0, 4)) === year) : entries;

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    visible.forEach((e) => {
      const key = e.date.slice(0, 7);
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    });
    return [...map.entries()];
  }, [visible]);

  const loading = memories.isLoading || dates.isLoading;
  const error = memories.error ?? dates.error;

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <PageHeader title="Our Timeline" subtitle="A journey full of love" />

      {years.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by year">
          <button type="button" className={`chip ${year === null ? 'chip-active' : ''}`} onClick={() => setYear(null)}>All years</button>
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={year === y} className={`chip ${year === y ? 'chip-active' : ''}`} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-sm">{errorMessage(error)}</p>}
      {loading && <p className="handwritten animate-pulse text-2xl text-mocha">Tracing your story…</p>}

      {!loading && entries.length === 0 && (
        <EmptyState
          icon={faClockRotateLeft}
          title="Your story starts here"
          message="Add memories and milestones and they will line up into a timeline of your love."
          action={<Link to="/memories/new" className="btn-primary">Add your first memory</Link>}
        />
      )}

      {groups.map(([key, items]) => {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        return (
          <section key={key} aria-label={label} className="space-y-5">
            <h2 className="eyebrow-line font-heading text-2xl font-semibold text-espresso">{label}</h2>
            <ol className="relative ml-4 space-y-6 border-l-2 border-dashed border-rose/50 pl-8">
              {items.map((entry) => {
                const dayLabel = formatDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' });
                if (entry.kind === 'milestone') {
                  return (
                    <li key={`m-${entry.milestone.id}`} className="relative">
                      <span className="absolute -left-[2.85rem] top-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose text-white shadow-romantic">
                        <FontAwesomeIcon icon={faStar} className="text-xs" aria-hidden="true" />
                      </span>
                      <p className="text-xs uppercase tracking-wider text-cocoa">{dayLabel}</p>
                      <p className="handwritten text-3xl text-espresso">{entry.milestone.title}</p>
                      {entry.milestone.notes && <p className="text-mocha">{entry.milestone.notes}</p>}
                    </li>
                  );
                }
                const cover = coverOf(entry.memory);
                return (
                  <li key={entry.memory.id} className="relative">
                    <span className="absolute -left-[2.85rem] top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-rose shadow-romantic">
                      <BrandIcon className="text-xs" aria-hidden="true" />
                    </span>
                    <p className="text-xs uppercase tracking-wider text-cocoa">{dayLabel}</p>
                    <Link to={`/memories/${entry.memory.id}`} className="card mt-2 flex gap-4 p-4 transition hover:-translate-y-0.5">
                      <div className="polaroid w-24 shrink-0 p-1.5 pb-2 sm:w-32">
                        <div className="aspect-square overflow-hidden bg-blush/50">
                          {cover && <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={entry.memory.title} className="h-full w-full object-cover" />}
                        </div>
                      </div>
                      <div className="min-w-0 self-center">
                        <h3 className="font-heading text-xl font-semibold">{entry.memory.title}</h3>
                        {entry.memory.description && <p className="mt-1 line-clamp-2 text-sm text-mocha">{entry.memory.description}</p>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
