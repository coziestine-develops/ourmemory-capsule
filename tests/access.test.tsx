// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { LoginPage } from '../src/pages/auth/AuthPages';
import { ACCESS_DENIED_MESSAGE, isAllowedEmail } from '../src/lib/access';

vi.mock('../src/lib/supabase', () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  return { supabase: { auth }, supabaseConfigured: true };
});

import { supabase } from '../src/lib/supabase';
const auth = supabase.auth as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderLogin() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<p>DASHBOARD</p>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('email allowlist', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('allows only the two members, ignoring case and spaces', () => {
    expect(isAllowedEmail('rectojustine84@gmail.com')).toBe(true);
    expect(isAllowedEmail('  GucelaMary21@gmail.com ')).toBe(true);
    expect(isAllowedEmail('stranger@gmail.com')).toBe(false);
    expect(isAllowedEmail('rectojustine84@gmail.co')).toBe(false);
    expect(isAllowedEmail('')).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });

  it('blocks sign-in for other emails before any request is sent', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'stranger@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(ACCESS_DENIED_MESSAGE)).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('lets an allowed email attempt sign-in', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rectojustine84@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(ACCESS_DENIED_MESSAGE)).toBeNull();
  });
});
