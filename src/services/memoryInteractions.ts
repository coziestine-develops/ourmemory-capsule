import { supabase } from '../lib/supabase';
import type { MemoryComment, MemoryReaction, ReactionKey } from '../types';

export async function listMemoryReactions(memoryId: string): Promise<MemoryReaction[]> {
  const { data, error } = await supabase
    .from('memory_reactions')
    .select('memory_id, user_id, reaction, created_at')
    .eq('memory_id', memoryId);
  if (error) throw error;
  return (data ?? []) as MemoryReaction[];
}

export async function setMemoryReaction(memoryId: string, userId: string, reaction: ReactionKey, on: boolean): Promise<void> {
  if (on) {
    // Reacting twice with the same type is a no-op rather than an error.
    const { error } = await supabase
      .from('memory_reactions')
      .upsert(
        { memory_id: memoryId, user_id: userId, reaction },
        { onConflict: 'memory_id,user_id,reaction', ignoreDuplicates: true },
      );
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('memory_reactions')
    .delete()
    .eq('memory_id', memoryId)
    .eq('user_id', userId)
    .eq('reaction', reaction);
  if (error) throw error;
}

export async function listMemoryComments(memoryId: string): Promise<MemoryComment[]> {
  const { data, error } = await supabase
    .from('memory_comments')
    .select('*, author:profiles(display_name)')
    .eq('memory_id', memoryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MemoryComment[];
}

export async function addMemoryComment(memoryId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('memory_comments')
    .insert({ memory_id: memoryId, author_id: authorId, body: body.trim() });
  if (error) throw error;
}

export async function deleteMemoryComment(id: string): Promise<void> {
  const { error } = await supabase.from('memory_comments').delete().eq('id', id);
  if (error) throw error;
}
