import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { Ticket } from '../types';
import {
  ChevronRight,
  Calendar,
  Store,
  Receipt,
  Trash2,
  AlertCircle,
  RefreshCw,
  CheckSquare,
  Check,
  X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface TicketListProps {
  onSelectTicket: (id: string) => void;
  onCreateTicket: () => void;
  onSelectionModeChange?: (active: boolean) => void;
}

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 10;

const TicketList: React.FC<TicketListProps> = ({
  onSelectTicket,
  onCreateTicket,
  onSelectionModeChange,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const longPressTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    onSelectionModeChange?.(selectionMode);
  }, [selectionMode, onSelectionModeChange]);

  useEffect(() => {
    return () => {
      onSelectionModeChange?.(false);
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const loadTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allTickets = await db.tickets.orderBy('date').reverse().toArray();
      setTickets(allTickets);
    } catch (err: any) {
      console.warn('Error loading tickets:', err?.message || err);
      setError(err?.message || 'No se pudieron cargar tus tickets desde Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const enterSelectionMode = (initialId?: string) => {
    setSelectionMode(true);
    if (initialId) {
      setSelectedIds((prev) => (prev.includes(initialId) ? prev : [...prev, initialId]));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleTicketSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === tickets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(tickets.map((t) => t.id));
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    ticketId: string
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (selectionMode) return;

    longPressTriggeredRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };

    clearLongPressTimer();
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      enterSelectionMode(ticketId);
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pressStartRef.current) return;
    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
      clearLongPressTimer();
    }
  };

  const handleCardClick = (ticketId: string) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (selectionMode) {
      toggleTicketSelection(ticketId);
    } else {
      onSelectTicket(ticketId);
    }
  };

  const handleSingleTrashClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    clearLongPressTimer();
    setPendingDeleteIds([id]);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;

    setIsDeleting(true);
    setError(null);
    try {
      if (pendingDeleteIds.length === 1) {
        await db.tickets.delete(pendingDeleteIds[0]);
      } else {
        await db.tickets.deleteMany(pendingDeleteIds);
      }

      const deletedSet = new Set(pendingDeleteIds);
      setTickets((prev) => prev.filter((t) => !deletedSet.has(t.id)));
      setPendingDeleteIds(null);
      if (selectionMode) {
        exitSelectionMode();
      }
    } catch (err: any) {
      console.warn('Error deleting ticket(s):', err?.message || err);
      setError(err?.message || 'No se pudieron eliminar los tickets seleccionados.');
      setPendingDeleteIds(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const groupedTickets = tickets.reduce((acc: { [key: string]: Ticket[] }, ticket) => {
    const month = format(parseISO(ticket.date), 'MMMM yyyy', { locale: es });
    if (!acc[month]) acc[month] = [];
    acc[month].push(ticket);
    return acc;
  }, {});

  const deleteCount = pendingDeleteIds?.length || 0;

  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <header className="mb-6 flex items-center justify-between gap-3">
        {selectionMode ? (
          <>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {selectedIds.length === 0
                  ? 'Selecciona tickets'
                  : `${selectedIds.length} ${
                      selectedIds.length === 1 ? 'seleccionado' : 'seleccionados'
                    }`}
              </h1>
              <p className="text-xs text-gray-500">
                Toca los tickets que quieras eliminar
              </p>
            </div>
            <div className="flex items-center gap-2">
              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active-scale transition-colors"
                >
                  {selectedIds.length === tickets.length ? 'Ninguno' : 'Todos'}
                </button>
              )}
              <button
                type="button"
                onClick={exitSelectionMode}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 active-scale transition-colors flex items-center gap-1.5"
              >
                <X size={15} />
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mis Tickets</h1>
              <p className="text-sm text-gray-500">Gestiona y reparte tus gastos</p>
            </div>
            {tickets.length > 0 && (
              <button
                type="button"
                onClick={() => enterSelectionMode()}
                aria-label="Seleccionar tickets"
                className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-200 active-scale transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <CheckSquare size={18} />
                <span className="text-xs font-bold">Seleccionar</span>
              </button>
            )}
          </>
        )}
      </header>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs font-medium">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={loadTickets}
            className="font-black uppercase tracking-widest text-[10px] underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
          <RefreshCw size={32} className="mx-auto text-indigo-600 animate-spin mb-3" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Cargando tickets...
          </p>
        </div>
      ) : Object.keys(groupedTickets).length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300">
          <Receipt size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No hay tickets registrados aún.</p>
          <button
            type="button"
            onClick={onCreateTicket}
            className="mt-4 text-indigo-600 font-semibold underline"
          >
            Crea el primero ahora
          </button>
        </div>
      ) : (
        (Object.entries(groupedTickets) as [string, Ticket[]][]).map(([month, monthTickets]) => (
          <section key={month} className="mb-8">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
              {month}
            </h2>
            <div className="space-y-3">
              {monthTickets.map((ticket) => {
                const isSelected = selectedIds.includes(ticket.id);
                const merchantName =
                  ticket.merchant &&
                  ticket.merchant.trim() &&
                  ticket.merchant.trim().toLowerCase() !== 'null'
                    ? ticket.merchant.trim()
                    : 'Sin nombre';
                return (
                  <div
                    key={ticket.id}
                    onPointerDown={(e) => handleCardPointerDown(e, ticket.id)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onContextMenu={(e) => {
                      if (selectionMode) e.preventDefault();
                    }}
                    onClick={() => handleCardClick(ticket.id)}
                    className={`p-4 rounded-xl shadow-sm border flex items-center justify-between transition-colors cursor-pointer relative select-none ${
                      selectionMode && isSelected
                        ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-100'
                        : 'bg-white border-gray-100 active:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      {selectionMode && (
                        <div
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-gray-300'
                          }`}
                          aria-checked={isSelected}
                          role="checkbox"
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                      )}

                      <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">
                        <Store size={24} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {merchantName}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Calendar size={12} />
                          <span>
                            {format(parseISO(ticket.date), "dd 'de' MMM", { locale: es })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                      <span className="text-lg font-bold text-gray-900 tabular-nums">
                        {ticket.totalAmount.toLocaleString('es-ES', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </span>
                      {!selectionMode && (
                        <div className="flex items-center">
                          <button
                            type="button"
                            aria-label={`Eliminar ticket de ${merchantName}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => handleSingleTrashClick(e, ticket.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg active-scale transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                          <ChevronRight size={18} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Barra inferior de acciones en modo selección */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white border-t border-gray-200 px-5 py-4 flex items-center justify-between gap-4 z-[60] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
          <div className="text-sm font-bold text-gray-700">
            {selectedIds.length === 0
              ? '0 tickets seleccionados'
              : `${selectedIds.length} ${
                  selectedIds.length === 1 ? 'ticket seleccionado' : 'tickets seleccionados'
                }`}
          </div>
          <button
            type="button"
            disabled={selectedIds.length === 0 || isDeleting}
            onClick={() => setPendingDeleteIds([...selectedIds])}
            className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-200 active-scale disabled:opacity-40 disabled:shadow-none transition-colors"
          >
            <Trash2 size={16} />
            Eliminar ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Popup de confirmación de eliminación */}
      {pendingDeleteIds && pendingDeleteIds.length > 0 && (
        <div
          onClick={() => !isDeleting && setPendingDeleteIds(null)}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-gray-900">
                  Confirmar eliminación
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  ¿Eliminar {deleteCount} {deleteCount === 1 ? 'ticket' : 'tickets'}? Esta
                  acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDeleteIds(null)}
                className="flex-1 py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest active-scale disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-200 active-scale disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Borrando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketList;
