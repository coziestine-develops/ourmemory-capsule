import { supabase } from '../lib/supabase';
import { MEMORY_SELECT } from './memories';
import type { Capsule, CapsuleMessage, Memory } from '../types';

export interface CapsuleValues {
  title: string;
  description: string;
  open_at: string;
}

export async function listCapsules(relationshipId: string): Promise<Capsule[]> {
  const { data, error } = await supabase
    .from('capsules')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('open_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Capsule[];
}

export async function getCapsule(id: string): Promise<Capsule> {
  const { data, error } = await supabase.from('capsules').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Capsule;
}

export async function listCapsuleMemories(capsuleId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('capsule_memories')
    .select(`memory:memories(${MEMORY_SELECT})`)
    .eq('capsule_id', capsuleId);
  if (error) throw error;
  return ((data ?? []) as unknown as { memory: Memory }[]).map((row) => row.memory).filter(Boolean);
}

export async function listCapsuleMessages(capsuleId: string): Promise<CapsuleMessage[]> {
  const { data, error } = await supabase
    .from('capsule_messages')
    .select('*')
    .eq('capsule_id', capsuleId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CapsuleMessage[];
}

export async function createCapsule(relationshipId: string, userId: string, values: CapsuleValues): Promise<string> {
  const { data, error } = await supabase
    .from('capsules')
    .insert({
      relationship_id: relationshipId,
      created_by: userId,
      title: values.title.trim(),
      description: values.description.trim() || null,
      open_at: new Date(values.open_at).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateCapsuleDraft(id: string, values: CapsuleValues): Promise<void> {
  const { data, error } = await supabase
    .from('capsules')
    .update({
      title: values.title.trim(),
      description: values.description.trim() || null,
      open_at: new Date(values.open_at).toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('This capsule is sealed and can no longer be changed.');
}

export async function deleteCapsule(id: string): Promise<void> {
  const { error } = await supabase.from('capsules').delete().eq('id', id);
  if (error) throw error;
}

export async function addMemoriesToCapsule(capsuleId: string, memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) return;
  const { error } = await supabase
    .from('capsule_memories')
    .insert(memoryIds.map((memory_id) => ({ capsule_id: capsuleId, memory_id })));
  if (error) throw error;
}

export async function removeMemoryFromCapsule(capsuleId: string, memoryId: string): Promise<void> {
  const { error } = await supabase.from('capsule_memories').delete().eq('capsule_id', capsuleId).eq('memory_id', memoryId);
  if (error) throw error;
}

export async function addCapsuleMessage(capsuleId: string, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('capsule_messages').insert({ capsule_id: capsuleId, created_by: userId, body: body.trim() });
  if (error) throw error;
}

export async function deleteCapsuleMessage(id: string): Promise<void> {
  const { error } = await supabase.from('capsule_messages').delete().eq('id', id);
  if (error) throw error;
}

export async function sealCapsule(id: string): Promise<void> {
  const { error } = await supabase.rpc('seal_capsule', { p_id: id });
  if (error) throw error;
}

export async function openCapsule(id: string): Promise<void> {
  const { error } = await supabase.rpc('open_capsule', { p_id: id });
  if (error) throw error;
}
