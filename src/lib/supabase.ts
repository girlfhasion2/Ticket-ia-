/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL?.trim() || '').replace(/\/+$/, '');
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

export let isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let recoveryDetected =
  typeof window !== 'undefined' &&
  (window.location.hash.includes('type=recovery') ||
    window.location.hash.includes('access_token'));

export function wasRecoveryDetected(): boolean {
  return recoveryDetected;
}

export function clearRecoveryDetected(): void {
  recoveryDetected = false;
}

function attachRecoveryListener(client: SupabaseClient): void {
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryDetected = true;
    }
  });
}

export let supabase: SupabaseClient = isSupabaseConfigured
  ? (() => {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      attachRecoveryListener(client);
      return client;
    })()
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key', {
      auth: {
        detectSessionInUrl: false,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

let configPromise: Promise<boolean> | null = null;

export async function ensureSupabaseConfigured(): Promise<boolean> {
  if (isSupabaseConfigured) return true;

  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch('/api/public-config');
        if (!res.ok) return false;
        const data = (await res.json()) as {
          supabaseUrl?: string;
          supabaseAnonKey?: string;
        };
        const url = (data.supabaseUrl?.trim() || '').replace(/\/+$/, '');
        const key = data.supabaseAnonKey?.trim() || '';
        if (url && key) {
          supabaseUrl = url;
          supabaseAnonKey = key;
          supabase = createClient(supabaseUrl, supabaseAnonKey);
          attachRecoveryListener(supabase);
          isSupabaseConfigured = true;
          return true;
        }
      } catch {
        // Ignore network errors and leave unconfigured
      }
      return false;
    })();
  }

  return configPromise;
}

export const supabaseReady: Promise<SupabaseClient> = ensureSupabaseConfigured().then(
  (configured) => {
    if (!configured) {
      throw new Error(
        'El cliente de Supabase no está configurado (faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).'
      );
    }
    return supabase;
  }
);
