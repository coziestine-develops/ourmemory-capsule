import { supabase } from '../lib/supabase';
import type { BucketItem } from '../types';

export interface BucketValues {
  title: string;
  notes: string | null;
  category: string;
}

export async function listBucketItems(relationshipId: string): Promise<BucketItem[]> {
  const { data, error } = await supabase
    .from('bucket_items')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BucketItem[];
}

export async function createBucketItem(relationshipId: string, userId: string, values: BucketValues): Promise<void> {
  const { error } = await supabase.from('bucket_items').insert({
    relationship_id: relationshipId,
    created_by: userId,
    title: values.title.trim(),
    notes: values.notes?.trim() || null,
    category: values.category,
  });
  if (error) throw error;
}

export async function updateBucketItem(id: string, values: Partial<BucketValues>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (values.title !== undefined) patch.title = values.title.trim();
  if (values.notes !== undefined) patch.notes = values.notes?.trim() || null;
  if (values.category !== undefined) patch.category = values.category;
  const { error } = await supabase.from('bucket_items').update(patch).eq('id', id);
  if (error) throw error;
}

/** The database sets completed_at and completed_by itself; the timestamp sent here only signals the change. */
export async function setBucketItemDone(id: string, done: boolean, memoryId: string | null = null): Promise<void> {
  const { error } = await supabase
    .from('bucket_items')
    .update({
      completed_at: done ? new Date().toISOString() : null,
      completed_memory_id: done ? memoryId : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBucketItem(id: string): Promise<void> {
  const { error } = await supabase.from('bucket_items').delete().eq('id', id);
  if (error) throw error;
}
