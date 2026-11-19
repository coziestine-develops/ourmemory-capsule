// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../src/contexts/ToastContext';

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} }, supabaseConfigured: true }));
vi.mock('../src/hooks/useProfile', () => ({
  useProfile: () => ({ data: { id: 'me', display_name: 'Anna', username: 'anna', avatar_path: null, birthday: null } }),
}));
vi.mock('../src/hooks/useLoverRequests', () => ({ useLoverRequests: () => ({ data: [] }) }));

const findUserByUsername = vi.fn();
const sendLoverRequest = vi.fn();
vi.mock('../src/services/loverRequests', async (orig) => ({
  ...(await orig<typeof import('../src/services/loverRequests')>()),
  findUserByUsername: (...args: unknown[]) => findUserByUsername(...args),
  sendLoverRequest: (...args: unknown[]) => sendLoverRequest(...args),
}));

import { AddLoverPanel } from '../src/components/relationship/AddLoverPanel';

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <AddLoverPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Add your lover', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses the new name and no invite link', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Add your lover' })).toBeTruthy();
    expect(screen.queryByText(/invite/i)).toBeNull();
    expect(screen.queryByText(/invitation link/i)).toBeNull();
    expect(screen.getByText('@anna')).toBeTruthy();
  });

  it('finds a username and sends a request', async () => {
    findUserByUsername.mockResolvedValue({ id: 'bob-id', display_name: 'Bob', username: 'bob', in_space: false });
    sendLoverRequest.mockResolvedValue('req-1');
    renderPanel();

    fireEvent.change(screen.getByLabelText('Their username'), { target: { value: '@Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /find/i }));

    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(findUserByUsername).toHaveBeenCalledWith('bob');
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));
    await waitFor(() => expect(sendLoverRequest).toHaveBeenCalledWith('bob'));
  });

  it('says so when no one has the username', async () => {
    findUserByUsername.mockResolvedValue(null);
    renderPanel();
    fireEvent.change(screen.getByLabelText('Their username'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: /find/i }));
    expect(await screen.findByText('No one has the username @nobody yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send request/i })).toBeNull();
  });

  it("does not offer someone who already has a space", async () => {
    findUserByUsername.mockResolvedValue({ id: 'c', display_name: 'Carl', username: 'carl', in_space: true });
    renderPanel();
    fireEvent.change(screen.getByLabelText('Their username'), { target: { value: 'carl' } });
    fireEvent.click(screen.getByRole('button', { name: /find/i }));
    await waitFor(() => expect(findUserByUsername).toHaveBeenCalled());
    expect(screen.queryByText(/already belongs to a memory space/i)).toBeNull();
    expect(await screen.findByText("@carl can't be added right now.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send request/i })).toBeNull();
  });
});
