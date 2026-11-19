export type MediaType = 'image' | 'video';

export interface Relationship {
  id: string;
  name: string;
  cover_path: string | null;
  start_date: string | null;
  created_by: string;
  created_at: string;
}

export interface MemoryMedia {
  id: string;
  memory_id: string;
  storage_path: string;
  media_type: MediaType;
  original_filename: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  is_cover: boolean;
}

export interface Memory {
  id: string;
  relationship_id: string;
  created_by: string;
  title: string;
  description: string | null;
  memory_date: string;
  memory_time: string | null;
  location: string | null;
  category: string;
  mood: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  memory_media?: MemoryMedia[];
}

export const MEMORY_CATEGORIES = [
  'Our Firsts',
  'Dates',
  'Adventures',
  'Travel',
  'Celebrations',
  'Everyday Moments',
  'Gifts',
  'Special Occasions',
  'Random Moments',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_path: string | null;
  birthday: string | null;
}

/** A pending request to add someone as a lover, seen from the caller's side. */
export interface LoverRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  other_id: string;
  other_name: string;
  other_username: string | null;
  created_at: string;
}

export interface Album {
  id: string;
  relationship_id: string;
  created_by: string;
  name: string;
  description: string | null;
  cover_memory_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Letter {
  id: string;
  relationship_id: string;
  created_by: string;
  title: string;
  recipient: string | null;
  content: string;
  category: string;
  open_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Capsule {
  id: string;
  relationship_id: string;
  created_by: string;
  title: string;
  description: string | null;
  open_at: string;
  sealed_at: string | null;
  opened_at: string | null;
  created_at: string;
}

export interface CapsuleMessage {
  id: string;
  capsule_id: string;
  created_by: string;
  body: string;
  created_at: string;
}

export type EventType = 'anniversary' | 'birthday' | 'milestone' | 'custom';

export interface ImportantDate {
  id: string;
  relationship_id: string;
  created_by: string;
  title: string;
  event_date: string;
  event_type: EventType;
  is_recurring: boolean;
  notes: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  relationship_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Set by the server when the recipient's app receives the message. */
  delivered_at: string | null;
  /** Set by the server when the recipient opens the chat (Seen). */
  read_at: string | null;
  deleted_at: string | null;
  /** Client-only: true while the message is still being sent. */
  pending?: boolean;
}

export interface AppNotification {
  id: string;
  user_id: string;
  relationship_id: string;
  title: string;
  message: string | null;
  type: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const LETTER_CATEGORIES = [
  'Love Letters',
  'Open When...',
  'Birthday Letters',
  'Anniversary Letters',
  'Random Notes',
  'Future Letters',
] as const;

export const LETTER_TEMPLATES = [
  { title: 'Open when you miss me', category: 'Open When...' },
  { title: "Open when you're sad", category: 'Open When...' },
  { title: 'Open when you need encouragement', category: 'Open When...' },
  { title: 'Open on our anniversary', category: 'Anniversary Letters' },
  { title: 'Open when you want to remember us', category: 'Open When...' },
] as const;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  anniversary: 'Anniversary',
  birthday: 'Birthday',
  milestone: 'Milestone',
  custom: 'Special date',
};

export const BUCKET_CATEGORIES = ['Dream', 'Travel', 'Experience', 'Food', 'Home', 'Goal'] as const;
export type BucketCategory = (typeof BUCKET_CATEGORIES)[number];

export interface BucketItem {
  id: string;
  relationship_id: string;
  created_by: string;
  title: string;
  notes: string | null;
  category: string;
  completed_at: string | null;
  completed_by: string | null;
  completed_memory_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Keys are what the database stores; emoji and labels are for display only. */
export const REACTIONS = [
  { key: 'love', emoji: '💕', label: 'Love' },
  { key: 'laugh', emoji: '🥰', label: 'Adore' },
  { key: 'touched', emoji: '🌹', label: 'Cherished' },
  { key: 'fire', emoji: '💋', label: 'Kiss' },
  { key: 'sparkle', emoji: '💖', label: 'Sweetheart' },
  { key: 'heart_eyes', emoji: '💘', label: 'Smitten' },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export interface MemoryReaction {
  memory_id: string;
  user_id: string;
  reaction: ReactionKey;
  created_at?: string;
}

export interface MemoryComment {
  id: string;
  memory_id: string;
  relationship_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { display_name: string } | null;
}
