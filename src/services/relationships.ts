import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import type { Relationship } from '../types';

export async function getCurrentRelationship(userId: string): Promise<Relationship | null> {
  const { data, error } = await supabase
    .from('relationship_members')
    .select('relationships(*)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { relationships: Relationship | null } | null;
  return row?.relationships ?? null;
}

export async function getMemberCount(relationshipId: string): Promise<number> {
  const { count, error } = await supabase
    .from('relationship_members')
    .select('id', { count: 'exact', head: true })
    .eq('relationship_id', relationshipId);
  if (error) throw error;
  return count ?? 0;
}

export async function createRelationship(name: string, startDate: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_relationship', {
    p_name: name,
    p_start_date: startDate,
  });
  if (error) throw error;
  return data as string;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  if (error) throw error;
}

export function describeRelationshipError(err: unknown): string {
  const message = errorMessage(err, '');
  if (message.includes('SPACE_FULL')) return 'This memory space already has two members.';
  if (message.includes('ALREADY_IN_SPACE')) return 'You already belong to a memory space.';
  if (message.includes('NOT_A_MEMBER')) return 'Only members of this space can add a lover.';
  return errorMessage(err);
}

export interface MemberProfile {
  user_id: string;
  profile: { id: string; display_name: string; username: string | null; avatar_path: string | null } | null;
}

export async function listMembers(relationshipId: string): Promise<MemberProfile[]> {
  const { data, error } = await supabase
    .from('relationship_members')
    .select('user_id, profile:profiles(id, display_name, username, avatar_path)')
    .eq('relationship_id', relationshipId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MemberProfile[];
}

export async function updateRelationship(id: string, values: { name: string; start_date: string | null }): Promise<void> {
  const { error } = await supabase
    .from('relationships')
    .update({ name: values.name.trim(), start_date: values.start_date })
    .eq('id', id);
  if (error) throw error;
}

export async function leaveRelationship(userId: string): Promise<void> {
  const { error } = await supabase.from('relationship_members').delete().eq('user_id', userId);
  if (error) throw error;
}
