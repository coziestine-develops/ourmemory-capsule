import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Do not throw here: an import-time throw leaves the page blank.
// main.tsx checks this flag and shows a setup screen instead.
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export const MEDIA_BUCKET = 'relationship-media';
