/**
 * Page loaders for every code-split app route. App.tsx uses these for React.lazy,
 * and the navigation calls preloadRoute() on hover/touch/focus so the destination
 * chunk is already downloaded by the time the user taps it.
 */
export const pageLoaders = {
  dashboard: () => import('../pages/DashboardPage'),
  memories: () => import('../pages/memories/MemoriesPage'),
  memoryEditor: () => import('../pages/memories/MemoryEditorPage'),
  memoryDetail: () => import('../pages/memories/MemoryDetailPage'),
  albums: () => import('../pages/albums/AlbumsPage'),
  albumDetail: () => import('../pages/albums/AlbumDetailPage'),
  calendar: () => import('../pages/calendar/CalendarPage'),
  timeline: () => import('../pages/timeline/TimelinePage'),
  letters: () => import('../pages/letters/LettersPage'),
  letterEditor: () => import('../pages/letters/LetterEditorPage'),
  letterDetail: () => import('../pages/letters/LetterDetailPage'),
  capsules: () => import('../pages/capsules/CapsulesPage'),
  capsuleNew: () => import('../pages/capsules/CapsuleNewPage'),
  capsuleDetail: () => import('../pages/capsules/CapsuleDetailPage'),
  bucketList: () => import('../pages/bucket/BucketListPage'),
  messages: () => import('../pages/messages/MessagesPage'),
  relationship: () => import('../pages/relationship/RelationshipPage'),
  settings: () => import('../pages/settings/SettingsPage'),
} as const;

/** Top-level destinations that are worth preloading from the navigation. */
const preloadByPath: Partial<Record<string, () => Promise<unknown>>> = {
  '/': pageLoaders.dashboard,
  '/memories': pageLoaders.memories,
  '/memories/new': pageLoaders.memoryEditor,
  '/albums': pageLoaders.albums,
  '/calendar': pageLoaders.calendar,
  '/timeline': pageLoaders.timeline,
  '/letters': pageLoaders.letters,
  '/capsules': pageLoaders.capsules,
  '/bucket-list': pageLoaders.bucketList,
  '/messages': pageLoaders.messages,
  '/relationship': pageLoaders.relationship,
  '/settings': pageLoaders.settings,
};

const requested = new Set<string>();

/** Starts downloading a route's code once. Safe to call repeatedly; failures are ignored. */
export function preloadRoute(path: string): void {
  if (requested.has(path)) return;
  const loader = preloadByPath[path];
  if (!loader) return;
  requested.add(path);
  loader().catch(() => requested.delete(path));
}

/**
 * Downloads every page chunk in the background once the browser is idle, one at a time,
 * so later navigation never waits on the network. Returns a function that cancels it.
 */
export function preloadAllRoutes(): () => void {
  const timers: number[] = [];
  let idleId: number | undefined;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  const start = () => {
    Object.values(pageLoaders).forEach((load, index) => {
      timers.push(window.setTimeout(() => { load().catch(() => undefined); }, index * 120));
    });
  };

  if (w.requestIdleCallback) idleId = w.requestIdleCallback(start, { timeout: 3000 });
  else timers.push(window.setTimeout(start, 1500));

  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
  };
}
