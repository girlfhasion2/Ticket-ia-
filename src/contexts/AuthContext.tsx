import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, AuthError } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  ensureSupabaseConfigured,
  wasRecoveryDetected,
  clearRecoveryDetected,
} from '../lib/supabase';
import { db } from '../../db';

interface AuthResult {
  error: AuthError | Error | null;
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    return (
      wasRecoveryDetected() ||
      hash.includes('type=recovery') ||
      hash.includes('access_token')
    );
  });

  const clearPasswordRecovery = () => {
    clearRecoveryDetected();
    setIsPasswordRecovery(false);
  };

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

      if (wasRecoveryDetected()) {
        setIsPasswordRecovery(true);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (!isMounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
        setUser(session?.user ?? null);
        setLoading(false);
      });

      unsubscribe = () => subscription.unsubscribe();

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (isMounted) {
          setUser(session?.user ?? null);
          if (wasRecoveryDetected()) {
            setIsPasswordRecovery(true);
          }
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

    if (!error && data.session && data.user) {
      await db.categories.seedDefaults().catch(() => {});
    }

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
      value={{
        user,
        loading,
        isConfigured,
        isPasswordRecovery,
        clearPasswordRecovery,
        signIn,
        signUp,
        signOut,
      }}
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
