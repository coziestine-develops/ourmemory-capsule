// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ErrorScreen } from '../src/components/common/ErrorScreen';
import App from '../src/App';

vi.mock('../src/lib/supabase', () => {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { user: USER_FIXTURE } } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(async () => ({ error: null })),
  };
  return {
    supabase: {
      auth,
      from: (table: string) => builderFor(table),
      rpc: vi.fn(async () => ({ data: [], error: null })),
      channel: () => { const ch: Record<string, unknown> = {}; ch.on = () => ch; ch.subscribe = () => ch; ch.presenceState = () => ({}); ch.track = async () => 'ok'; ch.send = async () => 'ok'; return ch; },
      removeChannel: vi.fn(),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/y.jpg' }, error: null }), createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: 'https://x/y.jpg', error: null })), error: null }) }) },
    },
    supabaseConfigured: true,
    MEDIA_BUCKET: 'relationship-media',
  };
});

// Hoisted fixtures for the mock factory.
const USER_FIXTURE = { id: 'u1', email: 'rectojustine84@gmail.com', user_metadata: { display_name: 'Sam' } };
const builderFor = (table: string) => {
  const result = () => (table === 'relationship_members'
    ? { data: { relationships: { id: 'r1', name: 'Sam & Alex', start_date: '2024-02-14', cover_path: null, created_by: 'u1', created_at: '2024-01-01' } }, error: null, count: 1 }
    : { data: [], error: null, count: 0 });
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'range', 'is', 'gte', 'lte', 'in', 'or', 'insert', 'update', 'delete', 'upsert', 'match', 'filter']) b[m] = chain;
  b.single = () => Promise.resolve({ ...result(), data: null, error: { message: 'Not found in test' } });
  b.maybeSingle = () => Promise.resolve(result());
  // Awaited list queries resolve to arrays, like Supabase does.
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ ...result(), data: table === 'relationship_members' ? [] : result().data }).then(resolve, reject);
  return b;
};

const ROUTES = ['/', '/memories', '/memories/new', '/albums', '/calendar', '/timeline', '/letters', '/letters/new', '/messages', '/capsules', '/capsules/new', '/relationship', '/settings'];

describe('every page renders without crashing', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  for (const route of ROUTES) {
    it(`renders ${route}`, async () => {
      window.history.pushState({}, '', route);
      const { container } = render(
        <ErrorScreen>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <BrowserRouter>
              <AuthProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </ErrorScreen>,
      );
      await waitFor(() => expect(container.querySelector('main, h1')).toBeTruthy(), { timeout: 3000 });
      await new Promise((r) => setTimeout(r, 150));
      expect(container.textContent).not.toContain('Something went wrong on this page');
      expect(container.textContent).not.toContain('We couldn\'t load your space');
    });
  }
});
