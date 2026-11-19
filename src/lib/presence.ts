import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Online status and typing indicators.
 *
 * One realtime channel per shared space. "Online" comes from Supabase Presence (everyone who has the app
 * open is tracked under their user id); "typing" travels as a lightweight broadcast event. Nothing here is
 * written to the database.
 */

export interface PresenceState {
  online: ReadonlySet<string>;
  typing: ReadonlySet<string>;
}

const TYPING_TTL_MS = 5000;

let state: PresenceState = { online: new Set(), typing: new Set() };
const listeners = new Set<() => void>();
const typingTimers = new Map<string, number>();
let activeChannel: RealtimeChannel | null = null;
let joined = false;
let selfId: string | null = null;

function update(next: Partial<PresenceState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribePresence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPresenceSnapshot(): PresenceState {
  return state;
}

function setTyping(userId: string, typing: boolean) {
  const existing = typingTimers.get(userId);
  if (existing !== undefined) window.clearTimeout(existing);
  typingTimers.delete(userId);

  const next = new Set(state.typing);
  if (typing) {
    next.add(userId);
    // If the "stopped typing" event is lost, the indicator still clears itself.
    typingTimers.set(userId, window.setTimeout(() => setTyping(userId, false), TYPING_TTL_MS));
  } else {
    next.delete(userId);
  }
  update({ typing: next });
}

function createChannel(relationshipId: string, userId: string): RealtimeChannel | null {
  try {
    const channel = supabase.channel(`presence:${relationshipId}`, { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        const online = new Set(Object.keys(channel.presenceState()));
        // Someone who went offline cannot still be typing.
        const typing = new Set([...state.typing].filter((id) => online.has(id)));
        update({ online, typing });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const data = payload as { user_id?: string; typing?: boolean } | undefined;
        if (!data?.user_id || data.user_id === userId) return;
        setTyping(data.user_id, !!data.typing);
      })
      .subscribe((status) => {
        if (String(status) === 'SUBSCRIBED') {
          joined = true;
          void channel.track({ online_at: new Date().toISOString() });
        }
      });
    return channel;
  } catch (error) {
    console.error('Presence could not start:', error);
    return null;
  }
}

/** Joins the space's presence channel. Returns a function that leaves it. Never throws. */
export function startPresence(relationshipId: string, userId: string): () => void {
  const channel = createChannel(relationshipId, userId);
  if (!channel) return () => {};

  activeChannel = channel;
  selfId = userId;

  return () => {
    typingTimers.forEach((timer) => window.clearTimeout(timer));
    typingTimers.clear();
    joined = false;
    activeChannel = null;
    selfId = null;
    state = { online: new Set(), typing: new Set() };
    listeners.forEach((listener) => listener());
    void supabase.removeChannel(channel);
  };
}

/** Tells the other person that I started or stopped typing. */
export function sendTyping(typing: boolean): void {
  if (!activeChannel || !joined || !selfId) return;
  try {
    void activeChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: selfId, typing } });
  } catch {
    // Typing indicators are best effort.
  }
}
