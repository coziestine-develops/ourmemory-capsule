import { supabase } from '../lib/supabase';
import type { Message } from '../types';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 60;

/** Newest `limit` messages, returned oldest first so they render top to bottom. */
export async function listMessages(relationshipId: string, limit: number): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Message[]).slice().reverse();
}

/** Finds messages whose text contains the search term. Newest first. */
export async function searchMessages(relationshipId: string, term: string, limit = 30): Promise<Message[]> {
  // Strip characters that break PostgREST filters or act as ILIKE wildcards.
  const clean = term.replace(/[%_,()\\*"]/g, ' ').trim();
  if (!clean) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('relationship_id', relationshipId)
    .is('deleted_at', null)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(relationshipId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ relationship_id: relationshipId, sender_id: senderId, body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

/** The database stamps read_at itself; the value sent here is ignored. */
export async function markMessagesRead(relationshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('relationship_id', relationshipId)
    .neq('sender_id', userId)
    .is('read_at', null)
    // Unsent messages are locked by the database; including them would fail the whole update.
    .is('deleted_at', null);
  if (error) throw error;
}

/** Tells the sender their message reached this device ("Delivered"). The database stamps the time. */
export async function markMessagesDelivered(relationshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('relationship_id', relationshipId)
    .neq('sender_id', userId)
    .is('delivered_at', null)
    .is('deleted_at', null);
  if (error) throw error;
}

/** Messenger-style "Delete chat": hides the conversation for me only. The other person keeps their copy. */
export async function clearConversation(relationshipId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_conversation', { p_relationship_id: relationshipId });
  if (error) throw error;
}

export async function unsendMessage(id: string): Promise<void> {
  const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function countUnreadMessages(relationshipId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('relationship_id', relationshipId)
    .neq('sender_id', userId)
    .is('read_at', null)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Calls onChange whenever a message in this space is inserted or updated (including Delivered and Seen). Returns an unsubscribe function. */
export function subscribeToMessages(relationshipId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`messages:${relationshipId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `relationship_id=eq.${relationshipId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
