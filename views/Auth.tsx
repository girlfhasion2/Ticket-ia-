import React, { useState } from 'react';
import { useAuth } from '../src/contexts/AuthContext';
import { Receipt, Mail, Lock, LogIn, UserPlus, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

const Auth: React.FC = () => {
  const { signIn, signUp, isConfigured } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError('Introduce tu email y contraseña.');
      return;
    }

    if (mode === 'register' && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(
            signInError.message === 'Invalid login credentials'
              ? 'Email o contraseña incorrectos.'
              : signInError.message
          );
        }
      } else {
        const { error: signUpError, needsEmailConfirmation } = await signUp(
          email,
          password
        );
        if (signUpError) {
          setError(signUpError.message);
        } else if (needsEmailConfirmation) {
          setNotice(
            'Cuenta creada. Revisa tu bandeja de entrada para confirmar tu correo antes de iniciar sesión.'
          );
          setMode('login');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Ha ocurrido un error inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Receipt size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              TicketSplit AI
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'login'
                ? 'Inicia sesión para acceder a tus tickets en la nube'
                : 'Crea una cuenta para guardar y repartir tus tickets'}
            </p>
          </div>
        </div>

        {!isConfigured && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs leading-relaxed">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              Configura <code className="font-bold">VITE_SUPABASE_URL</code> y{' '}
              <code className="font-bold">VITE_SUPABASE_ANON_KEY</code> en{' '}
              <span className="font-bold">Settings &gt; Secrets</span> para conectar con
              tu proyecto Supabase.
            </span>
          </div>
        )}

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-gray-900 border border-gray-200 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            {notice && (
              <div className="p-3.5 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-2.5 text-green-800 text-xs font-medium leading-relaxed">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isConfigured}
              className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active-scale disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Procesando...
                </>
              ) : mode === 'login' ? (
                <>
                  <LogIn size={18} />
                  Iniciar sesión
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Crear cuenta
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {mode === 'login'
                ? '¿No tienes cuenta? Regístrate'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
