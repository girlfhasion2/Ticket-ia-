import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
  Copy,
  Share2,
  RefreshCw,
  AlertCircle,
  Inbox,
  Ban,
  UserMinus,
  Smartphone,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  friendsService,
  friendLabel,
  Friend,
  FriendRequest,
  MyProfile,
} from '../friendsService';

type Screen = 'list' | 'detail' | 'add';
type Tab = 'friends' | 'inbox';
type AddMode = 'email' | 'code' | 'contacts';

interface FriendsProps {
  /** Avisa a la app del número de solicitudes recibidas (para el punto de la barra). */
  onPendingCountChange?: (count: number) => void;
}

const shortDate = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM', { locale: es });
  } catch {
    return '';
  }
};

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 42 }) => (
  <div
    className="rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center shrink-0"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
  >
    {(name || '?').charAt(0).toUpperCase()}
  </div>
);

const Friends: React.FC<FriendsProps> = ({ onPendingCountChange }) => {
  const [screen, setScreen] = useState<Screen>('list');
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  // Ficha del amigo
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState('');

  // Añadir amigo
  const [addMode, setAddMode] = useState<AddMode>('email');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [sentNotice, setSentNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  const reload = useCallback(async () => {
    try {
      const [fr, rq, pf] = await Promise.all([
        friendsService.listFriends(),
        friendsService.listRequests(),
        friendsService.getMyProfile(),
      ]);
      setFriends(fr);
      setRequests(rq);
      setProfile(pf);
      setError(null);
      onPendingCountChange?.(rq.filter((r) => r.direction === 'incoming').length);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar tus amigos.');
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const run = async (action: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    try {
      await action();
      if (okMsg) showToast(okMsg);
      await reload();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const selected = friends.find((f) => f.friendId === selectedId) || null;

  const openFriend = (f: Friend) => {
    setSelectedId(f.friendId);
    setEditingAlias(false);
    setScreen('detail');
  };

  const backToList = () => {
    setScreen('list');
    setSelectedId(null);
    setEditingAlias(false);
  };

  const saveAlias = async () => {
    if (!selected) return;
    const value = aliasDraft.trim();
    await run(
      () => friendsService.setAlias(selected.friendId, value),
      value ? 'Apodo guardado' : 'Apodo quitado'
    );
    setEditingAlias(false);
  };

  const removeFriend = async () => {
    if (!selected) return;
    if (!window.confirm(`¿Eliminar a ${friendLabel(selected)} de tus amigos?`)) return;
    await run(() => friendsService.removeFriend(selected.friendId), 'Amistad eliminada');
    backToList();
  };

  const blockFriend = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `¿Bloquear a ${friendLabel(selected)}? Dejaréis de ser amigos y no podrá enviarte solicitudes.`
      )
    )
      return;
    await run(() => friendsService.blockUser(selected.friendId), 'Usuario bloqueado');
    backToList();
  };

  const sendEmail = async () => {
    if (!emailInput.trim()) return;
    setBusy(true);
    try {
      await friendsService.sendRequestByEmail(emailInput);
      setSentNotice(
        'Si esa persona tiene cuenta, le llegará tu solicitud. Verás aquí cuando la acepte.'
      );
      setEmailInput('');
      await reload();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!codeInput.trim()) return;
    setBusy(true);
    try {
      await friendsService.sendRequestByCode(codeInput);
      setSentNotice('Si el código es correcto, le llegará tu solicitud.');
      setCodeInput('');
      await reload();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      showToast('Código copiado');
    } catch {
      showToast('No se pudo copiar. Cópialo a mano.');
    }
  };

  const shareCode = async () => {
    if (!profile) return;
    const text = `Añádeme en Ticket-ia con mi código: ${profile.friendCode}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text });
      } catch {
        /* cancelado */
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Texto copiado');
      } catch {
        showToast('No se pudo compartir.');
      }
    }
  };

  const tabClass = (on: boolean) =>
    `flex-1 py-3 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border-b-2 ${
      on ? 'text-indigo-700 border-indigo-600' : 'text-gray-500 border-transparent'
    }`;

  const toastEl = toast ? (
    <div className="fixed left-4 right-4 bottom-24 max-w-md mx-auto bg-gray-900 text-white text-xs font-bold text-center rounded-2xl px-4 py-3 shadow-2xl z-[60]">
      {toast}
    </div>
  ) : null;

  // ---------- Añadir amigo ----------
  if (screen === 'add') {
    return (
      <div className="bg-gray-50 min-h-full">
        <div className="bg-white border-b border-gray-100 px-4 pt-3">
          <div className="flex items-center gap-3 h-11">
            <button onClick={() => { setScreen('list'); setSentNotice(''); }} aria-label="Volver">
              <ChevronLeft size={24} className="text-gray-900" />
            </button>
            <h1 className="text-base font-black text-gray-900">Añadir amigo</h1>
          </div>
          <div className="flex mt-1">
            {(['email', 'code', 'contacts'] as AddMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setAddMode(m); setSentNotice(''); }}
                className={tabClass(addMode === m)}
              >
                {m === 'email' ? 'Correo' : m === 'code' ? 'Código' : 'Contactos'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {addMode === 'email' && (
            <>
              <p className="text-xs font-semibold text-gray-600">
                Escribe el correo con el que tu amigo se registró en Ticket-ia.
              </p>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendEmail()}
                placeholder="amigo@correo.com"
                className="w-full bg-white border-2 border-indigo-600 rounded-2xl px-4 py-3.5 text-sm font-bold text-gray-900 outline-none"
              />
              <button
                onClick={sendEmail}
                disabled={busy || !emailInput.trim()}
                className="w-full bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl py-3.5 disabled:opacity-40"
              >
                Enviar solicitud
              </button>
              <p className="text-[11px] font-semibold text-gray-400">
                Por privacidad, el mensaje es el mismo exista o no esa cuenta. Cada persona puede
                desactivar en Ajustes que la encuentren por correo.
              </p>
            </>
          )}

          {addMode === 'code' && (
            <>
              <p className="text-xs font-semibold text-gray-600">
                Comparte tu código para que te añadan, o escribe el de tu amigo.
              </p>
              <div className="bg-white border border-gray-200 rounded-3xl p-4 text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Tu código
                </div>
                <div className="text-3xl font-black tracking-[0.14em] text-gray-900 mt-1">
                  {profile?.friendCode || '········'}
                </div>
                <div className="flex gap-2 justify-center mt-3">
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 border border-gray-200 bg-white text-indigo-700 text-[11px] font-black uppercase tracking-widest rounded-xl px-4 py-2.5"
                  >
                    <Copy size={14} /> Copiar
                  </button>
                  <button
                    onClick={shareCode}
                    className="flex items-center gap-1.5 border border-gray-200 bg-white text-indigo-700 text-[11px] font-black uppercase tracking-widest rounded-xl px-4 py-2.5"
                  >
                    <Share2 size={14} /> Compartir
                  </button>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Código de tu amigo
              </div>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect="off"
                placeholder="H4N8WZ3R"
                className="w-full bg-white border-2 border-indigo-600 rounded-2xl px-4 py-3.5 text-base font-black tracking-[0.14em] text-gray-900 outline-none"
              />
              <button
                onClick={sendCode}
                disabled={busy || !codeInput.trim()}
                className="w-full bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl py-3.5 disabled:opacity-40"
              >
                Enviar solicitud
              </button>
            </>
          )}

          {addMode === 'contacts' && (
            <>
              <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-5 text-center">
                <Smartphone size={28} className="mx-auto text-indigo-600 mb-2" />
                <div className="text-sm font-black text-gray-900">
                  Encuentra amigos en tus contactos
                </div>
                <p className="text-xs font-semibold text-gray-500 mt-2">
                  Con tu permiso, buscaremos qué contactos ya usan Ticket-ia y los añadirás con el
                  nombre que ya tienen en tu agenda.
                </p>
                <span className="inline-block mt-3 text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 rounded-full px-3 py-1.5">
                  Disponible en la app móvil
                </span>
              </div>
            </>
          )}

          {sentNotice && (
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-bold rounded-2xl p-3">
              {sentNotice}
            </div>
          )}
        </div>
        {toastEl}
      </div>
    );
  }

  // ---------- Ficha del amigo ----------
  if (screen === 'detail' && selected) {
    return (
      <div className="bg-gray-50 min-h-full">
        <div className="bg-white border-b border-gray-100 px-4 py-3.5">
          <div className="flex items-center gap-3 min-h-[44px]">
            <button onClick={backToList} aria-label="Volver">
              <ChevronLeft size={24} className="text-gray-900" />
            </button>
            <Avatar name={friendLabel(selected)} size={40} />
            <div className="min-w-0 flex-1">
              {editingAlias ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={aliasDraft}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveAlias();
                        if (e.key === 'Escape') setEditingAlias(false);
                      }}
                      maxLength={40}
                      placeholder={selected.displayName}
                      className="flex-1 min-w-0 h-10 border-2 border-indigo-600 rounded-xl px-3 text-base font-extrabold text-gray-900 bg-white outline-none"
                    />
                    <button
                      onClick={saveAlias}
                      disabled={busy}
                      aria-label="Guardar apodo"
                      className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => setEditingAlias(false)}
                      aria-label="Cancelar"
                      className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-500 flex items-center justify-center shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] font-semibold text-gray-500 mt-1">
                    Solo lo ves tú. Si su nombre real cambia, seguirás viendo tu apodo.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-black text-gray-900 truncate">
                      {friendLabel(selected)}
                    </h1>
                    <button
                      onClick={() => {
                        setAliasDraft(selected.alias || '');
                        setEditingAlias(true);
                      }}
                      aria-label="Editar apodo"
                      className="w-7 h-7 rounded-full bg-gray-100 text-indigo-700 flex items-center justify-center shrink-0"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  <div className="text-[11px] font-bold text-gray-500">
                    {selected.alias ? selected.displayName : 'Sin apodo'}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Tickets compartidos
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-2">
              Aquí verás lo que os debéis cuando compartáis tickets. Amigos desde el{' '}
              {shortDate(selected.since) || 'principio'}.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={removeFriend}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
            >
              <UserMinus size={14} /> Eliminar amigo
            </button>
            <button
              onClick={blockFriend}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 bg-white text-red-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
            >
              <Ban size={14} /> Bloquear
            </button>
          </div>
        </div>
        {toastEl}
      </div>
    );
  }

  // ---------- Lista ----------
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-4 pt-3">
        <div className="flex items-center justify-between h-11">
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Amigos</h1>
          <button
            onClick={() => { setScreen('add'); setAddMode('email'); setSentNotice(''); }}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl px-3.5 py-2.5"
          >
            <UserPlus size={16} /> Añadir
          </button>
        </div>
        <div className="flex mt-1">
          <button onClick={() => setTab('friends')} className={tabClass(tab === 'friends')}>
            <Users size={14} /> Amigos
          </button>
          <button onClick={() => setTab('inbox')} className={tabClass(tab === 'inbox')}>
            <Inbox size={14} /> Buzón
            {incoming.length > 0 && (
              <span className="bg-red-500 text-white rounded-full text-[10px] px-1.5 py-px">
                {incoming.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-indigo-600" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              {error}
              <button onClick={() => { setLoading(true); reload(); }} className="block mt-2 underline">
                Reintentar
              </button>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'friends' && (
          <>
            {friends.length === 0 && (
              <div className="text-center py-10">
                <Users size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-black text-gray-700">Aún no tienes amigos</p>
                <p className="text-xs font-semibold text-gray-500 mt-1">
                  Añade a alguien por correo o con su código.
                </p>
              </div>
            )}
            {friends.map((f) => (
              <button
                key={f.friendId}
                onClick={() => openFriend(f)}
                className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 text-left"
              >
                <Avatar name={friendLabel(f)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-gray-900 truncate">{friendLabel(f)}</div>
                  <div className="text-[11px] font-bold text-gray-500 truncate">
                    {f.alias ? f.displayName : `Amigos desde el ${shortDate(f.since)}`}
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            ))}

          </>
        )}

        {!loading && !error && tab === 'inbox' && (
          <>
            {incoming.length === 0 && outgoing.length === 0 && (
              <div className="text-center py-12 text-sm font-bold text-gray-400">
                No tienes avisos pendientes
              </div>
            )}
            {incoming.map((r) => (
              <div key={r.id} className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="text-sm font-black text-gray-900">
                    {r.displayName || 'Alguien'} quiere ser tu amigo
                  </div>
                  <div className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                    {shortDate(r.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() =>
                      run(() => friendsService.respondToRequest(r.id, true), 'Solicitud aceptada')
                    }
                    disabled={busy}
                    className="flex-1 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() =>
                      run(() => friendsService.respondToRequest(r.id, false), 'Solicitud rechazada')
                    }
                    disabled={busy}
                    className="flex-1 border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
            {outgoing.length > 0 && (
              <>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 pt-2">
                  Enviadas
                </div>
                {outgoing.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-white border border-dashed border-gray-300 rounded-2xl p-3"
                  >
                    <span className="text-xs font-bold text-gray-600">
                      Solicitud enviada el {shortDate(r.createdAt)}
                    </span>
                    <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">
                      Pendiente
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      {toastEl}
    </div>
  );
};

export default Friends;
