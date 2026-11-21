import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { Ticket, Category, TicketSortConfig, TicketStatus } from '../types';
import CategoryManagerModal from '../components/CategoryManagerModal';
import SortTicketsModal from '../components/SortTicketsModal';
import { computeRepartoCompleto, shareTicket } from '../utils/ticketShare';
import {
  Calendar,
  Store,
  Receipt,
  Trash2,
  AlertCircle,
  RefreshCw,
  CheckSquare,
  Check,
  X,
  Tag,
  ArrowUpDown,
  MoreVertical,
  CreditCard,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface TicketListProps {
  onSelectTicket: (id: string) => void;
  onCreateTicket: () => void;
  onSelectionModeChange?: (active: boolean) => void;
  sortConfig?: TicketSortConfig;
  onSortChange?: (sort: TicketSortConfig) => void;
}

const DEFAULT_SORT: TicketSortConfig = { field: 'date', direction: 'desc' };
const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 10;

const TicketList: React.FC<TicketListProps> = ({
  onSelectTicket,
  onCreateTicket,
  onSelectionModeChange,
  sortConfig: controlledSortConfig,
  onSortChange,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [localSortConfig, setLocalSortConfig] = useState<TicketSortConfig>(DEFAULT_SORT);
  const sortConfig = controlledSortConfig ?? localSortConfig;
  const setSortConfig = onSortChange ?? setLocalSortConfig;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

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
      const [ticketsRes, categoriesRes] = await Promise.allSettled([
        db.tickets.orderBy('date').reverse().toArray(),
        db.categories.toArray(),
      ]);

      if (ticketsRes.status === 'fulfilled') {
        setTickets(ticketsRes.value);
      } else {
        throw ticketsRes.reason;
      }

      if (categoriesRes.status === 'fulfilled') {
        setCategories(categoriesRes.value);
      } else {
        console.warn(
          'Error loading categories:',
          categoriesRes.reason?.message || categoriesRes.reason
        );
      }
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

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const filteredTickets =
    selectedCategoryIds.length === 0
      ? tickets
      : tickets.filter(
          (t) => Boolean(t.categoryId) && selectedCategoryIds.includes(t.categoryId!)
        );

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredTickets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTickets.map((t) => t.id));
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

  const handleShare = async (ticket: Ticket) => {
    setOpenMenuId(null);
    try {
      await shareTicket(ticket);
      if (!navigator.share) {
        setShareToast('Resumen copiado al portapapeles');
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch {
      // El usuario canceló el share — no es un error
    }
  };

  const handleUpdateStatus = async (id: string, status: TicketStatus) => {
    setOpenMenuId(null);
    try {
      const t = tickets.find((tk) => tk.id === id);
      if (!t) return;
      const updated = { ...t, status };
      await db.tickets.put(updated);
      setTickets((prev) => prev.map((tk) => (tk.id === id ? updated : tk)));
    } catch (err: any) {
      console.warn('Error updating ticket status:', err?.message || err);
    }
  };

  const getStatusBadge = (status?: TicketStatus) => {
    if (!status || status === 'borrador') return null;
    if (status === 'repartido') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-600">
          Repartido
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-100 text-green-700">
        Pagado
      </span>
    );
  };

  const getMerchantDisplayName = (ticket: Ticket): string =>
    ticket.merchant &&
    ticket.merchant.trim() &&
    ticket.merchant.trim().toLowerCase() !== 'null'
      ? ticket.merchant.trim()
      : 'Sin nombre';

  const sortedFilteredTickets = [...filteredTickets].sort((a, b) => {
    if (sortConfig.field === 'name') {
      const cmp = getMerchantDisplayName(a).localeCompare(
        getMerchantDisplayName(b),
        'es',
        { sensitivity: 'base' }
      );
      if (cmp !== 0) {
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      return b.createdAt - a.createdAt;
    }

    if (sortConfig.field === 'amount') {
      const cmp = a.totalAmount - b.totalAmount;
      if (cmp !== 0) {
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      return b.createdAt - a.createdAt;
    }

    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) {
      return sortConfig.direction === 'asc' ? dateCmp : -dateCmp;
    }
    return sortConfig.direction === 'asc'
      ? a.createdAt - b.createdAt
      : b.createdAt - a.createdAt;
  });

  const groupedTickets = sortedFilteredTickets.reduce(
    (acc: { [key: string]: Ticket[] }, ticket) => {
      const month = format(parseISO(ticket.date), 'MMMM yyyy', { locale: es });
      if (!acc[month]) acc[month] = [];
      acc[month].push(ticket);
      return acc;
    },
    {}
  );

  const isDefaultSort =
    sortConfig.field === 'date' && sortConfig.direction === 'desc';

  const categoryMap = new Map<string, string>(
    categories.map((cat) => [cat.id, cat.name])
  );
  const activeCategoryNames = selectedCategoryIds
    .map((id) => categoryMap.get(id))
    .filter((name): name is string => Boolean(name));

  const deleteCount = pendingDeleteIds?.length || 0;

  return (
    <div className="p-4 bg-gray-50 min-h-full" onClick={() => openMenuId && setOpenMenuId(null)}>
      <header className="mb-4 flex items-center justify-between gap-3">
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
              {filteredTickets.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active-scale transition-colors"
                >
                  {selectedIds.length === filteredTickets.length ? 'Ninguno' : 'Todos'}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSortModal(true)}
                  aria-label="Ordenar tickets"
                  className="relative p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-200 active-scale transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <ArrowUpDown size={18} />
                  <span className="text-xs font-bold">Ordenar</span>
                  {!isDefaultSort && (
                    <span
                      aria-label="Orden personalizado activo"
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-600 ring-2 ring-gray-50"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => enterSelectionMode()}
                  aria-label="Seleccionar tickets"
                  className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-200 active-scale transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <CheckSquare size={18} />
                  <span className="text-xs font-bold">Seleccionar</span>
                </button>
              </div>
            )}
          </>
        )}
      </header>

      {/* Fila horizontal de chips de categorías */}
      <div className="mb-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setShowCategoryManager(true)}
            aria-label="Gestionar categorías"
            className="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center shrink-0 shadow-sm active-scale transition-colors"
          >
            <Tag size={16} />
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategoryIds([])}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-colors active-scale ${
              selectedCategoryIds.length === 0
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200 hover:text-indigo-600'
            }`}
          >
            Todos
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategoryIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategoryFilter(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-colors active-scale ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {activeCategoryNames.length > 0 && (
          <p className="text-xs text-indigo-600 font-semibold mt-1.5 px-1">
            Categorías activas: {activeCategoryNames.join(', ')}
          </p>
        )}
      </div>

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
        selectedCategoryIds.length > 0 && tickets.length > 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 px-4">
            <Tag size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              No hay tickets en las categorías seleccionadas.
            </p>
            <button
              type="button"
              onClick={() => setSelectedCategoryIds([])}
              className="mt-4 text-indigo-600 text-sm font-semibold underline"
            >
              Ver todos los tickets
            </button>
          </div>
        ) : (
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
        )
      ) : sortConfig.field === 'date' ? (
        (Object.entries(groupedTickets) as [string, Ticket[]][]).map(([month, monthTickets]) => (
          <section key={month} className="mb-8">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
              {month}
            </h2>
            <div className="space-y-3">
              {monthTickets.map((ticket) => {
                const isSelected = selectedIds.includes(ticket.id);
                const merchantName = getMerchantDisplayName(ticket);
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
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar size={12} />
                            <span>
                              {format(parseISO(ticket.date), "dd 'de' MMM", { locale: es })}
                            </span>
                          </span>
                          {ticket.categoryId && categoryMap.has(ticket.categoryId) && (
                            <span className="text-indigo-600 font-semibold">
                              · {categoryMap.get(ticket.categoryId)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900 tabular-nums block">
                          {ticket.totalAmount.toLocaleString('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </span>
                        {getStatusBadge(ticket.status)}
                      </div>
                      {!selectionMode && (
                        <div className="relative">
                          <button
                            type="button"
                            aria-label={`Opciones de ${merchantName}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              clearLongPressTimer();
                              setOpenMenuId(openMenuId === ticket.id ? null : ticket.id);
                            }}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg active-scale transition-colors"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {openMenuId === ticket.id && (
                            <div
                              onPointerDown={(e) => e.stopPropagation()}
                              className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl min-w-[190px] py-2 overflow-hidden"
                            >
                              {(!ticket.status || ticket.status === 'borrador') && computeRepartoCompleto(ticket) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'repartido'); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
                                >
                                  <CreditCard size={16} />
                                  Marcar repartido
                                </button>
                              )}
                              {ticket.status === 'repartido' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleShare(ticket); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  >
                                    <Share2 size={16} />
                                    Compartir resumen
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'pagado'); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <Check size={16} />
                                    Marcar como pagado
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'borrador'); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                                  >
                                    <RotateCcw size={16} />
                                    Reabrir ticket
                                  </button>
                                </>
                              )}
                              {ticket.status === 'pagado' && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'borrador'); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  <RotateCcw size={16} />
                                  Reabrir ticket
                                </button>
                              )}
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleSingleTrashClick(e, ticket.id); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={16} />
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="space-y-3 pb-8">
          {sortedFilteredTickets.map((ticket) => {
            const isSelected = selectedIds.includes(ticket.id);
            const merchantName = getMerchantDisplayName(ticket);
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
                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={12} />
                        <span>
                          {format(parseISO(ticket.date), "dd 'de' MMM yyyy", { locale: es })}
                        </span>
                      </span>
                      {ticket.categoryId && categoryMap.has(ticket.categoryId) && (
                        <span className="text-indigo-600 font-semibold">
                          · {categoryMap.get(ticket.categoryId)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900 tabular-nums block">
                      {ticket.totalAmount.toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                    {getStatusBadge(ticket.status)}
                  </div>
                  {!selectionMode && (
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Opciones de ${merchantName}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          clearLongPressTimer();
                          setOpenMenuId(openMenuId === ticket.id ? null : ticket.id);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg active-scale transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openMenuId === ticket.id && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl min-w-[190px] py-2 overflow-hidden"
                        >
                          {(!ticket.status || ticket.status === 'borrador') && computeRepartoCompleto(ticket) && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'repartido'); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                              <CreditCard size={16} />
                              Marcar repartido
                            </button>
                          )}
                          {ticket.status === 'repartido' && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleShare(ticket); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                              >
                                <Share2 size={16} />
                                Compartir resumen
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'pagado'); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-green-600 hover:bg-green-50 transition-colors"
                              >
                                <Check size={16} />
                                Marcar como pagado
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'borrador'); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                <RotateCcw size={16} />
                                Reabrir ticket
                              </button>
                            </>
                          )}
                          {ticket.status === 'pagado' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(ticket.id, 'borrador'); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <RotateCcw size={16} />
                              Reabrir ticket
                            </button>
                          )}
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleSingleTrashClick(e, ticket.id); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
      <CategoryManagerModal
        isOpen={showCategoryManager}
        categories={categories}
        onClose={() => setShowCategoryManager(false)}
        onCategoriesUpdated={(updatedCategories, deletedCategoryId) => {
          setCategories(updatedCategories);
          if (deletedCategoryId) {
            setSelectedCategoryIds((prev) =>
              prev.filter((id) => id !== deletedCategoryId)
            );
            setTickets((prev) =>
              prev.map((t) =>
                t.categoryId === deletedCategoryId
                  ? { ...t, categoryId: undefined }
                  : t
              )
            );
          }
        }}
      />
      <SortTicketsModal
        isOpen={showSortModal}
        currentSort={sortConfig}
        onClose={() => setShowSortModal(false)}
        onApply={(nextSort) => setSortConfig(nextSort)}
      />

      {/* Toast de copiado al portapapeles (fallback cuando no hay navigator.share) */}
      {shareToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-xs font-bold px-5 py-3 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          {shareToast}
        </div>
      )}
    </div>
  );
};

export default TicketList;
