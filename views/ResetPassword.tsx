import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase, supabaseReady } from '../src/lib/supabase';
import {
  KeyRound,
  Lock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface ResetPasswordProps {
  onComplete: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onComplete }) => {
  const { signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const handleGoToLogin = async () => {
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    try {
      await signOut();
    } catch {
      // Ignore sign out errors when returning to login
    }
    window.history.replaceState({}, '', '/');
    onComplete();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await supabaseReady;
      await supabase.auth.getSession();

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      window.history.replaceState({}, '', '/');

      try {
        await signOut();
      } catch {
        // Ignore sign out errors after password update
      }

      redirectTimerRef.current = window.setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <KeyRound size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Nueva contraseña
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Introduce y confirma tu nueva contraseña para acceder a tu cuenta
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
          {success ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3 text-green-800 text-sm font-bold">
                <CheckCircle2 size={20} className="shrink-0 text-green-600" />
                <span>Contraseña actualizada</span>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Redirigiendo al inicio de sesión...
              </p>
              <button
                type="button"
                onClick={handleGoToLogin}
                className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest active-scale transition-colors"
              >
                Ir al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-new-password"
                    className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1"
                  >
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="reset-new-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-gray-50 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-gray-900 border border-gray-200 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-confirm-password"
                    className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1"
                  >
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      id="reset-confirm-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Repite la contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-gray-50 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-gray-900 border border-gray-200 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-xs font-medium leading-relaxed">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active-scale disabled:opacity-50 transition-colors"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <KeyRound size={18} />
                      Actualizar contraseña
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={handleGoToLogin}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
