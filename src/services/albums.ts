import { supabase } from '../lib/supabase';
import { MEMORY_SELECT } from './memories';
import type { Album, Memory } from '../types';

export interface AlbumSummary extends Album {
  count: number;
  cover: Memory | null;
}

export async function listAlbums(relationshipId: string): Promise<AlbumSummary[]> {
  const { data, error } = await supabase
    .from('albums')
    .select('*, album_memories(memory_id)')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as (Album & { album_memories: { memory_id: string }[] })[];
  const coverIds = rows
    .map((row) => row.cover_memory_id ?? row.album_memories[0]?.memory_id)
    .filter((id): id is string => !!id);

  let covers: Memory[] = [];
  if (coverIds.length > 0) {
    const { data: memories, error: coverError } = await supabase
      .from('memories')
      .select(MEMORY_SELECT)
      .in('id', coverIds);
    if (coverError) throw coverError;
    covers = (memories ?? []) as unknown as Memory[];
  }

  return rows.map((row) => {
    const coverId = row.cover_memory_id ?? row.album_memories[0]?.memory_id;
    return {
      ...row,
      count: row.album_memories.length,
      cover: covers.find((m) => m.id === coverId) ?? null,
    };
  });
}

export async function getAlbum(id: string): Promise<Album> {
  const { data, error } = await supabase.from('albums').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Album;
}

export async function listAlbumMemories(albumId: string): Promise<{ display_order: number; memory: Memory }[]> {
  const { data, error } = await supabase
    .from('album_memories')
    .select(`display_order, memory:memories(${MEMORY_SELECT})`)
    .eq('album_id', albumId)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as { display_order: number; memory: Memory }[]).filter((row) => !!row.memory);
}

export async function createAlbum(relationshipId: string, userId: string, name: string, description: string): Promise<string> {
  const { data, error } = await supabase
    .from('albums')
    .insert({ relationship_id: relationshipId, created_by: userId, name, description: description || null })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateAlbum(
  id: string,
  values: { name?: string; description?: string | null; cover_memory_id?: string | null },
): Promise<void> {
  const { error } = await supabase.from('albums').update(values).eq('id', id);
  if (error) throw error;
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase.from('albums').delete().eq('id', id);
  if (error) throw error;
}

export async function addMemoriesToAlbum(albumId: string, memoryIds: string[], startOrder: number): Promise<void> {
  if (memoryIds.length === 0) return;
  const rows = memoryIds.map((memoryId, i) => ({ album_id: albumId, memory_id: memoryId, display_order: startOrder + i }));
  const { error } = await supabase.from('album_memories').insert(rows);
  if (error) throw error;
}

export async function removeMemoryFromAlbum(albumId: string, memoryId: string): Promise<void> {
  const { error } = await supabase.from('album_memories').delete().eq('album_id', albumId).eq('memory_id', memoryId);
  if (error) throw error;
}

export async function swapAlbumOrder(
  albumId: string,
  a: { memoryId: string; order: number },
  b: { memoryId: string; order: number },
): Promise<void> {
  const first = await supabase
    .from('album_memories')
    .update({ display_order: b.order })
    .eq('album_id', albumId)
    .eq('memory_id', a.memoryId);
  if (first.error) throw first.error;
  const second = await supabase
    .from('album_memories')
    .update({ display_order: a.order })
    .eq('album_id', albumId)
    .eq('memory_id', b.memoryId);
  if (second.error) throw second.error;
}
