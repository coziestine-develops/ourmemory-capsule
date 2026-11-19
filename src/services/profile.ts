import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

export const AVATAR_BUCKET = 'relationship-avatars';
export const AVATAR_ACCEPTED = ['image/jpeg', 'image/png'];
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const AVATAR_SIZE = 512;
const SIGNED_URL_SECONDS = 3600;

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_path, birthday')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function getAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** Center-crops to a square and downsizes so avatars stay small and fast. */
async function prepareAvatar(file: File): Promise<{ blob: Blob; ext: 'png' | 'jpg' }> {
  if (!AVATAR_ACCEPTED.includes(file.type)) {
    throw new Error('Please choose a JPG or PNG photo.');
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error('That photo is too large. Please choose one under 15 MB.');
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn't read that photo. Try a different one.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const target = Math.min(AVATAR_SIZE, side);

  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Your browser couldn't process the photo.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  // Keep the original format: PNG stays PNG (so transparency survives), anything else becomes JPG.
  if (file.type === 'image/png') {
    const png = await toBlob('image/png', 1);
    if (!png) throw new Error("Your browser couldn't process the photo.");
    return { blob: png, ext: 'png' };
  }
  const jpg = await toBlob('image/jpeg', 0.9);
  if (!jpg) throw new Error("Your browser couldn't process the photo.");
  return { blob: jpg, ext: 'jpg' };
}

export async function uploadAvatar(userId: string, file: File, previousPath: string | null): Promise<string> {
  const { blob, ext } = await prepareAvatar(file);
  // Unique name per upload so cached signed URLs never show a stale photo.
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (updateError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw updateError;
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
  }
  return path;
}

export async function removeAvatar(userId: string, currentPath: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;
  if (currentPath) await supabase.storage.from(AVATAR_BUCKET).remove([currentPath]);
}
