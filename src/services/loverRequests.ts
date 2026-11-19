import { supabase } from '../lib/supabase';
import { describeRelationshipError } from './relationships';
import type { LoverRequest } from '../types';

/** Claims or changes the caller's username (lowercase letters, numbers, dots, underscores; 3 to 30 characters). */
export async function setUsername(username: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_username', { p_username: username });
  if (error) throw error;
  return data as string;
}

/** Looks up one person by exact username. Returns null if no one has it. */
export async function findUserByUsername(
  username: string,
): Promise<{ id: string; display_name: string; username: string; in_space: boolean } | null> {
  const { data, error } = await supabase.rpc('find_user_by_username', { p_username: username });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; display_name: string; username: string; in_space: boolean }[];
  return rows[0] ?? null;
}

export async function sendLoverRequest(username: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_lover_request', { p_username: username });
  if (error) throw error;
  return data as string;
}

export async function respondLoverRequest(requestId: string, accept: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('respond_lover_request', { p_request_id: requestId, p_accept: accept });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function cancelLoverRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_lover_request', { p_request_id: requestId });
  if (error) throw error;
}

export async function listLoverRequests(): Promise<LoverRequest[]> {
  const { data, error } = await supabase.rpc('list_lover_requests');
  if (error) throw error;
  return (data ?? []) as LoverRequest[];
}

/** Friendly text for every error the lover-request RPCs can raise. */
export function describeLoverError(err: unknown): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '');
  if (message.includes('USERNAME_INVALID')) return 'Use 3 to 30 letters, numbers, dots, or underscores.';
  if (message.includes('USERNAME_TAKEN')) return 'That username is taken. Try another.';
  if (message.includes('USER_NOT_FOUND')) return "No one has that username. Check the spelling and try again.";
  if (message.includes('CANNOT_ADD_SELF')) return "That's your own username.";
  if (message.includes('REQUEST_ALREADY_PENDING')) return 'That person already has a pending request.';
  if (message.includes('NO_SPACE')) return 'Create your space first, then add your lover.';
  if (message.includes('REQUEST_INVALID')) return 'This request is no longer available.';
  if (message.includes('OLD_SPACE_HAS_CONTENT')) return 'You already have memories in your own space, so you cannot join another one yet.';
  return describeRelationshipError(err);
}
