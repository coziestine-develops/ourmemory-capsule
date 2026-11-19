import { supabase, MEDIA_BUCKET } from '../lib/supabase';
import { getMediaType, resolveMime } from '../schemas/memory';
import type { MemoryFormValues } from '../schemas/memory';
import type { Memory } from '../types';

export const PAGE_SIZE = 24;
const SIGNED_URL_SECONDS = 3600;

export const MEMORY_SELECT =
  '*, memory_media(id, memory_id, storage_path, media_type, original_filename, file_size, mime_type, display_order, is_cover)';

export interface MemoryQuery {
  relationshipId: string;
  page: number;
  sort: 'newest' | 'oldest';
  search?: string;
  category?: string;
  favoritesOnly?: boolean;
}

export async function listMemories(query: MemoryQuery): Promise<Memory[]> {
  const ascending = query.sort === 'oldest';
  let request = supabase
    .from('memories')
    .select(MEMORY_SELECT)
    .eq('relationship_id', query.relationshipId)
    .order('memory_date', { ascending })
    .order('created_at', { ascending })
    .range(query.page * PAGE_SIZE, (query.page + 1) * PAGE_SIZE - 1);

  if (query.search) {
    // Strip characters that break PostgREST's filter syntax or act as ILIKE wildcards.
    const term = query.search.replace(/[%_,()\\*"]/g, ' ').trim();
    if (term) {
      request = request.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
  }
  if (query.category) request = request.eq('category', query.category);
  if (query.favoritesOnly) request = request.eq('is_favorite', true);

  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as unknown as Memory[];
}

export async function getMemory(id: string): Promise<Memory> {
  const { data, error } = await supabase.from('memories').select(MEMORY_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as unknown as Memory;
}

function toRow(values: MemoryFormValues) {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    memory_date: values.memory_date,
    memory_time: values.memory_time || null,
    location: values.location?.trim() || null,
    category: values.category,
    mood: values.mood?.trim() || null,
    is_favorite: values.is_favorite,
  };
}

export interface FailedUpload {
  name: string;
  reason: string;
}

/** Turns a Supabase or browser error into a short sentence the person can act on. */
export function describeUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '');
  if (/row-level security|violates row-level|new row/i.test(message)) {
    return 'your account is not allowed to upload to this space. Sign out and back in, and check the storage policies in Supabase.';
  }
  if (/mime|not supported|invalid_mime_type/i.test(message)) return 'this file type is not allowed by the storage settings.';
  if (/maximum allowed size|too large|payload/i.test(message)) return 'the file is larger than the storage limit.';
  if (/bucket not found/i.test(message)) return 'the storage bucket "relationship-media" does not exist. Run the setup SQL.';
  if (/fetch|network|failed to/i.test(message)) return 'a network problem interrupted the upload. Check your connection and try again.';
  return message || 'unknown error';
}

/** Unique file name. Falls back when crypto.randomUUID is unavailable (older browsers, plain HTTP). */
function newFileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UploadInput {
  memoryId: string;
  relationshipId: string;
  userId: string;
  files: { file: File; isCover: boolean }[];
  /** Where numbering starts, so new files go after photos that are already there. */
  startOrder?: number;
  onFileStatus?: (index: number, status: 'uploading' | 'done' | 'failed') => void;
}

export interface CreateMemoryInput {
  relationshipId: string;
  userId: string;
  values: MemoryFormValues;
  files: { file: File; isCover: boolean }[];
  onFileStatus?: (index: number, status: 'uploading' | 'done' | 'failed') => void;
}

export interface CreateMemoryResult {
  memoryId: string;
  failed: FailedUpload[];
}

/**
 * Uploads files to private storage and records each one. Returns the files that failed,
 * with a reason, rather than dropping them silently.
 */
export async function uploadMemoryFiles(input: UploadInput): Promise<FailedUpload[]> {
  const failed: FailedUpload[] = [];
  const startOrder = input.startOrder ?? 0;

  if (input.files.some((f) => f.isCover)) {
    // Only one cover per memory: clear the old one before the new one is recorded.
    await supabase.from('memory_media').update({ is_cover: false }).eq('memory_id', input.memoryId).eq('is_cover', true);
  }

  for (const [index, item] of input.files.entries()) {
    input.onFileStatus?.(index, 'uploading');
    const mediaType = getMediaType(item.file);
    const ext = (item.file.name.split('.').pop() ?? 'bin').toLowerCase();
    const storagePath = `${input.relationshipId}/memories/${input.memoryId}/${newFileId()}.${ext}`;

    try {
      if (!mediaType) throw new Error('Unsupported file type');

      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, item.file, { contentType: resolveMime(item.file), upsert: false });
      if (uploadError) throw uploadError;

      const { error: rowError } = await supabase.from('memory_media').insert({
        memory_id: input.memoryId,
        relationship_id: input.relationshipId,
        uploaded_by: input.userId,
        storage_path: storagePath,
        media_type: mediaType,
        original_filename: item.file.name,
        file_size: item.file.size,
        mime_type: resolveMime(item.file),
        display_order: startOrder + index,
        is_cover: item.isCover,
      });
      if (rowError) {
        await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
        throw rowError;
      }
      input.onFileStatus?.(index, 'done');
    } catch (err) {
      console.error('Upload failed for', item.file.name, err);
      failed.push({ name: item.file.name, reason: describeUploadError(err) });
      input.onFileStatus?.(index, 'failed');
    }
  }

  return failed;
}

/**
 * Saves the memory row first, then uploads each file. Failed uploads are reported back rather than silently dropped.
 */
export async function createMemory(input: CreateMemoryInput): Promise<CreateMemoryResult> {
  const { data, error } = await supabase
    .from('memories')
    .insert({ ...toRow(input.values), relationship_id: input.relationshipId, created_by: input.userId })
    .select('id')
    .single();
  if (error) throw error;

  const memoryId = (data as { id: string }).id;
  const failed = await uploadMemoryFiles({
    memoryId,
    relationshipId: input.relationshipId,
    userId: input.userId,
    files: input.files,
    onFileStatus: input.onFileStatus,
  });
  return { memoryId, failed };
}

/** Adds photos or videos to a memory that already exists. */
export async function addMemoryFiles(
  memoryId: string,
  relationshipId: string,
  userId: string,
  files: { file: File; isCover: boolean }[],
  existingCount: number,
  onFileStatus?: (index: number, status: 'uploading' | 'done' | 'failed') => void,
): Promise<FailedUpload[]> {
  return uploadMemoryFiles({ memoryId, relationshipId, userId, files, startOrder: existingCount, onFileStatus });
}

export async function updateMemory(id: string, values: MemoryFormValues): Promise<void> {
  const { error } = await supabase.from('memories').update(toRow(values)).eq('id', id);
  if (error) throw error;
}

export async function setFavorite(id: string, value: boolean): Promise<void> {
  const { error } = await supabase.from('memories').update({ is_favorite: value }).eq('id', id);
  if (error) throw error;
}

export async function deleteMemory(memory: Memory): Promise<void> {
  const paths = (memory.memory_media ?? []).map((media) => media.storage_path);
  const { error } = await supabase.from('memories').delete().eq('id', memory.id);
  if (error) throw error;

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    if (storageError) {
      throw new Error('The memory was deleted, but some photos could not be removed from storage.');
    }
  }
}

interface UrlWaiter {
  resolve: (url: string) => void;
  reject: (reason: unknown) => void;
}

const SIGN_BATCH_DELAY_MS = 20;
const SIGN_BATCH_SIZE = 100;
const pendingSigns = new Map<string, UrlWaiter[]>();
let signTimer: ReturnType<typeof setTimeout> | null = null;

/** Signs one file on its own. Used when a batch request fails, so one bad file can't block the rest. */
async function signOne(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    console.error('Could not sign', path, error);
    throw new Error(error.message || 'This file could not be loaded.');
  }
  if (!data?.signedUrl) throw new Error('This file could not be loaded.');
  return data.signedUrl;
}

async function signBatch(batch: Map<string, UrlWaiter[]>): Promise<void> {
  const paths = [...batch.keys()];
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    const byPath = new Map((data ?? []).map((entry) => [entry.path, entry]));
    for (const [path, waiters] of batch) {
      const entry = byPath.get(path);
      const signedUrl = entry?.signedUrl;
      if (signedUrl) {
        waiters.forEach((w) => w.resolve(signedUrl));
      } else {
        // The batch answered without a link for this file. Try it alone before giving up.
        try {
          const url = await signOne(path);
          waiters.forEach((w) => w.resolve(url));
        } catch (err) {
          waiters.forEach((w) => w.reject(err));
        }
      }
    }
  } catch (batchError) {
    console.error('Batch signing failed, retrying each photo', batchError);
    for (const [path, waiters] of batch) {
      try {
        const url = await signOne(path);
        waiters.forEach((w) => w.resolve(url));
      } catch (err) {
        waiters.forEach((w) => w.reject(err));
      }
    }
  }
}

function flushSigns(): void {
  signTimer = null;
  const entries = [...pendingSigns.entries()];
  pendingSigns.clear();
  for (let i = 0; i < entries.length; i += SIGN_BATCH_SIZE) {
    void signBatch(new Map(entries.slice(i, i + SIGN_BATCH_SIZE)));
  }
}

/**
 * Signed links requested in the same moment (a whole grid of photos) are sent to storage as one
 * request instead of one per photo, which keeps big pages quick and the network quiet.
 */
export function getSignedUrl(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const waiters = pendingSigns.get(path) ?? [];
    waiters.push({ resolve, reject });
    pendingSigns.set(path, waiters);
    if (signTimer === null) signTimer = setTimeout(flushSigns, SIGN_BATCH_DELAY_MS);
  });
}

export interface DashboardData {
  memoryCount: number;
  photoCount: number;
  recent: Memory[];
  featured: Memory | null;
}

export async function getDashboardData(relationshipId: string): Promise<DashboardData> {
  const [memories, photos, recent] = await Promise.all([
    supabase.from('memories').select('id', { count: 'exact', head: true }).eq('relationship_id', relationshipId),
    supabase.from('memory_media').select('id', { count: 'exact', head: true }).eq('relationship_id', relationshipId),
    supabase
      .from('memories')
      .select(MEMORY_SELECT)
      .eq('relationship_id', relationshipId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  if (memories.error) throw memories.error;
  if (photos.error) throw photos.error;
  if (recent.error) throw recent.error;

  const total = memories.count ?? 0;
  let featured: Memory | null = null;

  if (total > 0) {
    // One memory per day: rotate through the collection using today's date.
    const now = new Date();
    const dayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const offset = dayKey % total;
    const { data, error } = await supabase
      .from('memories')
      .select(MEMORY_SELECT)
      .eq('relationship_id', relationshipId)
      .order('id')
      .range(offset, offset);
    if (error) throw error;
    featured = ((data ?? [])[0] as unknown as Memory) ?? null;
  }

  return {
    memoryCount: total,
    photoCount: photos.count ?? 0,
    recent: (recent.data ?? []) as unknown as Memory[],
    featured,
  };
}

export async function listOnThisDay(relationshipId: string): Promise<Memory[]> {
  const { data, error } = await supabase.rpc('on_this_day', { p_relationship_id: relationshipId });
  if (error) throw error;
  return (data ?? []) as Memory[];
}

export async function listMemoryPicker(relationshipId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select(MEMORY_SELECT)
    .eq('relationship_id', relationshipId)
    .order('memory_date', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as Memory[];
}
/**
 * Loads every memory in the space, in chronological order, for a full export.
 * Pages through the table so large spaces are not cut off at the default page size.
 */
export async function listAllMemoriesForExport(relationshipId: string): Promise<Memory[]> {
  const pageSize = 500;
  const all: Memory[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('memories')
      .select(MEMORY_SELECT)
      .eq('relationship_id', relationshipId)
      .order('memory_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Memory[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
