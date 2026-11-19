// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { LoginPage, SignUpPage } from '../src/pages/auth/AuthPages';

vi.mock('../src/lib/supabase', () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  };
  return { supabase: { auth }, supabaseConfigured: true, MEDIA_BUCKET: 'relationship-media' };
});

import { supabase } from '../src/lib/supabase';
const auth = supabase.auth as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/" element={<p>DASHBOARD</p>} />
              <Route path="/onboarding" element={<p>ONBOARDING</p>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('login', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows the email, password, and sign-in button', () => {
    renderAt('/login');
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('blocks submission when fields are empty', async () => {
    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the entered credentials and goes to the dashboard', async () => {
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' rectojustine84@gmail.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'rectojustine84@gmail.com', password: 'secret123' }),
    );
    expect(await screen.findByText('DASHBOARD')).toBeTruthy();
  });

  it('shows a clear message for a wrong password', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rectojustine84@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText("That email and password don't match. Try again.")).toBeTruthy();
  });

  it('shows a network message when the server cannot be reached', async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rectojustine84@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/can't reach the server/i)).toBeTruthy();
  });

  it('toggles password visibility', () => {
    renderAt('/login');
    const pw = screen.getByLabelText('Password') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw.type).toBe('text');
  });
});

describe('sign up', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('creates the account with the display name and asks for verification', async () => {
    renderAt('/signup');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rectojustine84@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalled());
    expect(auth.signUp.mock.calls[0][0].options.data.display_name).toBe('Sam');
    expect(await screen.findByText('Check your inbox')).toBeTruthy();
  });

  it('rejects mismatched passwords', async () => {
    renderAt('/signup');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rectojustine84@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
