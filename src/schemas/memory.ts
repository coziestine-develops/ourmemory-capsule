import { z } from 'zod';
import { MEMORY_CATEGORIES, type MediaType } from '../types';

export const memorySchema = z.object({
  title: z.string().trim().min(1, 'Give this memory a title.').max(120, 'Keep the title under 120 characters.'),
  description: z.string().max(5000, 'Keep the story under 5,000 characters.').optional(),
  memory_date: z.string().min(1, 'Choose the date of this memory.'),
  memory_time: z.string().optional(),
  location: z.string().max(120).optional(),
  category: z.enum(MEMORY_CATEGORIES),
  mood: z.string().max(40).optional(),
  is_favorite: z.boolean(),
});

export type MemoryFormValues = z.infer<typeof memorySchema>;

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * MB;
export const MAX_VIDEO_BYTES = 500 * MB;
export const ACCEPTED_FILE_TYPES =
  'image/jpeg,image/png,video/mp4,video/quicktime,.jpg,.jpeg,.png,.mp4,.mov';

export function getMediaType(file: File): MediaType | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png') return 'image';
  if (!file.type && /\.(jpe?g|png)$/i.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name)) return 'video';
  return null;
}

export function resolveMime(file: File): string {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function validateFile(file: File): string | null {
  const type = getMediaType(file);
  if (!type) return `${file.name} isn't supported. Please use JPG or PNG photos, or MP4 or MOV videos.`;
  const max = type === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > max) return `${file.name} is larger than ${max / MB} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
