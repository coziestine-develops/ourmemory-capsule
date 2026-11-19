import { Suspense, useEffect, useState } from 'react';
import { PageFallback } from '../common/PageFallback';
import { preloadRoute } from '../../lib/routes';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRightFromBracket,
  faBox,
  faListCheck,
  faCalendarDays,
  faClockRotateLeft,
  faComments,
  faEllipsis,
  faEnvelopeOpenText,
  faFolderOpen,
  faGear,
  faHouse,
  faImages,
  faMagnifyingGlass,
  faPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRelationship } from '../../hooks/useRelationship';
import { daysBetween } from '../../lib/format';
import { Logo } from '../common/Logo';
import { NotificationBell } from '../common/NotificationBell';
import { Avatar } from '../common/Avatar';
import { AvatarPicker } from '../common/AvatarPicker';
import { useProfile } from '../../hooks/useProfile';
import { useMessageRealtime, useUnreadMessages } from '../../hooks/useMessages';
import { usePresence } from '../../hooks/usePresence';
import { BrandIcon } from '../common/BrandIcon';

interface NavItem {
  label: string;
  icon?: IconDefinition;
  to: string;
  end?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { label: 'Home', icon: faHouse, to: '/', end: true },
  { label: 'Our Memories', icon: faImages, to: '/memories' },
  { label: 'Albums', icon: faFolderOpen, to: '/albums' },
  { label: 'Calendar', icon: faCalendarDays, to: '/calendar' },
  { label: 'Timeline', icon: faClockRotateLeft, to: '/timeline' },
  { label: 'Messages', icon: faComments, to: '/messages' },
  { label: 'Love Letters', icon: faEnvelopeOpenText, to: '/letters' },
  { label: 'Time Capsules', icon: faBox, to: '/capsules' },
  { label: 'Bucket List', icon: faListCheck, to: '/bucket-list' },
];

const PERSONAL_NAV: NavItem[] = [
  { label: 'Our Relationship', to: '/relationship' },
  { label: 'Settings', icon: faGear, to: '/settings' },
];

function navClass(compact: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-2xl font-medium transition ${
      compact ? 'gap-2 px-2 py-2 text-[13px] leading-tight' : 'gap-3 px-3 py-2 text-sm short:py-1.5'
    } ${isActive ? 'bg-white text-espresso shadow-romantic' : 'text-mocha hover:bg-white/60 hover:text-espresso'}`;
}

function SideLink({ item, onNavigate, compact = false, badge = 0 }: { item: NavItem; onNavigate?: () => void; compact?: boolean; badge?: number }) {
  // Start fetching the destination's code on hover, focus or touch so the tap feels instant.
  const warm = () => preloadRoute(item.to);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      className={navClass(compact)}
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-rose transition ${isActive ? 'opacity-100' : 'opacity-0'}`}
          />
          <span
            className={`flex shrink-0 items-center justify-center rounded-full transition ${
              compact ? 'h-9 w-9 text-base' : 'h-9 w-9 text-base short:h-8 short:w-8'
            } ${isActive ? 'bg-rose text-white' : 'bg-blush/50 text-rose group-hover:bg-blush'}`}
          >
            {item.icon ? <FontAwesomeIcon icon={item.icon} fixedWidth className="text-base" /> : <BrandIcon light={isActive} className="text-base" />}
          </span>
          <span className={compact ? 'min-w-0 break-words' : 'truncate'}>{item.label}</span>
          {badge > 0 && (
            <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose px-1.5 text-[11px] font-semibold text-white" aria-label={`${badge} unread`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

const bottomLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'font-semibold text-espresso' : 'text-mocha'}`;

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { data: relationship } = useRelationship();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? 'You';
  const { data: profile } = useProfile();
  const unreadMessages = useUnreadMessages();
  useMessageRealtime();
  usePresence();
  const days = relationship?.start_date ? daysBetween(relationship.start_date) : null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const isMemoriesSearch = location.pathname.startsWith('/memories');

  // Header only gets a backdrop once content scrolls under it, so it never shows as a mismatched strip.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:px-5 lg:py-6 short:lg:py-4">
        <Link to="/" aria-label="Memory Capsule home" className="block px-3 py-2">
          <Logo />
        </Link>

        <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5 short:mt-3">
          {MAIN_NAV.map((item) => (
            <SideLink key={item.label} item={item} badge={item.to === '/messages' ? unreadMessages : 0} />
          ))}
        </nav>

        <Link to="/memories/new" className="btn-primary mt-5 w-full py-3 short:mt-3 short:py-2.5">
          <FontAwesomeIcon icon={faPlus} /> Add Memory
        </Link>

        <nav aria-label="Personal" className="mt-6 flex flex-col gap-0.5 border-t border-blush/80 pt-5 short:mt-3 short:pt-3">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-cocoa">Personal</p>
          {PERSONAL_NAV.map((item) => (
            <SideLink key={item.label} item={item} />
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-6 short:pt-3">
          <div className="rounded-[1.5rem] bg-gradient-to-br from-blush/70 to-white/70 p-4 short:hidden">
            <p className="handwritten text-xl leading-snug text-espresso">The best moments are the ones we keep.</p>
            {days !== null && relationship && (
              <p className="mt-2 truncate text-xs text-mocha">{relationship.name} · {days.toLocaleString()} days</p>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-white/70 p-3 shadow-sm">
            <AvatarPicker name={displayName} className="h-11 w-11 text-lg" />
            <Link to="/settings" className="min-w-0 flex-1 rounded-lg" title="Open settings">
              <p className="truncate text-sm font-semibold text-espresso">{displayName}</p>
              <p className="truncate text-xs text-mocha">{user?.email}</p>
            </Link>
            <button type="button" onClick={handleSignOut} className="rounded-full p-2 text-mocha transition hover:bg-blush/60" aria-label="Sign out" title="Sign out">
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[background-color,box-shadow] duration-150 sm:px-6 lg:px-10 lg:pb-4 lg:pt-4 ${
            scrolled ? 'bg-ivory/95 shadow-[0_10px_24px_-20px_rgba(77,9,9,0.25)]' : 'bg-transparent'
          }`}
        >
          <Link to="/" aria-label="Memory Capsule home" className="min-w-0 flex-1 lg:hidden">
            <Logo compact />
          </Link>
          <div className="hidden lg:block" />
          <div className="flex shrink-0 items-center gap-2">
            {!isMemoriesSearch && (
              <Link to="/memories" aria-label="Search memories" className="flex h-11 w-11 items-center justify-center rounded-full border border-blush bg-white/80 text-mocha shadow-sm transition hover:bg-blush/60">
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </Link>
            )}
            <NotificationBell />
            <Link to="/settings" aria-label="Your profile" className="ml-0.5 rounded-full sm:ml-1">
              <Avatar name={displayName} path={profile?.avatar_path} ring className="h-11 w-11 text-base" />
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 lg:px-10 lg:pb-16 lg:pt-6">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-espresso/30 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mx-auto max-h-[75dvh] max-w-md overflow-y-auto rounded-[2rem] border border-white bg-ivory p-4 shadow-romantic sm:p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <AvatarPicker name={displayName} className="h-12 w-12 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-espresso">{displayName}</p>
                <p className="truncate text-xs text-mocha">{user?.email}</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-mocha hover:bg-blush/60" aria-label="Close menu">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...MAIN_NAV, ...PERSONAL_NAV].filter((item) => !['Home', 'Our Memories', 'Messages'].includes(item.label)).map((item) => (
                <SideLink key={item.label} item={item} compact onNavigate={() => setMoreOpen(false)} />
              ))}
            </div>
            <button type="button" onClick={handleSignOut} className="btn-ghost mt-4 w-full">
              <FontAwesomeIcon icon={faArrowRightFromBracket} /> Sign out
            </button>
          </div>
        </div>
      )}

      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-ivory pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-3 py-2">
          <li className="flex justify-center">
            <NavLink to="/" end className={bottomLink} onPointerEnter={() => preloadRoute('/')} onTouchStart={() => preloadRoute('/')}>
              <FontAwesomeIcon icon={faHouse} className="text-base" />
              Home
            </NavLink>
          </li>
          <li className="flex justify-center">
            <NavLink to="/memories" end className={bottomLink} onPointerEnter={() => preloadRoute('/memories')} onTouchStart={() => preloadRoute('/memories')}>
              <FontAwesomeIcon icon={faImages} className="text-base" />
              Memories
            </NavLink>
          </li>
          <li className="flex justify-center">
            <NavLink to="/memories/new" aria-label="Add memory" onPointerEnter={() => preloadRoute('/memories/new')} onTouchStart={() => preloadRoute('/memories/new')} className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose to-mocha text-white shadow-romantic">
              <FontAwesomeIcon icon={faPlus} className="text-lg" />
            </NavLink>
          </li>
          <li className="flex justify-center">
            <NavLink to="/messages" className={bottomLink} onPointerEnter={() => preloadRoute('/messages')} onTouchStart={() => preloadRoute('/messages')}>
              <span className="relative">
                <FontAwesomeIcon icon={faComments} className="text-base" />
                {unreadMessages > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose px-1 text-[10px] font-semibold text-white" aria-label={`${unreadMessages} unread messages`}>
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </span>
              Messages
            </NavLink>
          </li>
          <li className="flex justify-center">
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-[11px] text-mocha">
              <FontAwesomeIcon icon={faEllipsis} className="text-base" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}