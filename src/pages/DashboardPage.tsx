import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBox,
  faCalendar,
  faCalendarDays,
  faCamera,
  faEnvelopeOpenText,
  faFolderOpen,
  faGift,
  faImages,
  faLocationDot,
  faPlus,
  faStar,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { useRelationship } from '../hooks/useRelationship';
import { getDashboardData, listOnThisDay, type DashboardData } from '../services/memories';
import { getMemberCount } from '../services/relationships';
import { listImportantDates } from '../services/calendar';
import { listCapsules } from '../services/capsules';
import { daysBetween, errorMessage, formatDate, nextAnniversary } from '../lib/format';
import { daysUntil, nextOccurrence } from '../lib/dates';
import { MemoryCard } from '../components/memories/MemoryCard';
import { SignedMedia } from '../components/memories/SignedMedia';
import { coverOf } from '../components/memories/coverOf';
import { AddLoverPanel } from '../components/relationship/AddLoverPanel';
import { IncomingLoverRequests } from '../components/relationship/IncomingLoverRequests';
import { EVENT_TYPE_LABELS, type ImportantDate } from '../types';
import { BrandIcon } from '../components/common/BrandIcon';

interface UpcomingItem {
  id: string;
  title: string;
  label: string;
  date: Date;
  days: number;
}

const QUICK_LINKS = [
  { to: '/albums', label: 'Album', icon: faFolderOpen },
  { to: '/letters/new', label: 'Letter', icon: faEnvelopeOpenText },
  { to: '/capsules/new', label: 'Time capsule', icon: faBox },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id;

  const dashboard = useQuery<DashboardData>({
    queryKey: ['dashboard', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => getDashboardData(relationshipId!),
  });
  const members = useQuery({
    queryKey: ['members', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => getMemberCount(relationshipId!),
  });
  const onThisDay = useQuery({
    queryKey: ['on-this-day', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listOnThisDay(relationshipId!),
  });
  const dates = useQuery({
    queryKey: ['dates', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listImportantDates(relationshipId!),
  });
  const capsules = useQuery({
    queryKey: ['capsules', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listCapsules(relationshipId!),
  });

  if (!relationship) return null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = (user?.user_metadata?.display_name as string | undefined) ?? 'there';
  const days = relationship.start_date ? daysBetween(relationship.start_date) : null;
  const todayLabel = now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  const upcoming: UpcomingItem[] = [];
  if (relationship.start_date) {
    const anniversary = nextAnniversary(relationship.start_date);
    const date = new Date();
    date.setDate(date.getDate() + anniversary.days);
    upcoming.push({
      id: 'anniversary',
      title: 'Our Anniversary',
      label: `${anniversary.years} year${anniversary.years === 1 ? '' : 's'} together`,
      date,
      days: anniversary.days,
    });
  }
  for (const item of (dates.data ?? []) as ImportantDate[]) {
    const date = nextOccurrence(item.event_date, item.is_recurring);
    upcoming.push({ id: item.id, title: item.title, label: EVENT_TYPE_LABELS[item.event_type], date, days: daysUntil(date) });
  }
  upcoming.sort((a, b) => a.days - b.days);
  const nextEvents = upcoming.slice(0, 4);

  const featured = dashboard.data?.featured ?? null;
  const featuredCover = featured ? coverOf(featured) : undefined;
  const memoryToday = onThisDay.data?.[0] ?? null;
  const todayCover = memoryToday ? coverOf(memoryToday) : undefined;
  const openCapsules = (capsules.data ?? []).filter((c) => !c.sealed_at || new Date(c.open_at) <= new Date()).length;

  const stats = [
    { label: 'Memories', value: dashboard.data?.memoryCount ?? '–', icon: faImages },
    { label: 'Photos', value: dashboard.data?.photoCount ?? '–', icon: faCamera },
    { label: 'Capsules', value: capsules.data ? openCapsules : '–', icon: faBox },
    { label: 'Upcoming', value: dates.data ? nextEvents.length : '–', icon: faGift },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
      {/* Greeting */}
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cocoa sm:text-xs">{todayLabel}</p>
        <h1 className="break-words font-heading text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
          {greeting}, {name}
        </h1>
        <p className="handwritten text-lg text-mocha sm:text-2xl">Another day, another memory together.</p>
      </header>

      {dashboard.error && <p role="alert" className="text-sm text-espresso">{errorMessage(dashboard.error)}</p>}

      {/* Hero + stats */}
      <section aria-labelledby="hero-heading" className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <h2 id="hero-heading" className="sr-only">Your summary</h2>

        <div className="hero-gradient relative overflow-hidden rounded-3xl border border-white/70 p-5 shadow-romantic sm:rounded-[2rem] sm:p-8 lg:p-10">
          <BrandIcon
            aria-hidden="true"
            className="float-heart pointer-events-none absolute right-5 top-5 text-2xl text-rose/40 sm:right-8 sm:top-8 sm:text-3xl"
          />

          <p className="flex items-center gap-2 pr-10 text-xs font-medium text-mocha sm:text-sm">
            <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />
            {relationship.start_date ? `Together since ${formatDate(relationship.start_date)}` : 'Your story, counted from today'}
          </p>

          {days !== null ? (
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="font-heading text-5xl font-semibold leading-none sm:text-6xl lg:text-7xl">{days.toLocaleString()}</p>
              <p className="pb-1 text-sm text-mocha sm:text-base">days together</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-mocha">Set your start date in Settings to start counting.</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-3">
            <Link to="/memories/new" className="btn-primary w-full px-4 py-3 text-sm sm:w-auto">
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Add memory
            </Link>
            <Link to="/memories" className="btn-ghost w-full px-4 py-3 text-sm sm:w-auto">
              <FontAwesomeIcon icon={faImages} aria-hidden="true" /> Browse
            </Link>
          </div>
        </div>

        {/* Phones: 2x2 grid, all visible. Tablets: 4 across. Desktop: stacked column. */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1 lg:gap-4">
          {stats.map((stat) => (
            <li
              key={stat.label}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/70 bg-white/85 p-3 shadow-romantic lg:p-5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush/60 text-base text-espresso lg:h-11 lg:w-11 lg:text-lg">
                <FontAwesomeIcon icon={stat.icon} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-xl font-semibold leading-none lg:text-2xl">{stat.value}</p>
                <p className="mt-1 truncate text-[11px] text-mocha lg:text-xs">{stat.label}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Quick actions: three equal tiles on every screen size */}
      <nav aria-label="Quick actions" className="grid grid-cols-3 gap-2 sm:gap-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/85 p-3 text-center shadow-romantic transition hover:-translate-y-0.5 sm:min-h-[6.5rem] sm:p-4"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose/10 text-espresso sm:h-11 sm:w-11">
              <FontAwesomeIcon icon={link.icon} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-espresso sm:text-sm">{link.label}</span>
          </Link>
        ))}
      </nav>

      {/* Memory of the day: stacked on phones, side by side on tablets and up */}
      <section aria-labelledby="featured-heading" className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6 lg:p-8">
        <div className="polaroid mx-auto w-full max-w-xs -rotate-1 sm:mx-0 sm:w-44 sm:shrink-0 lg:w-56">
          <div className="aspect-[4/3] overflow-hidden bg-blush/50 sm:aspect-square">
            {featuredCover && (
              <SignedMedia
                path={featuredCover.storage_path}
                mediaType={featuredCover.media_type}
                alt={featured?.title ?? ''}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose">
            <FontAwesomeIcon icon={faStar} aria-hidden="true" /> Memory of the Day
          </p>
          {featured ? (
            <>
              <h2 id="featured-heading" className="mt-2 break-words font-heading text-2xl font-semibold leading-tight sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mocha sm:text-sm">
                <span className="flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faCalendar} aria-hidden="true" />
                  {formatDate(featured.memory_date)}
                </span>
                {featured.location && (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                    <span className="truncate">{featured.location}</span>
                  </span>
                )}
              </p>
              {featured.description && (
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-espresso/90 sm:line-clamp-3">{featured.description}</p>
              )}
              <Link to={`/memories/${featured.id}`} className="mt-4 inline-flex items-center gap-2 py-1 text-sm font-medium text-espresso underline-offset-4 hover:underline">
                Open memory <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <h2 id="featured-heading" className="mt-2 font-heading text-2xl font-semibold">Nothing featured yet</h2>
              <p className="handwritten mt-1 text-lg text-mocha">Add a memory and it will appear here.</p>
            </>
          )}
        </div>
      </section>

      {/* On this day */}
      {memoryToday && (
        <section aria-labelledby="otd-heading" className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6 lg:p-8">
          <div className="polaroid mx-auto w-40 shrink-0 rotate-2 sm:mx-0 sm:w-32">
            <div className="aspect-square overflow-hidden bg-blush/50">
              {todayCover && (
                <SignedMedia
                  path={todayCover.storage_path}
                  mediaType={todayCover.media_type}
                  alt={memoryToday.title}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="handwritten text-lg text-rose sm:text-xl">On this day</p>
            <h2 id="otd-heading" className="mt-0.5 break-words font-heading text-xl font-semibold sm:text-2xl">
              {memoryToday.title}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-mocha">
              {new Date(`${memoryToday.memory_date}T00:00:00`).getFullYear()} · {memoryToday.description ?? 'A moment worth remembering.'}
            </p>
            <Link to={`/memories/${memoryToday.id}`} className="mt-3 inline-flex items-center gap-2 py-1 text-sm font-medium text-espresso underline-offset-4 hover:underline">
              Relive it <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section aria-labelledby="events-heading" className="card p-5 sm:p-6 lg:p-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="events-heading" className="font-heading text-xl font-semibold sm:text-2xl">Upcoming</h2>
          <Link to="/calendar" className="inline-flex items-center gap-1.5 py-1 text-sm font-medium text-mocha hover:text-espresso">
            Calendar <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        </div>
        {nextEvents.length > 0 ? (
          <ul className="divide-y divide-blush/80">
            {nextEvents.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-blush/60 leading-none">
                  <span className="font-heading text-base font-semibold">{item.date.getDate()}</span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wide text-mocha">
                    {item.date.toLocaleString('en', { month: 'short' })}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-espresso sm:text-base">{item.title}</p>
                  <p className="truncate text-xs text-mocha">{item.label}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-medium text-espresso">
                  {item.days === 0 ? 'Today' : `${item.days}d`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="handwritten text-lg text-mocha">Add special dates in Calendar to see them here.</p>
        )}
      </section>

      {members.data !== undefined && members.data < 2 && <IncomingLoverRequests />}
      {members.data !== undefined && members.data < 2 && <AddLoverPanel />}

      {/* Recent memories: one column on phones, two on tablets, three on desktop */}
      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="recent-heading" className="font-heading text-xl font-semibold sm:text-2xl lg:text-3xl">Recent memories</h2>
          <Link to="/memories" className="inline-flex items-center gap-1.5 py-1 text-sm font-medium text-mocha hover:text-espresso">
            See all <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        </div>
        {dashboard.data && dashboard.data.recent.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {dashboard.data.recent.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center p-8 text-center sm:p-10">
            <FontAwesomeIcon icon={faCamera} className="text-3xl text-rose" aria-hidden="true" />
            <p className="mt-3 font-heading text-xl sm:text-2xl">No memories here yet.</p>
            <p className="handwritten mt-1 text-lg text-mocha">Start collecting your favorite moments together.</p>
            <Link to="/memories/new" className="btn-primary mt-5">
              <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Add a memory
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}