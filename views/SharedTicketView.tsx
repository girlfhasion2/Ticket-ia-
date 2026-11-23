import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronDown, Lock, RefreshCw, AlertCircle, LogOut } from 'lucide-react';
import { sharingService, SharedTicket } from '../sharingService';
import { friendsService } from '../friendsService';
import { formatMoney } from '../utils/format';
import { computeTicketTotals } from '../utils/ticketTotals';

interface SharedTicketViewProps {
  ticketId: string;
  onBack: () => void;
}

const SharedTicketView: React.FC<SharedTicketViewProps> = ({ ticketId, onBack }) => {
  const [shared, setShared] = useState<SharedTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await sharingService.getSharedTicket(ticketId);
      setShared(s);
      setError(s ? null : 'Ya no tienes acceso a este ticket.');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const leave = async () => {
    if (!window.confirm('¿Salir de este ticket? Dejarás de verlo.')) return;
    setLeaving(true);
    try {
      const profile = await friendsService.getMyProfile();
      if (!profile) throw new Error('No se pudo identificar tu cuenta.');
      await sharingService.removeMember(ticketId, profile.id);
      onBack();
    } catch (e: any) {
      setError(e?.message || 'No se pudo salir del ticket.');
      setLeaving(false);
    }
  };

  const header = (
    <div className="bg-white border-b border-gray-100 px-4 py-3.5">
      <div className="flex items-center gap-3 min-h-[44px]">
        <button onClick={onBack} aria-label="Volver">
          <ChevronLeft size={24} className="text-gray-900" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-black text-gray-900 truncate">
            {shared?.ticket.merchant || 'Ticket compartido'}
          </h1>
          {shared && (
            <div className="text-[11px] font-bold text-gray-500 truncate">
              De {shared.ownerName} · {shared.ticket.date}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setLoading(true);
            load();
          }}
          aria-label="Actualizar"
          className="w-9 h-9 rounded-full bg-gray-100 text-indigo-700 flex items-center justify-center"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );

  if (!shared) {
    return (
      <div className="bg-gray-50 min-h-full">
        {header}
        <div className="p-4">
          {loading && !error ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { ticket, myParticipantId } = shared;
  const { totals, items, pending } = computeTicketTotals(ticket);
  const nameById = new Map(ticket.participants.map((p) => [p.id, p.name]));
  const myName = myParticipantId ? nameById.get(myParticipantId) : undefined;
  const myTotal = myParticipantId ? totals[myParticipantId] : undefined;

  return (
    <div className="bg-gray-50 min-h-full">
      {header}
      <div className="p-4 space-y-4 pb-24">
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl px-3 py-2.5 text-[11px] font-bold">
          <Lock size={14} className="shrink-0" />
          Solo lectura. Quien creó el ticket es el único que edita el reparto.
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-xs font-bold">
            {error}
          </div>
        )}

        {myParticipantId && myTotal !== undefined ? (
          <div className="bg-indigo-600 text-white rounded-3xl p-5">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-80">
              Tu parte{myName ? ` (${myName})` : ''}
            </div>
            <div className="text-3xl font-black mt-1">{formatMoney(myTotal)}</div>
            <div className="mt-3 space-y-1">
              {(items[myParticipantId] || []).map((it, i) => (
                <div key={i} className="flex justify-between gap-3 text-xs font-bold opacity-95">
                  <span className="truncate">
                    {it.quantityLabel} × {it.description}
                  </span>
                  <span className="shrink-0">{formatMoney(it.amount)}</span>
                </div>
              ))}
              {(items[myParticipantId] || []).length === 0 && (
                <div className="text-xs font-bold opacity-80">Todavía no tienes nada asignado.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-xs font-semibold text-gray-600">
            Todavía no estás vinculado a ningún nombre de este ticket. Pídele a {shared.ownerName} que
            te vincule para ver tu parte.
          </div>
        )}

        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Reparto de todos
          </div>
          <div className="space-y-2">
            {ticket.participants.map((p) => {
              const isMe = p.id === myParticipantId;
              const open = openId === p.id;
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl border ${
                    isMe ? 'border-indigo-300' : 'border-gray-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="w-full flex items-center gap-2 p-3 text-left"
                  >
                    <span className="flex-1 min-w-0 text-sm font-black text-gray-900 truncate">
                      {p.name}
                      {isMe && (
                        <span className="ml-2 text-[9px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">
                          Tú
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-black text-gray-900">
                      {formatMoney(totals[p.id] || 0)}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-1 border-t border-gray-50 pt-2">
                      {(items[p.id] || []).length === 0 && (
                        <div className="text-xs font-semibold text-gray-400">Sin productos asignados</div>
                      )}
                      {(items[p.id] || []).map((it, i) => (
                        <div key={i} className="flex justify-between gap-3 text-xs font-bold text-gray-600">
                          <span className="truncate">
                            {it.quantityLabel} × {it.description}
                          </span>
                          <span className="shrink-0">{formatMoney(it.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Productos
          </div>
          <div className="space-y-2">
            {ticket.lines.map((line) => {
              const groups = line.assignments.filter((a) => a.personIds.length > 0 && a.units > 0);
              const left = pending.find((x) => x.lineId === line.id);
              return (
                <div key={line.id} className="bg-white border border-gray-100 rounded-2xl p-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-gray-900 truncate">{line.description}</div>
                      <div className="text-[11px] font-bold text-gray-500">
                        {line.quantity} {line.quantity === 1 ? 'ud' : 'uds'} × {formatMoney(line.unitPrice)}
                      </div>
                    </div>
                    <div className="text-sm font-black text-gray-900 shrink-0">
                      {formatMoney(line.total)}
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {groups.map((g) => (
                      <div key={g.id} className="text-[11px] font-bold text-gray-600">
                        {g.units} {g.units === 1 ? 'ud' : 'uds'}:{' '}
                        {g.personIds.map((id) => nameById.get(id) || '?').join(', ')}
                      </div>
                    ))}
                    {left && (
                      <div className="text-[11px] font-black text-amber-700">
                        Sin asignar: {left.units} {left.units === 1 ? 'ud' : 'uds'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl p-4">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Total del ticket
          </span>
          <span className="text-lg font-black text-gray-900">{formatMoney(ticket.totalAmount)}</span>
        </div>

        <button
          onClick={leave}
          disabled={leaving}
          className="w-full flex items-center justify-center gap-1.5 border border-gray-200 bg-white text-gray-600 text-[11px] font-black uppercase tracking-widest rounded-xl py-3"
        >
          <LogOut size={14} /> Salir del ticket
        </button>
      </div>
    </div>
  );
};

export default SharedTicketView;
