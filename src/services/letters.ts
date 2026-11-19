import { supabase } from '../lib/supabase';
import type { Letter } from '../types';

export interface LetterValues {
  title: string;
  recipient: string;
  content: string;
  category: string;
  open_at: string | null;
}

export async function listLetters(relationshipId: string): Promise<Letter[]> {
  const { data, error } = await supabase
    .from('letters')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Letter[];
}

export async function getLetter(id: string): Promise<Letter> {
  const { data, error } = await supabase.from('letters').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Letter;
}

export async function createLetter(relationshipId: string, userId: string, values: LetterValues): Promise<string> {
  const { data, error } = await supabase
    .from('letters')
    .insert({
      relationship_id: relationshipId,
      created_by: userId,
      title: values.title.trim(),
      recipient: values.recipient.trim() || null,
      content: values.content,
      category: values.category,
      open_at: values.open_at,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateLetter(id: string, values: LetterValues): Promise<void> {
  const { error } = await supabase
    .from('letters')
    .update({
      title: values.title.trim(),
      recipient: values.recipient.trim() || null,
      content: values.content,
      category: values.category,
      open_at: values.open_at,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLetter(id: string): Promise<void> {
  const { error } = await supabase.from('letters').delete().eq('id', id);
  if (error) throw error;
}
