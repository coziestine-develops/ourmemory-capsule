import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faPlus,
  faTrashCan,
  faCalendarDays,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { createImportantDate, deleteImportantDate, listImportantDates, listMemoriesBetween } from '../../services/calendar';
import { PageHeader } from '../../components/common/PageHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { errorMessage, formatDate } from '../../lib/format';
import { isoDate, occursOn } from '../../lib/dates';
import { EVENT_TYPE_LABELS, type EventType, type ImportantDate, type Memory } from '../../types';
import { BrandIcon } from '../../components/common/BrandIcon';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('custom');
  const [recurring, setRecurring] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ImportantDate | null>(null);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const rangeStart = isoDate(days[0]);
  const rangeEnd = isoDate(days[41]);

  const memories = useQuery({
    queryKey: ['calendar-memories', relationshipId, rangeStart, rangeEnd],
    enabled: !!relationshipId,
    queryFn: () => listMemoriesBetween(relationshipId, rangeStart, rangeEnd),
  });
  const dates = useQuery({
    queryKey: ['dates', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listImportantDates(relationshipId),
  });

  const memoriesByDay = useMemo(() => {
    const map = new Map<string, Memory[]>();
    (memories.data ?? []).forEach((m) => map.set(m.memory_date, [...(map.get(m.memory_date) ?? []), m]));
    return map;
  }, [memories.data]);

  const eventsOn = (day: Date) => (dates.data ?? []).filter((d) => occursOn(d.event_date, d.is_recurring, day));
  const selectedKey = isoDate(selected);
  const selectedMemories = memoriesByDay.get(selectedKey) ?? [];
  const selectedEvents = eventsOn(selected);

  const add = useMutation({
    mutationFn: () =>
      createImportantDate(relationshipId, user!.id, {
        title,
        event_date: selectedKey,
        event_type: eventType,
        is_recurring: recurring,
        notes: '',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dates'] });
      setTitle('');
      setRecurring(false);
      toast('Special date saved.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteImportantDate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dates'] });
      setPendingDelete(null);
      toast('Special date removed.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader title="Calendar" subtitle="Every date that matters, in one place" />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="month-heading" className="card p-5 md:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="month-heading" className="min-w-0 font-heading text-2xl font-semibold sm:text-3xl">{monthLabel}</h2>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-ghost shrink-0 px-3" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button type="button" className="btn-ghost shrink-0 px-4" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}>
                Today
              </button>
              <button type="button" className="btn-ghost shrink-0 px-3" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wider text-cocoa">
            {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
            {days.map((day) => {
              const key = isoDate(day);
              const inMonth = day.getMonth() === month.getMonth();
              const isSelected = key === selectedKey;
              const isToday = key === isoDate(today);
              const hasMemories = (memoriesByDay.get(key)?.length ?? 0) > 0;
              const events = eventsOn(day);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(key)}${hasMemories ? ', has memories' : ''}${events.length ? `, ${events.length} special date` : ''}`}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm transition ${
                    isSelected ? 'bg-mocha text-white shadow-romantic' : inMonth ? 'text-espresso hover:bg-blush/60' : 'text-cocoa/50 hover:bg-blush/30'
                  } ${isToday && !isSelected ? 'ring-2 ring-rose/60' : ''}`}
                >
                  <span className="font-medium">{day.getDate()}</span>
                  <span className="mt-0.5 flex h-3 items-center gap-0.5">
                    {hasMemories && <BrandIcon light={isSelected} className="text-[9px]" aria-hidden="true" />}
                    {events.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-blush' : 'bg-mocha'}`} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 flex flex-wrap gap-4 text-xs text-mocha">
            <span className="flex items-center gap-2"><BrandIcon className="text-rose" /> A memory</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mocha" /> A special date</span>
          </p>
        </section>

        <aside aria-labelledby="day-heading" className="space-y-6">
          <section className="card p-6">
            <h2 id="day-heading" className="font-heading text-2xl font-semibold">{formatDate(selectedKey, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>

            <div className="mt-5 space-y-3">
              {selectedMemories.length === 0 && selectedEvents.length === 0 && (
                <p className="handwritten text-xl text-mocha">A quiet day. Add a special date or a memory for it.</p>
              )}
              {selectedMemories.map((m) => (
                <Link key={m.id} to={`/memories/${m.id}`} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 transition hover:bg-blush/50">
                  <BrandIcon className="text-rose" aria-hidden="true" />
                  <span className="truncate font-medium">{m.title}</span>
                </Link>
              ))}
              {selectedEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-blush/50 p-3">
                  <FontAwesomeIcon icon={faCalendarDays} className="text-mocha" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-mocha">{EVENT_TYPE_LABELS[e.event_type]}{e.is_recurring ? ' · every year' : ''}</p>
                  </div>
                  <button type="button" onClick={() => setPendingDelete(e)} aria-label={`Remove ${e.title}`} className="rounded-full p-2 text-mocha hover:bg-white/70">
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) add.mutate();
            }}
            className="card space-y-4 p-6"
            aria-labelledby="add-date-heading"
          >
            <h2 id="add-date-heading" className="font-heading text-xl font-semibold">Add a special date</h2>
            <div>
              <label htmlFor="event-title" className="label">Title</label>
              <input id="event-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Our first kiss" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-type" className="label">Type</label>
                <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)} className="input">
                  {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                    <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="event-date" className="label">Date</label>
                <input id="event-date" type="date" value={selectedKey} readOnly className="input cursor-default" aria-describedby="event-date-hint" />
                <p id="event-date-hint" className="mt-1 text-xs text-cocoa">Uses the day you selected.</p>
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-[#4D0909]" />
              Repeat every year
            </label>
            <button type="submit" className="btn-primary w-full" disabled={add.isPending || !title.trim()}>
              <FontAwesomeIcon icon={faPlus} /> {add.isPending ? 'Saving…' : 'Save date'}
            </button>
          </form>
        </aside>
      </div>

      {memories.error && <p role="alert" className="text-sm">{errorMessage(memories.error)}</p>}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove this date?"
        message={pendingDelete ? `"${pendingDelete.title}" will be removed from the calendar.` : ''}
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}