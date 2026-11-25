
import React, { useEffect, useState } from 'react';
import { db } from '../db';
import { 
  Download, Upload, Trash2, ShieldCheck, 
  LogOut, Mail,
  Sun, Moon, Monitor, Palette, Users, Pencil, Check, X, Ban
} from 'lucide-react';
import { friendsService, MyProfile, BlockedUser } from '../friendsService';
import { useAuth } from '../src/contexts/AuthContext';
import { ThemeMode, getStoredTheme, setTheme } from '../utils/theme';

const Settings: React.FC = () => {
  const { user, signOut } = useAuth();
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  const loadBlocked = () =>
    friendsService
      .listBlocked()
      .then((b) => {
        setBlocked(b);
        setBlockedError(null);
      })
      .catch((e: any) => setBlockedError(e?.message || 'No se pudo cargar la lista.'));

  useEffect(() => {
    loadBlocked();
  }, []);

  const unblock = async (b: BlockedUser) => {
    if (!window.confirm(`¿Desbloquear a ${b.displayName}? No volveréis a ser amigos automáticamente.`)) return;
    try {
      await friendsService.unblockUser(b.userId);
      await loadBlocked();
    } catch (e: any) {
      setBlockedError(e?.message || 'No se pudo desbloquear.');
    }
  };

  useEffect(() => {
    let active = true;
    friendsService
      .getMyProfile()
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e: any) => {
        if (active) setProfileError(e?.message || 'No se pudo cargar tu perfil.');
      });
    return () => {
      active = false;
    };
  }, []);

  const saveProfile = async (patch: { displayName?: string; discoverableByEmail?: boolean }) => {
    setProfileBusy(true);
    try {
      await friendsService.updateMyProfile(patch);
      setProfile(await friendsService.getMyProfile());
      setProfileError(null);
      setEditingName(false);
    } catch (e: any) {
      setProfileError(e?.message || 'No se pudo guardar.');
    } finally {
      setProfileBusy(false);
    }
  };

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  };

  const exportData = async () => {
    const allTickets = await db.tickets.toArray();
    const data = JSON.stringify({ tickets: allTickets }, null, 2);
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ticketsplit-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { tickets: importedTickets } = JSON.parse(event.target?.result as string);
        if (window.confirm("Se van a sobreescribir o añadir datos externos. ¿Continuar?")) {
          for (const t of importedTickets || []) await db.tickets.put(t);
          window.alert("Importación completada con éxito.");
          window.location.reload();
        }
      } catch (error) {
        window.alert("Error al importar: formato de archivo inválido.");
      }
    };
    reader.readAsText(file);
  };

  const clearDatabase = async () => {
    if (window.confirm("¿ESTÁS SEGURO? Esto borrará permanentemente todos tus tickets de tu cuenta.")) {
      await db.tickets.clear();
      window.alert("Tickets eliminados.");
      window.location.reload();
    }
  };

  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>
        <p className="text-sm text-gray-500">Controla tus datos y exportaciones</p>
      </header>

      <div className="space-y-4 pb-20">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Mail size={18} className="text-indigo-600" />
              Cuenta en la Nube
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                Sesión iniciada como
              </p>
              <p className="text-sm font-bold text-indigo-950 truncate">
                {user?.email || 'Usuario autenticado'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-red-50 hover:text-red-700 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-bold text-gray-800 group-hover:text-red-700 text-sm">
                  Cerrar sesión
                </p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
                  Desconectar tu cuenta de este dispositivo
                </p>
              </div>
              <LogOut size={22} className="text-gray-400 group-hover:text-red-600" />
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Users size={18} className="text-indigo-600" />
              Perfil para amigos
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {profileError && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                {profileError}
              </p>
            )}
            {profile && (
              <>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Tu nombre de usuario
                  </p>
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && nameDraft.trim()) saveProfile({ displayName: nameDraft });
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        maxLength={40}
                        className="flex-1 min-w-0 h-11 border-2 border-indigo-600 rounded-xl px-3 text-sm font-extrabold text-gray-900 bg-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveProfile({ displayName: nameDraft })}
                        disabled={profileBusy || !nameDraft.trim()}
                        aria-label="Guardar nombre"
                        className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingName(false)}
                        aria-label="Cancelar"
                        className="w-11 h-11 rounded-xl border border-gray-200 bg-white text-gray-500 flex items-center justify-center"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-2xl">
                      <p className="flex-1 min-w-0 truncate text-sm font-black text-gray-900">
                        {profile.displayName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setNameDraft(profile.displayName);
                          setEditingName(true);
                        }}
                        aria-label="Editar nombre"
                        className="w-8 h-8 rounded-full bg-white text-indigo-700 flex items-center justify-center shrink-0 border border-gray-100"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-2">
                    Es el nombre que ven tus amigos
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => saveProfile({ discoverableByEmail: !profile.discoverableByEmail })}
                  disabled={profileBusy}
                  className="w-full flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-2xl text-left"
                >
                  <div>
                    <p className="font-bold text-gray-800 text-sm">Permitir que me encuentren por correo</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
                      Si lo desactivas, solo podrán añadirte con tu código
                    </p>
                  </div>
                  <span
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                      profile.discoverableByEmail ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        profile.discoverableByEmail ? 'translate-x-5' : ''
                      }`}
                    />
                  </span>
                </button>
              </>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Ban size={18} className="text-indigo-600" />
              Usuarios bloqueados
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {blockedError && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                {blockedError}
              </p>
            )}
            {!blockedError && blocked.length === 0 && (
              <p className="text-xs font-semibold text-gray-500">No has bloqueado a nadie.</p>
            )}
            {blocked.map((b) => (
              <div
                key={b.userId}
                className="flex items-center justify-between gap-2 bg-gray-50 rounded-2xl px-3 py-2.5"
              >
                <span className="text-sm font-bold text-gray-800 truncate">{b.displayName}</span>
                <button
                  type="button"
                  onClick={() => unblock(b)}
                  className="shrink-0 min-h-[34px] px-3 rounded-xl border border-gray-200 bg-white text-gray-700 text-[10px] font-black uppercase tracking-wide"
                >
                  Desbloquear
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Palette size={18} className="text-indigo-600" />
              Apariencia
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Apariencia de la aplicación">
              {([
                { mode: 'light', label: 'Claro', Icon: Sun },
                { mode: 'dark', label: 'Oscuro', Icon: Moon },
                { mode: 'system', label: 'Sistema', Icon: Monitor },
              ] as const).map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={themeMode === mode}
                  onClick={() => changeTheme(mode)}
                  className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 font-black text-[11px] uppercase tracking-widest transition-colors active-scale ${
                    themeMode === mode
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                      : 'border-gray-100 bg-gray-50 text-gray-500'
                  }`}
                >
                  <Icon size={22} />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
              {themeMode === 'system' ? 'Sigue la configuración de tu dispositivo' : themeMode === 'dark' ? 'Siempre en modo oscuro' : 'Siempre en modo claro'}
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Download size={18} className="text-indigo-600" />
              Copia de Seguridad
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <button 
              onClick={exportData}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-bold text-gray-800 text-sm">Backup Completo (JSON)</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Descarga todos los datos para restaurar luego</p>
              </div>
              <Download size={24} className="text-gray-400 group-hover:text-gray-600" />
            </button>

            <label className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group cursor-pointer active-scale">
              <div className="text-left">
                <p className="font-bold text-gray-800 text-sm">Importar Backup</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Restaura una copia de seguridad previa</p>
              </div>
              <Upload size={24} className="text-gray-400 group-hover:text-gray-600" />
              <input type="file" accept=".json" onChange={importData} className="hidden" />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-red-600 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Trash2 size={18} />
              Zona Peligrosa
            </h3>
          </div>
          <div className="p-4">
            <button 
              onClick={clearDatabase}
              className="w-full flex items-center justify-between p-4 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-bold text-red-700 text-sm">Borrar todo</p>
                <p className="text-[10px] text-red-500/70 font-bold uppercase tracking-tight">Eliminar todos los datos locales</p>
              </div>
              <Trash2 size={24} className="text-red-300 group-hover:text-red-600" />
            </button>
          </div>
        </section>

        <div className="p-6 bg-indigo-50 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 font-black text-xs uppercase tracking-widest">
            <ShieldCheck size={18} />
            Sincronización Segura
          </div>
          <p className="text-[11px] text-indigo-600/80 font-bold leading-relaxed">
            Tus tickets se guardan asociados a tu cuenta en Supabase.
          </p>
        </div>
      </div>

    </div>
  );
};

export default Settings;
