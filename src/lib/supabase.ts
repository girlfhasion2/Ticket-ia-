/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL?.trim() || '').replace(/\/+$/, '');
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

export let isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export let supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

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
