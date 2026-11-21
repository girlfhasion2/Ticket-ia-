import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, AuthError } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  ensureSupabaseConfigured,
} from '../lib/supabase';

interface AuthResult {
  error: AuthError | Error | null;
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      const configured = await ensureSupabaseConfigured();
      if (!isMounted) return;
      setIsConfigured(configured);

      if (!configured) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (isMounted) {
          setUser(session?.user ?? null);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (isMounted) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      });

      unsubscribe = () => subscription.unsubscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const configured = isConfigured || (await ensureSupabaseConfigured());
    if (!configured) {
      return {
        error: new Error(
          'Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
        ),
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    return { error };
  };

  const signUp = async (email: string, password: string): Promise<AuthResult> => {
    const configured = isConfigured || (await ensureSupabaseConfigured());
    if (!configured) {
      return {
        error: new Error(
          'Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
        ),
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    const needsEmailConfirmation = Boolean(!error && data.user && !data.session);
    return { error, needsEmailConfirmation };
  };

  const signOut = async (): Promise<void> => {
    if (!isConfigured) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isConfigured, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return ctx;
};
