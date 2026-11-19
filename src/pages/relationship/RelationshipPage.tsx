import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays, faGear, faPlus, faStar } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { Avatar } from '../../components/common/Avatar';
import { getDashboardData } from '../../services/memories';
import { listAlbums } from '../../services/albums';
import { createImportantDate, listImportantDates } from '../../services/calendar';
import { listMembers, getMemberCount } from '../../services/relationships';
import { AddLoverPanel } from '../../components/relationship/AddLoverPanel';
import { IncomingLoverRequests } from '../../components/relationship/IncomingLoverRequests';
import { PageHeader } from '../../components/common/PageHeader';
import { daysBetween, errorMessage, formatDate } from '../../lib/format';
import { BrandIcon } from '../../components/common/BrandIcon';

export default function RelationshipPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [milestone, setMilestone] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');

  const members = useQuery({ queryKey: ['member-list', relationshipId], enabled: !!relationshipId, queryFn: () => listMembers(relationshipId) });
  const count = useQuery({ queryKey: ['members', relationshipId], enabled: !!relationshipId, queryFn: () => getMemberCount(relationshipId) });
  const stats = useQuery({ queryKey: ['dashboard', relationshipId], enabled: !!relationshipId, queryFn: () => getDashboardData(relationshipId) });
  const albums = useQuery({ queryKey: ['albums', relationshipId], enabled: !!relationshipId, queryFn: () => listAlbums(relationshipId) });
  const dates = useQuery({ queryKey: ['dates', relationshipId], enabled: !!relationshipId, queryFn: () => listImportantDates(relationshipId) });

  const addMilestone = useMutation({
    mutationFn: () =>
      createImportantDate(relationshipId, user!.id, {
        title: milestone,
        event_date: milestoneDate,
        event_type: 'milestone',
        is_recurring: false,
        notes: '',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dates'] });
      await queryClient.invalidateQueries({ queryKey: ['timeline-memories'] });
      setMilestone('');
      setMilestoneDate('');
      toast('Milestone added to your timeline.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (!relationship) return null;

  const days = relationship.start_date ? daysBetween(relationship.start_date) : null;
  const milestones = (dates.data ?? []).filter((d) => d.event_type === 'milestone').sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
      <PageHeader
        title={relationship.name}
        subtitle="The two of you, in one place"
        action={<Link to="/settings" className="btn-ghost"><FontAwesomeIcon icon={faGear} /> Edit in settings</Link>}
      />

      <section className="hero-gradient relative overflow-hidden rounded-[2rem] border border-white p-5 shadow-romantic sm:rounded-[2.5rem] sm:p-8 md:p-12">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            {relationship.start_date && (
              <p className="text-sm text-mocha">Together since {formatDate(relationship.start_date, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-6 sm:gap-10 md:justify-start">
              {(members.data ?? []).map((m) => (
                <div key={m.user_id} className="flex flex-col items-center gap-3">
                  <Avatar name={m.profile?.display_name ?? '?'} path={m.profile?.avatar_path} ring className="h-20 w-20 border-4 border-white text-3xl shadow-romantic sm:h-24 sm:w-24 sm:text-4xl" />
                  <p className="font-heading text-xl">{m.profile?.display_name ?? 'Someone'}{m.user_id === user?.id ? ' (you)' : ''}</p>
                </div>
              ))}
            </div>
          </div>
          {days !== null && (
            <div className="rounded-[2rem] border border-white bg-white/85 px-6 py-5 text-center sm:px-10 sm:py-8 shadow-romantic">
              <BrandIcon className="text-2xl text-rose" aria-hidden="true" />
              <p className="mt-2 font-heading text-5xl font-semibold leading-none sm:text-6xl">{days.toLocaleString()}</p>
              <p className="mt-2 text-sm text-mocha">days together</p>
            </div>
          )}
        </div>
      </section>

      <section aria-label="Statistics" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Memories', value: stats.data?.memoryCount ?? '–' },
          { label: 'Photos & videos', value: stats.data?.photoCount ?? '–' },
          { label: 'Albums', value: albums.data?.length ?? '–' },
          { label: 'People', value: count.data ?? '–' },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center sm:p-5">
            <p className="font-heading text-3xl font-semibold sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-sm text-mocha">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="milestones-heading" className="card p-6 md:p-8">
          <h2 id="milestones-heading" className="mb-5 flex items-center gap-3 font-heading text-2xl font-semibold">
            <FontAwesomeIcon icon={faStar} className="text-rose" aria-hidden="true" /> Milestones
          </h2>
          {milestones.length === 0 ? (
            <p className="handwritten text-xl text-mocha">The first kiss, the first trip, the day you moved in. Add them below.</p>
          ) : (
            <ul className="space-y-4">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-start gap-4">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-rose" aria-hidden="true" />
                  <div>
                    <p className="font-heading text-lg">{m.title}</p>
                    <p className="text-sm text-mocha">{formatDate(m.event_date, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-6 grid gap-3 border-t border-blush pt-6 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (milestone.trim() && milestoneDate) addMilestone.mutate();
            }}
          >
            <div>
              <label htmlFor="ms-title" className="label">New milestone</label>
              <input id="ms-title" required maxLength={120} value={milestone} onChange={(e) => setMilestone(e.target.value)} className="input" placeholder="Our first trip" />
            </div>
            <div>
              <label htmlFor="ms-date" className="label">Date</label>
              <input id="ms-date" type="date" required value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="input" />
            </div>
            <button type="submit" className="btn-primary" disabled={addMilestone.isPending}><FontAwesomeIcon icon={faPlus} /> Add</button>
          </form>
        </section>

        <div className="space-y-6">
          {(count.data ?? 0) < 2 && <IncomingLoverRequests />}
          {(count.data ?? 0) < 2 && <AddLoverPanel />}
          <section className="card p-6">
            <h2 className="mb-3 flex items-center gap-3 font-heading text-xl font-semibold">
              <FontAwesomeIcon icon={faCalendarDays} className="text-rose" aria-hidden="true" /> Keep the dates
            </h2>
            <p className="text-sm text-mocha">Anniversaries, birthdays, and special days live on your calendar.</p>
            <Link to="/calendar" className="btn-ghost mt-4">Open calendar</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
