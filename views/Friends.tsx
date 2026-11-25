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
  MoreVertical,
  Smartphone,
  Bell,
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
import { sharingService, OwnedSharedTicket, SharedTicket } from '../sharingService';
import {
  notificationsService,
  needsAttention,
  AppNotification,
} from '../notificationsService';
import {
  buildBalances,
  isOpen,
  sumOpen,
  BalanceEntry,
  PersonBalance,
} from '../utils/balances';
import { formatMoney } from '../utils/format';

type Screen = 'list' | 'detail' | 'add';
type Tab = 'friends' | 'inbox';
type AddMode = 'email' | 'code' | 'contacts';
type Filter = 'all' | 'owed' | 'owe';

interface FriendsProps {
  /** Avisa a la app de lo que requiere tu atención (solicitudes y pagos por confirmar). */
  onPendingCountChange?: (count: number) => void;
  /** Abre un ticket que han compartido contigo. personId: desde qué amigo se abrió, para volver a él. */
  onOpenShared?: (ticketId: string, personId?: string) => void;
  /** Abre un ticket tuyo desde el detalle de un amigo. */
  onOpenOwn?: (ticketId: string, personId: string) => void;
  /** Detalle de amigo que se muestra al montar (al volver de abrir un ticket). */
  initialPersonId?: string;
  onInitialConsumed?: () => void;
  /** Filtro con el que se abre la lista (desde Inicio). */
  initialFilter?: Filter;
  onInitialFilterConsumed?: () => void;
}

/** Una persona con la que tengo trato: un amigo, o alguien que solo comparte tickets. */
interface Person {
  userId: string;
  name: string;
  realName: string;
  friend: Friend | null;
  entries: BalanceEntry[];
}

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

const chipClass = (kind: 'neutral' | 'owed' | 'owe' | 'wait') =>
  `text-xs font-black rounded-xl px-2.5 py-1.5 whitespace-nowrap ${
    kind === 'owed'
      ? 'bg-green-50 text-green-700'
      : kind === 'owe'
      ? 'bg-red-50 text-red-600'
      : kind === 'wait'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-500'
  }`;

/** Texto y color del resumen de una persona en la lista. */
function summarize(
  entries: BalanceEntry[],
  filter: Filter
): { text: string; kind: 'neutral' | 'owed' | 'owe' | 'wait' } {
  const open = entries.filter(isOpen);
  const owed = sumOpen(entries, 'theyOwe');
  const owe = sumOpen(entries, 'iOwe');
  if (filter === 'owed') return { text: `Te debe ${formatMoney(owed)}`, kind: 'owed' };
  if (filter === 'owe') return { text: `Le debes ${formatMoney(owe)}`, kind: 'owe' };
  if (open.length > 0 && open.every((e) => e.status === 'sent')) {
    const dirs = new Set(open.map((e) => e.direction));
    if (dirs.size === 1) {
      return dirs.has('iOwe')
        ? { text: 'Pago enviado', kind: 'wait' }
        : { text: 'Confirma su pago', kind: 'wait' };
    }
  }
  const net = owed - owe;
  if (net > 0.005) return { text: `Te debe ${formatMoney(net)}`, kind: 'owed' };
  if (net < -0.005) return { text: `Le debes ${formatMoney(-net)}`, kind: 'owe' };
  if (open.length > 0) return { text: 'Saldo 0,00€', kind: 'neutral' };
  return { text: 'Al día', kind: 'neutral' };
}

const Friends: React.FC<FriendsProps> = ({
  onPendingCountChange,
  onOpenShared,
  onOpenOwn,
  initialPersonId,
  onInitialConsumed,
  initialFilter,
  onInitialFilterConsumed,
}) => {
  const [screen, setScreen] = useState<Screen>(initialPersonId ? 'detail' : 'list');
  const [tab, setTab] = useState<Tab>('friends');
  const [filter, setFilter] = useState<Filter>(initialFilter || 'all');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [owned, setOwned] = useState<OwnedSharedTicket[]>([]);
  const [shared, setShared] = useState<SharedTicket[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialPersonId || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (initialPersonId) onInitialConsumed?.();
    if (initialFilter) onInitialFilterConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  // Ficha
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
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  // ----- Datos derivados -----
  const balances = buildBalances(owned, shared);
  const people: Person[] = friends.map((f) => ({
    userId: f.friendId,
    name: friendLabel(f),
    realName: f.displayName,
    friend: f,
    entries: balances.get(f.friendId)?.entries || [],
  }));
  balances.forEach((b: PersonBalance) => {
    if (!friends.some((f) => f.friendId === b.userId)) {
      people.push({
        userId: b.userId,
        name: b.displayName,
        realName: b.displayName,
        friend: null,
        entries: b.entries,
      });
    }
  });
  people.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const owedTotal = people.reduce((s, p) => s + sumOpen(p.entries, 'theyOwe'), 0);
  const oweTotal = people.reduce((s, p) => s + sumOpen(p.entries, 'iOwe'), 0);

  const visiblePeople = people.filter((p) => {
    if (filter === 'owed') return p.entries.some((e) => isOpen(e) && e.direction === 'theyOwe');
    if (filter === 'owe') return p.entries.some((e) => isOpen(e) && e.direction === 'iOwe');
    return true;
  });

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  const attentionCount = notifications.filter(needsAttention).length;

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
      // Compartir tickets puede no estar activado todavía en el servidor: no es un error de Amigos.
      const [ow, sh] = await Promise.all([
        sharingService.listOwnedSharedTickets().catch(() => [] as OwnedSharedTicket[]),
        sharingService.listSharedTickets().catch(() => [] as SharedTicket[]),
      ]);
      setOwned(ow);
      setShared(sh);
      setError(null);
      let notifs: AppNotification[] = [];
      try {
        notifs = await notificationsService.list();
        setNotifError(null);
      } catch (e: any) {
        setNotifError(e?.message || 'No se pudo cargar el buzón.');
      }
      setNotifications(notifs);
      onPendingCountChange?.(notifs.filter(needsAttention).length);
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

  const selected = people.find((p) => p.userId === selectedId) || null;

  const openPerson = (p: Person) => {
    setSelectedId(p.userId);
    setEditingAlias(false);
    setMenuOpen(false);
    setShowAll(false);
    setScreen('detail');
  };

  const backToList = () => {
    setScreen('list');
    setSelectedId(null);
    setEditingAlias(false);
    setMenuOpen(false);
  };

  const saveAlias = async () => {
    if (!selected?.friend) return;
    const value = aliasDraft.trim();
    await run(
      () => friendsService.setAlias(selected.friend!.friendId, value),
      value ? 'Apodo guardado' : 'Apodo quitado'
    );
    setEditingAlias(false);
  };

  const removeFriend = async () => {
    if (!selected?.friend) return;
    if (!window.confirm(`¿Eliminar a ${selected.name} de tus amigos?`)) return;
    await run(() => friendsService.removeFriend(selected.friend!.friendId), 'Amistad eliminada');
    backToList();
  };

  const blockFriend = async () => {
    if (!selected?.friend) return;
    if (
      !window.confirm(
        `¿Bloquear a ${selected.name}? Dejaréis de ser amigos y no podrá enviarte solicitudes.`
      )
    )
      return;
    await run(() => friendsService.blockUser(selected.friend!.friendId), 'Usuario bloqueado');
    backToList();
  };

  const openEntry = (p: Person, e: BalanceEntry) => {
    // Si debo yo, el ticket es del amigo (vista compartida). Si me debe, el ticket es mío.
    if (e.direction === 'iOwe') onOpenShared?.(e.ticketId, p.userId);
    else onOpenOwn?.(e.ticketId, p.userId);
  };

  // ----- Pagos -----
  const confirmEntry = (p: Person, e: BalanceEntry) =>
    run(() => sharingService.confirmPayment(e.ticketId, p.userId), 'Pago confirmado. Queda como cobrado');
  const reopenEntry = (p: Person, e: BalanceEntry) =>
    run(() => sharingService.reopenPayment(e.ticketId, p.userId), 'Vuelve a quedar pendiente');
  const sendEntry = (p: Person, e: BalanceEntry) =>
    run(
      () => sharingService.markPaymentSent(e.ticketId),
      `Marcado como enviado. ${p.name} tiene que confirmarlo`
    );
  const undoEntry = (e: BalanceEntry) =>
    run(() => sharingService.undoPaymentSent(e.ticketId), 'Envío deshecho');

  const remindableEntries = (p: Person) =>
    p.entries.filter(
      (e) =>
        e.direction === 'theyOwe' &&
        e.status === 'pending' &&
        (!e.lastReminderAt || Date.now() - new Date(e.lastReminderAt).getTime() > REMINDER_COOLDOWN_MS)
    );

  const remind = async (p: Person) => {
    const targets = remindableEntries(p);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((e) => sharingService.remindPayment(e.ticketId, p.userId))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      if (ok > 0) showToast(`Recordatorio enviado a ${p.name}`);
      else {
        const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        showToast(first?.reason?.message || 'No se pudo enviar el recordatorio.');
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  // ----- Avisos -----
  const markRead = async (n: AppNotification) => {
    if (n.readAt) return;
    setNotifications((list) =>
      list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    );
    try {
      await notificationsService.markRead(n.id);
      onPendingCountChange?.(
        notifications
          .map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
          .filter(needsAttention).length
      );
    } catch {
      /* se corrige en la siguiente carga */
    }
  };

  const markAllRead = () =>
    run(() => notificationsService.markAllRead(), 'Todo marcado como leído');

  /** Persona (amigo o no) que provocó un aviso, con tu apodo si lo hay. */
  const nameOf = (n: AppNotification): string => {
    const f = n.actorId ? friends.find((x) => x.friendId === n.actorId) : undefined;
    return f ? friendLabel(f) : n.actorName;
  };

  const entryFor = (n: AppNotification): BalanceEntry | undefined =>
    n.actorId && n.ticketId
      ? balances.get(n.actorId)?.entries.find((e) => e.ticketId === n.ticketId)
      : undefined;

  const personById = (id: string | null): Person | undefined =>
    id ? people.find((p) => p.userId === id) : undefined;

  // ----- Añadir amigo -----
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

  // ---------- Ficha ----------
  if (screen === 'detail' && selected) {
    const open = selected.entries.filter(isOpen);
    const visibleEntries = showAll ? selected.entries : open;
    const hiddenCount = selected.entries.length - open.length;
    const owed = sumOpen(selected.entries, 'theyOwe');
    const owe = sumOpen(selected.entries, 'iOwe');
    const net = owed - owe;
    const dirs = new Set(open.map((e) => e.direction));
    const allSent = open.length > 0 && open.every((e) => e.status === 'sent') && dirs.size === 1;

    let boxClass = 'bg-gray-100 text-gray-600 border border-transparent';
    let label = open.length > 0 ? 'Saldo cruzado' : 'Estáis al día';
    let value = formatMoney(open.length > 0 ? Math.abs(net) : 0);
    let note = '';
    if (allSent) {
      boxClass = 'bg-amber-50 text-amber-700 border border-amber-200';
      if (dirs.has('iOwe')) {
        label = `Pago enviado a ${selected.name}`;
        note = `Esperando a que ${selected.name} lo confirme. Hasta entonces no cuenta como pagado.`;
        value = formatMoney(owe);
      } else {
        label = `${selected.name} dice que te ha pagado`;
        note = 'Confírmalo abajo cuando lo hayas recibido.';
        value = formatMoney(owed);
      }
    } else if (net > 0.005) {
      boxClass = 'bg-green-50 text-green-700 border border-green-100';
      label = `${selected.name} te debe`;
      value = formatMoney(net);
    } else if (net < -0.005) {
      boxClass = 'bg-red-50 text-red-600 border border-red-200';
      label = `Le debes a ${selected.name}`;
      value = formatMoney(-net);
    }

    const canRemind = remindableEntries(selected).length > 0;
    const hasPendingOwed = selected.entries.some(
      (e) => e.direction === 'theyOwe' && e.status === 'pending'
    );
    const alreadyReminded = hasPendingOwed && !canRemind;

    return (
      <div className="bg-gray-50 min-h-full">
        <div className="bg-white border-b border-gray-100 px-4 py-3.5">
          <div className="flex items-center gap-3 min-h-[44px]">
            <button onClick={backToList} aria-label="Volver">
              <ChevronLeft size={24} className="text-gray-900" />
            </button>
            <Avatar name={selected.name} size={40} />
            <div className="min-w-0 flex-1">
              {editingAlias && selected.friend ? (
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
                      placeholder={selected.realName}
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
                    <h1 className="text-base font-black text-gray-900 truncate">{selected.name}</h1>
                    {selected.friend && (
                      <button
                        onClick={() => {
                          setAliasDraft(selected.friend?.alias || '');
                          setEditingAlias(true);
                        }}
                        aria-label="Editar apodo"
                        className="w-7 h-7 rounded-full bg-gray-100 text-indigo-700 flex items-center justify-center shrink-0"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] font-bold text-gray-500">
                    {!selected.friend
                      ? 'No es tu amigo, comparte tickets contigo'
                      : selected.friend.alias
                      ? selected.realName
                      : 'Sin apodo'}
                  </div>
                </>
              )}
            </div>
            {selected.friend && !editingAlias && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Más opciones"
                  aria-expanded={menuOpen}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"
                >
                  <MoreVertical size={18} />
                </button>
                {menuOpen && (
                  <>
                    <button
                      aria-label="Cerrar menú"
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-11 z-40 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                      <button
                        onClick={() => { setMenuOpen(false); removeFriend(); }}
                        disabled={busy}
                        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left text-xs font-black text-gray-700 uppercase tracking-wide active:bg-gray-50"
                      >
                        <UserMinus size={15} /> Eliminar amigo
                      </button>
                      <div className="h-px bg-gray-100" />
                      <button
                        onClick={() => { setMenuOpen(false); blockFriend(); }}
                        disabled={busy}
                        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left text-xs font-black text-red-600 uppercase tracking-wide active:bg-red-50"
                      >
                        <Ban size={15} /> Bloquear
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4 pb-24">
          <div className={`rounded-2xl p-4 ${boxClass}`}>
            <div className="text-[10px] font-black uppercase tracking-widest">{label}</div>
            <div className="text-3xl font-black mt-0.5">{value}</div>
            {note && <div className="text-[11px] font-bold mt-1.5">{note}</div>}
          </div>

          {canRemind && (
            <button
              onClick={() => remind(selected)}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl py-3.5 disabled:opacity-50"
            >
              <Bell size={15} /> Recordar pago
            </button>
          )}
          {alreadyReminded && (
            <div className="w-full text-center bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-widest rounded-2xl py-3.5">
              Recordatorio enviado · otro en 24 h
            </div>
          )}

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
              {showAll ? 'Todos los tickets compartidos' : 'Tickets abiertos'}
            </div>
            {selected.entries.length === 0 && (
              <p className="text-xs font-semibold text-gray-400 py-2">
                Todavía no compartís ningún ticket con importes.
              </p>
            )}
            {selected.entries.length > 0 && visibleEntries.length === 0 && (
              <p className="text-xs font-semibold text-gray-500 py-2">
                No hay nada pendiente con {selected.name}.
              </p>
            )}
            <div className="space-y-2">
              {visibleEntries.map((e) => {
                const mine = e.direction === 'iOwe';
                let stLabel: string;
                let stClass: string;
                let primary: { label: string; onClick: () => void } | null = null;
                let secondary: { label: string; onClick: () => void } | null = null;
                if (e.status === 'confirmed') {
                  stLabel = mine ? 'Pagado ✓' : 'Cobrado ✓';
                  stClass = 'bg-green-100 text-green-700';
                  if (!mine) secondary = { label: 'Deshacer', onClick: () => reopenEntry(selected, e) };
                } else if (e.status === 'sent') {
                  stClass = 'bg-amber-100 text-amber-700';
                  if (mine) {
                    stLabel = `Enviado · esperando a ${selected.name}`;
                    secondary = { label: 'Deshacer', onClick: () => undoEntry(e) };
                  } else {
                    stLabel = `${selected.name} dice que pagó`;
                    primary = { label: 'Confirmar recibido', onClick: () => confirmEntry(selected, e) };
                    secondary = { label: 'No lo he recibido', onClick: () => reopenEntry(selected, e) };
                  }
                } else {
                  stLabel = 'Pendiente';
                  stClass = 'bg-gray-100 text-gray-600';
                  primary = mine
                    ? { label: 'Marcar como enviado', onClick: () => sendEntry(selected, e) }
                    : { label: 'Marcar como cobrado', onClick: () => confirmEntry(selected, e) };
                }
                return (
                  <div key={e.ticketId} className="bg-white border border-gray-100 rounded-2xl p-3">
                    <button
                      type="button"
                      onClick={() => openEntry(selected, e)}
                      aria-label={`Abrir el ticket ${e.merchant}`}
                      className="w-full flex items-center gap-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-gray-900 truncate">{e.merchant}</div>
                        <div className="text-[11px] font-bold text-gray-500">
                          {shortDate(e.date)} · {mine ? `pagó ${selected.name}` : 'pagaste tú'}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-black ${
                          e.status === 'confirmed'
                            ? 'text-gray-400 line-through'
                            : mine
                            ? 'text-red-600'
                            : 'text-green-700'
                        }`}
                      >
                        {mine ? '-' : '+'}
                        {formatMoney(e.amount)}
                      </div>
                      <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wide rounded-full px-2.5 py-1.5 ${stClass}`}
                      >
                        {stLabel}
                      </span>
                      {primary && (
                        <button
                          onClick={primary.onClick}
                          disabled={busy}
                          className="min-h-[34px] px-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-50"
                        >
                          {primary.label}
                        </button>
                      )}
                      {secondary && (
                        <button
                          onClick={secondary.onClick}
                          disabled={busy}
                          className="min-h-[34px] px-3 rounded-xl border border-gray-200 bg-white text-gray-600 text-[10px] font-black uppercase tracking-wide disabled:opacity-50"
                        >
                          {secondary.label}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {(hiddenCount > 0 || showAll) && selected.entries.length > 0 && hiddenCount > 0 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="w-full mt-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest"
              >
                {showAll ? 'Ocultar historial' : `Ver historial (${hiddenCount})`}
              </button>
            )}
          </div>

        </div>
        {toastEl}
      </div>
    );
  }

  // ---------- Lista ----------
  const filterCard = (on: boolean, color: 'indigo' | 'green' | 'red') =>
    `flex-1 min-w-0 text-left rounded-2xl p-3 border-2 ${
      on
        ? color === 'green'
          ? 'bg-green-50 border-green-600'
          : color === 'red'
          ? 'bg-red-50 border-red-500'
          : 'bg-indigo-50 border-indigo-600'
        : 'bg-white border-gray-100'
    }`;

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
            {attentionCount > 0 && (
              <span className="bg-red-500 text-white rounded-full text-[10px] px-1.5 py-px">
                {attentionCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 pb-24">
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
            <div className="flex gap-2">
              <button onClick={() => setFilter('all')} className={filterCard(filter === 'all', 'indigo')}>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-600">Todos</div>
                <div className="text-lg font-black text-gray-900 mt-0.5 truncate">
                  {people.length} {people.length === 1 ? 'persona' : 'personas'}
                </div>
              </button>
              <button
                onClick={() => setFilter(filter === 'owed' ? 'all' : 'owed')}
                className={filterCard(filter === 'owed', 'green')}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-green-700">Te deben</div>
                <div className="text-lg font-black text-green-700 mt-0.5 truncate">{formatMoney(owedTotal)}</div>
              </button>
              <button
                onClick={() => setFilter(filter === 'owe' ? 'all' : 'owe')}
                className={filterCard(filter === 'owe', 'red')}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-red-600">Debes</div>
                <div className="text-lg font-black text-red-600 mt-0.5 truncate">{formatMoney(oweTotal)}</div>
              </button>
            </div>

            {people.length === 0 && (
              <div className="text-center py-10">
                <Users size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-black text-gray-700">Aún no tienes amigos</p>
                <p className="text-xs font-semibold text-gray-500 mt-1">
                  Añade a alguien por correo o con su código.
                </p>
              </div>
            )}

            {people.length > 0 && visiblePeople.length === 0 && (
              <div className="text-center py-10 text-sm font-bold text-gray-400">
                {filter === 'owed' ? 'Nadie te debe nada ahora mismo' : 'No debes nada a nadie'}
              </div>
            )}

            {visiblePeople.map((p) => {
              const sm = summarize(p.entries, filter);
              return (
                <button
                  key={p.userId}
                  onClick={() => openPerson(p)}
                  className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 text-left"
                >
                  <Avatar name={p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-gray-900 truncate">{p.name}</div>
                    <div className="text-[11px] font-bold text-gray-500 truncate">
                      {!p.friend
                        ? 'No es tu amigo'
                        : p.friend.alias
                        ? p.realName
                        : p.entries.length > 0
                        ? `${p.entries.length} ${p.entries.length === 1 ? 'ticket compartido' : 'tickets compartidos'}`
                        : 'Sin tickets todavía'}
                    </div>
                  </div>
                  <span className={chipClass(sm.kind)}>{sm.text}</span>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </button>
              );
            })}
          </>
        )}

        {!loading && !error && tab === 'inbox' && (
          <>
            {notifError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                {notifError}
              </div>
            )}

            {notifications.some((n) => !n.readAt) && (
              <div className="flex justify-end">
                <button
                  onClick={markAllRead}
                  disabled={busy}
                  className="text-[11px] font-black uppercase tracking-widest text-indigo-700 py-1"
                >
                  Marcar todo como leído
                </button>
              </div>
            )}

            {!notifError && notifications.length === 0 && outgoing.length === 0 && (
              <div className="text-center py-12 text-sm font-bold text-gray-400">
                No tienes avisos todavía
              </div>
            )}

            {notifications.map((n) => {
              const unread = !n.readAt;
              const who = nameOf(n);
              const entry = entryFor(n);
              const amount = entry ? formatMoney(entry.amount) : null;
              const actor = personById(n.actorId);
              const merchant = n.merchant || 'Ticket sin nombre';

              let title = '';
              let body = '';
              switch (n.type) {
                case 'friend_request':
                  title = `${who} quiere ser tu amigo`;
                  break;
                case 'friend_accepted':
                  title = `${who} ha aceptado tu solicitud`;
                  body = 'Ya sois amigos.';
                  break;
                case 'added_to_ticket':
                  title = `${who} te ha añadido a «${merchant}»`;
                  body = 'Ya puedes ver el reparto y lo que te toca pagar.';
                  break;
                case 'member_joined':
                  title = `${who} se ha unido a «${merchant}»`;
                  body = 'Entró con tu enlace de invitación.';
                  break;
                case 'payment_sent':
                  title = `${who} dice que te ha pagado`;
                  body = `${amount ? `${amount} del ticket` : 'Del ticket'} «${merchant}». Confírmalo cuando lo hayas recibido.`;
                  break;
                case 'payment_confirmed':
                  title = `${who} ha confirmado tu pago`;
                  body = `Ticket «${merchant}». Queda como pagado.`;
                  break;
                case 'payment_reopened':
                  title = `${who} dice que no ha recibido tu pago`;
                  body = `Ticket «${merchant}». Vuelve a estar pendiente.`;
                  break;
                case 'payment_reminder':
                  title = `Recordatorio de ${who}`;
                  body = `${amount ? `Te recuerda ${amount} del` : 'Te recuerda tu parte del'} ticket «${merchant}».`;
                  break;
              }

              const resolvedLabel: Record<string, string> = {
                accepted: 'Aceptada',
                rejected: n.type === 'payment_sent' ? 'Marcado como no recibido' : 'Rechazada',
                confirmed: 'Confirmado · cobrado',
                undone: `${who} deshizo el envío`,
              };

              const canViewTicket =
                !!onOpenShared &&
                !!n.ticketId &&
                (n.type === 'added_to_ticket' || n.type === 'payment_reminder' ||
                  n.type === 'payment_confirmed' || n.type === 'payment_reopened');

              return (
                <div
                  key={n.id}
                  className={`rounded-2xl p-4 border ${
                    unread ? 'bg-indigo-50/70 border-indigo-100' : 'bg-white border-gray-100'
                  }`}
                >
                  <div onClick={() => markRead(n)} className="cursor-pointer">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {unread && (
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mt-1 shrink-0" aria-label="Sin leer" />
                        )}
                        <div className={`text-sm text-gray-900 ${unread ? 'font-black' : 'font-semibold'}`}>
                          {title}
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                        {shortDate(n.createdAt)}
                      </div>
                    </div>
                    {body && (
                      <div
                        className={`text-xs mt-1 ${
                          unread ? 'font-semibold text-gray-600' : 'font-medium text-gray-400'
                        } ${unread ? 'ml-[18px]' : ''}`}
                      >
                        {body}
                      </div>
                    )}
                  </div>

                  {n.type === 'friend_request' && n.resolved === null && n.friendshipId && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() =>
                          run(() => friendsService.respondToRequest(n.friendshipId!, true), 'Solicitud aceptada')
                        }
                        disabled={busy}
                        className="flex-1 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() =>
                          run(() => friendsService.respondToRequest(n.friendshipId!, false), 'Solicitud rechazada')
                        }
                        disabled={busy}
                        className="flex-1 border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}

                  {n.type === 'payment_sent' && n.resolved === null && n.actorId && n.ticketId && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() =>
                          run(
                            () => sharingService.confirmPayment(n.ticketId!, n.actorId!),
                            'Pago confirmado. Queda como cobrado'
                          )
                        }
                        disabled={busy}
                        className="flex-1 bg-green-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() =>
                          run(
                            () => sharingService.reopenPayment(n.ticketId!, n.actorId!),
                            'Vuelve a quedar pendiente'
                          )
                        }
                        disabled={busy}
                        className="flex-1 border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
                      >
                        No lo he recibido
                      </button>
                    </div>
                  )}

                  {n.resolved !== null && (
                    <span className="inline-block mt-3 text-[10px] font-black uppercase tracking-wide text-gray-600 bg-gray-100 rounded-full px-2.5 py-1.5">
                      {resolvedLabel[n.resolved] || n.resolved}
                    </span>
                  )}

                  {(canViewTicket || (n.type === 'payment_sent' && actor)) && (
                    <div className="mt-3 flex gap-2">
                      {canViewTicket && (
                        <button
                          onClick={() => {
                            markRead(n);
                            onOpenShared!(n.ticketId!);
                          }}
                          className="text-[11px] font-black uppercase tracking-widest text-indigo-700 border border-gray-200 bg-white rounded-xl px-4 py-2.5"
                        >
                          Ver ticket
                        </button>
                      )}
                      {n.type === 'payment_sent' && actor && (
                        <button
                          onClick={() => {
                            markRead(n);
                            openPerson(actor);
                          }}
                          className="text-[11px] font-black uppercase tracking-widest text-indigo-700 border border-gray-200 bg-white rounded-xl px-4 py-2.5"
                        >
                          Ver ficha
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

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
