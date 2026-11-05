import { createClient, SupabaseClient } from '@supabase/supabase-js';

function sanitizeBaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl = sanitizeBaseUrl(rawSupabaseUrl);
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Validates whether the configured Supabase client can authenticate or reach the database.
 * Returns { ok: boolean, error?: string }
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase credentials are not configured in environment variables.',
    };
  }

  try {
    const { error } = await supabase.from('ingredients').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        error: error.message || 'Failed to query Supabase database.',
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Connection error while contacting Supabase.',
    };
  }
}
