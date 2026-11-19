// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { RequireAuth } from '../src/components/common/ProtectedRoute';

const session = { user: { id: 'user-1', email: 'rectojustine84@gmail.com' } };

vi.mock('../src/lib/supabase', () => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    signOut: vi.fn(),
  };
  return { supabase: { auth }, supabaseConfigured: true };
});

import { supabase } from '../src/lib/supabase';
const auth = supabase.auth as unknown as Record<string, ReturnType<typeof vi.fn>>;

function StartSignIn() {
  const { beginEntrance } = useAuth();
  return <button onClick={beginEntrance}>start</button>;
}

function renderGuard(path: string, extra?: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>LOGIN PAGE</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<p>DASHBOARD</p>} />
            </Route>
          </Routes>
          {extra}
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('welcome loader', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('signed-out visitors are sent to sign-in without seeing the loader', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    renderGuard('/');
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
    expect(screen.queryByText('Opening your capsule…')).toBeNull();
  });

  it('a returning signed-in visitor opens the page with no loader', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    renderGuard('/');
    expect(await screen.findByText('DASHBOARD')).toBeTruthy();
    expect(screen.queryByText('Opening your capsule…')).toBeNull();
  });

  it('the loader plays right after sign-in and then clears', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    renderGuard('/', <StartSignIn />);
    await screen.findByText('DASHBOARD');
    act(() => screen.getByText('start').click());
    expect(screen.getByText('Opening your capsule…')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Opening your capsule…')).toBeNull(), { timeout: 4000 });
    expect(screen.getByText('DASHBOARD')).toBeTruthy();
  });
});
