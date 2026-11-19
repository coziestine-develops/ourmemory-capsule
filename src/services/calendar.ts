import { supabase } from '../lib/supabase';
import { MEMORY_SELECT } from './memories';
import type { EventType, ImportantDate, Memory } from '../types';

export async function listMemoriesBetween(relationshipId: string, fromIso: string, toIso: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select(MEMORY_SELECT)
    .eq('relationship_id', relationshipId)
    .gte('memory_date', fromIso)
    .lte('memory_date', toIso)
    .order('memory_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Memory[];
}

export async function listTimelineMemories(relationshipId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select(MEMORY_SELECT)
    .eq('relationship_id', relationshipId)
    .order('memory_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as Memory[];
}

export async function listImportantDates(relationshipId: string): Promise<ImportantDate[]> {
  const { data, error } = await supabase
    .from('important_dates')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ImportantDate[];
}

export async function createImportantDate(
  relationshipId: string,
  userId: string,
  values: { title: string; event_date: string; event_type: EventType; is_recurring: boolean; notes: string },
): Promise<void> {
  const { error } = await supabase.from('important_dates').insert({
    relationship_id: relationshipId,
    created_by: userId,
    title: values.title.trim(),
    event_date: values.event_date,
    event_type: values.event_type,
    is_recurring: values.is_recurring,
    notes: values.notes.trim() || null,
  });
  if (error) throw error;
}

export async function deleteImportantDate(id: string): Promise<void> {
  const { error } = await supabase.from('important_dates').delete().eq('id', id);
  if (error) throw error;
}
