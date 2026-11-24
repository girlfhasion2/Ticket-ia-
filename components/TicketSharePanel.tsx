import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Copy, Share2, X, RefreshCw, Users, AlertCircle } from 'lucide-react';
import { Person } from '../types';
import { friendsService, friendLabel, Friend } from '../friendsService';
import { sharingService, TicketMember, buildInviteUrl } from '../sharingService';

interface TicketSharePanelProps {
  ticketId: string;
  participants: Person[];
  /** Nombre con el que esta persona ve a cada participante (apodos). */
  labelOf?: (p: Person) => string;
  /** El propietario quitó el acceso a un amigo añadido como participante. */
  onUnlinkFriend?: (participantId: string) => void;
}

const TicketSharePanel: React.FC<TicketSharePanelProps> = ({
  ticketId,
  participants,
  labelOf,
  onUnlinkFriend,
}) => {
  const nameOf = (p: Person) => (labelOf ? labelOf(p) : p.name);
  const linkAttempts = useRef<Map<string, number>>(new Map());
  const [members, setMembers] = useState<TicketMember[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [mem, fr, tok] = await Promise.all([
        sharingService.listMembers(ticketId),
        friendsService.listFriends(),
        sharingService.getActiveInvite(ticketId),
      ]);
      setMembers(mem);
      setFriends(fr);
      setInviteToken(tok);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la información de compartir.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  // Al añadir o quitar nombres, el ticket se guarda un instante después: se recarga entonces.
  const participantCount = participants.length;
  useEffect(() => {
    const timer = window.setTimeout(load, 900);
    return () => window.clearTimeout(timer);
  }, [participantCount, load]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const run = async (action: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    try {
      await action();
      if (okMsg) flash(okMsg);
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const nameOfUser = useMemo(() => {
    const byFriend = new Map(friends.map((f) => [f.friendId, friendLabel(f)]));
    return (m: TicketMember) => byFriend.get(m.userId) || m.displayName;
  }, [friends]);

  const participantIds = new Set(participants.map((p) => p.id));
  const memberByParticipant = new Map<string, TicketMember>();
  members.forEach((m) => {
    if (m.participantId && participantIds.has(m.participantId)) {
      memberByParticipant.set(m.participantId, m);
    }
  });
  const memberIds = new Set(members.map((m) => m.userId));
  const availableFriends = friends.filter((f) => !memberIds.has(f.friendId));
  const looseMembers = members.filter(
    (m) => !m.participantId || !participantIds.has(m.participantId)
  );
  const freeParticipants = participants.filter((p) => !memberByParticipant.has(p.id) && !p.userId);

  // Amigos añadidos como participantes: se vinculan solos en cuanto el ticket está guardado.
  const pendingLinks = participants.filter(
    (p) => p.userId && memberByParticipant.get(p.id)?.userId !== p.userId
  );
  const pendingKey = pendingLinks.map((p) => `${p.id}:${p.userId}`).join('|');
  useEffect(() => {
    if (loading || error || pendingLinks.length === 0) return;
    const next = pendingLinks.find(
      (p) => (linkAttempts.current.get(`${p.id}:${p.userId}`) || 0) < 5
    );
    if (!next) return;
    const key = `${next.id}:${next.userId}`;
    const timer = window.setTimeout(async () => {
      linkAttempts.current.set(key, (linkAttempts.current.get(key) || 0) + 1);
      try {
        await sharingService.linkMember(ticketId, next.userId as string, next.id);
      } catch {
        /* el ticket puede no estar guardado aún: se reintenta */
      }
      load();
    }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, loading, error, members]);

  const inviteUrl = inviteToken ? buildInviteUrl(inviteToken) : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      flash('Enlace copiado');
    } catch {
      flash('No se pudo copiar. Cópialo a mano.');
    }
  };

  const shareLink = async () => {
    const nav = navigator as Navigator & {
      share?: (d: { text: string; url?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ text: 'Únete a este ticket en Ticket-ia', url: inviteUrl });
      } catch {
        /* cancelado */
      }
    } else {
      await copyLink();
    }
  };

  const selectClass =
    'bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none max-w-[55%]';

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="text-indigo-600" />
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Compartir con amigos
        </label>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <RefreshCw size={20} className="animate-spin text-indigo-600" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-xs font-bold flex gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            {error}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="block mt-1 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <p className="text-[11px] font-semibold text-gray-500">
            Los amigos que vincules verán el reparto completo, pero solo tú puedes editarlo.
          </p>

          {participants.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Vincular nombres a amigos
              </div>
              {participants.map((p) => {
                const m = memberByParticipant.get(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 bg-gray-50 rounded-2xl px-3 py-2.5"
                  >
                    <span className="text-sm font-bold text-gray-800 truncate">{nameOf(p)}</span>
                    {m ? (
                      <span className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl pl-3 pr-1.5 py-1.5 text-xs font-black max-w-[55%]">
                        <span className="truncate">{nameOfUser(m)}</span>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Quitar acceso a ${nameOfUser(m)}`}
                          onClick={() =>
                            run(async () => {
                              await sharingService.removeMember(ticketId, m.userId);
                              if (p.userId) onUnlinkFriend?.(p.id);
                            }, 'Acceso quitado')
                          }
                          className="p-0.5 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ) : p.userId ? (
                      <span className="text-[11px] font-bold text-gray-400">Vinculando…</span>
                    ) : (
                      <select
                        value=""
                        disabled={busy || availableFriends.length === 0}
                        onChange={(e) => {
                          const uid = e.target.value;
                          if (uid)
                            run(() => sharingService.linkMember(ticketId, uid, p.id), 'Amigo vinculado');
                        }}
                        className={selectClass}
                        aria-label={`Vincular a ${p.name} con un amigo`}
                      >
                        <option value="">
                          {availableFriends.length === 0 ? 'Sin amigos libres' : 'Vincular amigo…'}
                        </option>
                        {availableFriends.map((f) => (
                          <option key={f.friendId} value={f.friendId}>
                            {friendLabel(f)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {looseMembers.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Con acceso, sin nombre del ticket
              </div>
              {looseMembers.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-2 bg-gray-50 rounded-2xl px-3 py-2.5"
                >
                  <span className="text-sm font-bold text-gray-800 truncate">{nameOfUser(m)}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {freeParticipants.length > 0 && (
                      <select
                        value=""
                        disabled={busy}
                        onChange={(e) => {
                          const pid = e.target.value;
                          if (pid)
                            run(() => sharingService.linkMember(ticketId, m.userId, pid), 'Nombre vinculado');
                        }}
                        className={selectClass}
                        aria-label={`Elegir qué nombre es ${nameOfUser(m)}`}
                      >
                        <option value="">Es…</option>
                        {freeParticipants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Quitar acceso a ${nameOfUser(m)}`}
                      onClick={() =>
                        run(() => sharingService.removeMember(ticketId, m.userId), 'Acceso quitado')
                      }
                      className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Enlace de invitación
            </div>
            {inviteToken ? (
              <>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2.5 text-[11px] font-bold text-gray-600 break-all">
                  {inviteUrl}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-white text-indigo-700 text-[11px] font-black uppercase tracking-widest rounded-xl py-2.5"
                  >
                    <Copy size={14} /> Copiar
                  </button>
                  <button
                    type="button"
                    onClick={shareLink}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl py-2.5"
                  >
                    <Share2 size={14} /> Compartir
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Se anulará el enlace actual. Quien ya haya entrado conservará el acceso. ¿Continuar?'
                      )
                    )
                      run(() => sharingService.revokeInvites(ticketId), 'Enlace anulado');
                  }}
                  className="w-full text-[11px] font-black uppercase tracking-widest text-red-500 py-1.5"
                >
                  Anular enlace
                </button>
                <p className="text-[10px] font-semibold text-gray-400">
                  Quien lo abra tendrá que iniciar sesión y elegir qué nombre es el suyo. Caduca a los
                  14 días.
                </p>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => { await sharingService.createInvite(ticketId); })}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl py-3"
              >
                <Users size={16} /> Crear enlace de invitación
              </button>
            )}
          </div>
        </>
      )}

      {notice && (
        <div className="text-center text-[11px] font-black text-indigo-700 bg-indigo-50 rounded-xl py-2">
          {notice}
        </div>
      )}
    </div>
  );
};

export default TicketSharePanel;
