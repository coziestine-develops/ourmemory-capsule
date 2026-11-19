import { supabase } from '../lib/supabase';
import type { AppNotification } from '../types';

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (error) throw error;
}

export async function clearNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
}
