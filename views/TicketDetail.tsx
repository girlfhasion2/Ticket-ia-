import React, { useState, useEffect, useRef } from 'react';
import { db } from '../db';
import { Ticket, Person, TicketLine, Assignment, Category } from '../types';
import { parseTicketImage } from '../geminiService';
import {
  ArrowLeft, Camera, Images, Trash2, Plus, Users,
  AlertCircle, CheckCircle2, RefreshCw, UserPlus, X, Undo2, ArchiveX,
  Maximize2, Sparkles, MessageCircle, CreditCard, RotateCcw, Check, Download
} from 'lucide-react';
import LiveCameraModal from '../components/LiveCameraModal';
import { prepareReceiptImage } from '../utils/imageUtils';
import { formatMoney, formatPriceForInput } from '../utils/format';

const UnitsStepper: React.FC<{
  value: number;
  canIncrease: boolean;
  onChange: (value: number) => void;
}> = ({ value, canIncrease, onChange }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      aria-label="Quitar una unidad"
      disabled={value <= 1}
      onClick={() => onChange(value - 1)}
      className="w-9 h-9 rounded-xl border-[1.5px] border-indigo-200 bg-indigo-50 text-indigo-600 text-lg font-black active-scale disabled:opacity-30"
    >
      −
    </button>
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      className="w-12 bg-gray-50 border border-gray-200 rounded-lg py-1.5 text-center font-black text-indigo-600 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <button
      type="button"
      aria-label="Añadir una unidad"
      disabled={!canIncrease}
      onClick={() => onChange(value + 1)}
      className="w-9 h-9 rounded-xl border-[1.5px] border-indigo-200 bg-indigo-50 text-indigo-600 text-lg font-black active-scale disabled:opacity-30"
    >
      +
    </button>
  </div>
);

/** Zona realmente visible de la pantalla (se reduce cuando aparece el teclado del móvil). */
const useVisualViewportBox = (active: boolean) => {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) { setBox(null); return; }
    const update = () => setBox({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return box;
};

const PriceInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const [text, setText] = useState(() => formatPriceForInput(value));
  const [focused, setFocused] = useState(false);

  // Mientras no se está editando, el texto sigue al valor guardado (coma decimal, sin ceros sobrantes)
  useEffect(() => {
    if (!focused) setText(formatPriceForInput(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*([.,]\d{0,2})?$/.test(raw)) return; // solo números y como máximo 2 decimales
        setText(raw.replace('.', ','));
        const n = parseFloat(raw.replace(',', '.'));
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={className}
    />
  );
};

interface TicketDetailProps {
  ticketId: string;
  initialTicket?: Ticket;
  onBack: () => void;
}

const TicketDetail: React.FC<TicketDetailProps> = ({ ticketId, initialTicket, onBack }) => {
  const [ticket, setTicket] = useState<Ticket | null>(
    initialTicket
      ? { ...initialTicket, discardedLines: initialTicket.discardedLines || [] }
      : null
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'split' | 'summary'>('info');
  const [splitFilter, setSplitFilter] = useState<'all' | 'pending'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingLineModal, setPendingLineModal] = useState<string | null>(null);
  const [personDetailModal, setPersonDetailModal] = useState<string | null>(null);
  const [newLineModal, setNewLineModal] = useState<{ name: string; quantity: number; price: string } | null>(null);
  const newLineBox = useVisualViewportBox(!!newLineModal);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const newLinePriceRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const isPersistedRef = useRef<boolean>(!initialTicket);
  const pendingSaveRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (initialTicket && initialTicket.id === ticketId) {
      isPersistedRef.current = false;
      setTicket({
        ...initialTicket,
        discardedLines: initialTicket.discardedLines || [],
      });
      return;
    }

    isPersistedRef.current = true;
    const loadData = async () => {
      const t = await db.tickets.get(ticketId);
      if (t) {
        if (!t.discardedLines) t.discardedLines = [];
        setTicket(t);
      } else {
        onBack();
      }
    };
    loadData();
  }, [ticketId, initialTicket]);

  useEffect(() => {
    let active = true;
    db.categories
      .toArray()
      .then((cats) => {
        if (active) setCategories(cats);
      })
      .catch(() => {
        // Ignore if categories table is not ready yet
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ticket) return <div className="p-8 text-center font-medium text-gray-500 italic">Cargando ticket...</div>;

  const ticketHasUsefulData = (t: Ticket): boolean => {
    return t.participants.length > 0 || t.lines.length > 0 || !!t.imageBase64;
  };

  const persistTicket = (ticketToSave: Ticket): Promise<void> => {
    setTicket(ticketToSave);
    const shouldSave = isPersistedRef.current || ticketHasUsefulData(ticketToSave);
    if (!shouldSave) {
      return Promise.resolve();
    }
    isPersistedRef.current = true;
    const nextSave = pendingSaveRef.current
      .catch(() => {})
      .then(async () => {
        await db.tickets.put(ticketToSave);
      });
    pendingSaveRef.current = nextSave;
    return nextSave;
  };

  const saveTicketAndSyncTotal = async (updated: Ticket) => {
    const newSum = Number(updated.lines.reduce((sum, l) => sum + l.total, 0).toFixed(2));
    const ticketWithCorrectTotal = { ...updated, totalAmount: newSum };
    await persistTicket(ticketWithCorrectTotal);
  };

  const handleBack = async () => {
    try {
      await pendingSaveRef.current;
    } catch {
      // Ignore save errors on navigation back
    }
    onBack();
  };

  const runOcrOnImage = async (targetTicket: Ticket, base64Image: string) => {
    setOcrError(null);
    setIsProcessing(true);
    try {
      const parsed = await parseTicketImage(base64Image);
      const newLines: TicketLine[] = (parsed.items || []).map((item) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: Math.max(1, Math.round(item.quantity || 1)),
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || 0,
        assignments: []
      }));

      const cleanedParsedMerchant =
        parsed.merchant && parsed.merchant.trim() && parsed.merchant.trim().toLowerCase() !== 'null'
          ? parsed.merchant.trim()
          : '';
      const cleanedTargetMerchant =
        targetTicket.merchant &&
        targetTicket.merchant.trim() &&
        targetTicket.merchant.trim().toLowerCase() !== 'null'
          ? targetTicket.merchant.trim()
          : '';

      const nextTicket: Ticket = {
        ...targetTicket,
        imageBase64: base64Image,
        merchant: cleanedParsedMerchant || cleanedTargetMerchant,
        lines: newLines,
        discardedLines: []
      };

      await saveTicketAndSyncTotal(nextTicket);

      if (newLines.length === 0) {
        setOcrError(
          "La IA no detectó productos en esta imagen. Prueba con una foto más nítida o añádelos manualmente en la pestaña Productos."
        );
      } else {
        setActiveTab('items');
      }
    } catch (error: any) {
      console.error("AI Parsing error", error);
      setOcrError(
        error?.message ||
          "No se pudo procesar automáticamente. La imagen se ha guardado y puedes editar los productos manualmente."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const processImageSource = async (source: File | string) => {
    setOcrError(null);
    setIsProcessing(true);
    try {
      const normalizedBase64 = await prepareReceiptImage(source);
      const updatedTicket: Ticket = { ...ticket, imageBase64: normalizedBase64 };
      await persistTicket(updatedTicket);
      await runOcrOnImage(updatedTicket, normalizedBase64);
    } catch (error: any) {
      console.error("Image processing error", error);
      setOcrError(error?.message || "No se pudo cargar la imagen seleccionada.");
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processImageSource(file);
  };

  const handleDropImage = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processImageSource(file);
    }
  };

  const saveImageToDevice = async () => {
    if (!ticket.imageBase64) return;
    try {
      const blob = await (await fetch(ticket.imageBase64)).blob();
      const baseName = (ticket.merchant || 'ticket')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'ticket';
      const fileName = `${baseName}-${ticket.date || 'foto'}.jpg`;
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

      // Hoja de compartir del sistema (permite "Guardar imagen" en la galería)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }

      // Alternativa: descarga normal
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      if (error?.name === 'AbortError') return; // el usuario cerró la hoja de compartir
      console.error('Error al guardar la imagen', error);
      setOcrError('No se pudo guardar la foto en el dispositivo.');
    }
  };

  const removeTicketImage = async () => {
    const updatedTicket: Ticket = { ...ticket, imageBase64: undefined };
    await persistTicket(updatedTicket);
    setOcrError(null);
  };

  const openAddLineModal = () => setNewLineModal({ name: '', quantity: 1, price: '' });

  const parsePrice = (raw: string): number => {
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const confirmAddLine = async () => {
    if (!newLineModal) return;
    const name = newLineModal.name.trim();
    const price = parsePrice(newLineModal.price);
    const quantity = Math.max(1, Math.round(newLineModal.quantity || 1));
    if (!name || !Number.isFinite(price) || price < 0) return;

    const newLine: TicketLine = {
      id: crypto.randomUUID(),
      description: name,
      quantity,
      unitPrice: price,
      total: Math.round(quantity * price * 100) / 100,
      assignments: []
    };
    setNewLineModal(null);
    await saveTicketAndSyncTotal({ ...ticket, lines: [...ticket.lines, newLine] });
    // Lleva la vista al producto recién añadido, al final de la lista
    setTimeout(() => {
      document.getElementById(`line-${newLine.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const updateLine = (lineId: string, data: Partial<TicketLine>) => {
    let currentDiscarded = [...(ticket.discardedLines || [])];
    const newLines = ticket.lines.map(l => {
      if (l.id === lineId) {
        const updatedLine = { ...l, ...data };
        if (data.quantity !== undefined && data.quantity < l.quantity) {
          const diff = l.quantity - data.quantity;
          const discardedLine: TicketLine = {
            id: crypto.randomUUID(),
            description: `${l.description} (Sobrante)`,
            quantity: diff,
            unitPrice: l.unitPrice,
            total: Number((diff * l.unitPrice).toFixed(2)),
            assignments: []
          };
          currentDiscarded = [discardedLine, ...currentDiscarded];
        }
        if (data.quantity !== undefined || data.unitPrice !== undefined) {
          updatedLine.total = Number((updatedLine.quantity * (data.unitPrice ?? l.unitPrice)).toFixed(2));
        }
        return updatedLine;
      }
      return l;
    });
    saveTicketAndSyncTotal({ ...ticket, lines: newLines, discardedLines: currentDiscarded });
  };

  const discardLine = (lineId: string) => {
    const lineToDiscard = ticket.lines.find(l => l.id === lineId);
    if (!lineToDiscard) return;
    saveTicketAndSyncTotal({
      ...ticket,
      lines: ticket.lines.filter(l => l.id !== lineId),
      discardedLines: [lineToDiscard, ...(ticket.discardedLines || [])]
    });
  };

  const restoreLine = (lineId: string) => {
    const lineToRestore = ticket.discardedLines.find(l => l.id === lineId);
    if (!lineToRestore) return;
    saveTicketAndSyncTotal({
      ...ticket,
      discardedLines: ticket.discardedLines.filter(l => l.id !== lineId),
      lines: [...ticket.lines, lineToRestore]
    });
  };

  const deletePermanently = (lineId: string) => {
    saveTicketAndSyncTotal({
      ...ticket,
      discardedLines: (ticket.discardedLines || []).filter(l => l.id !== lineId)
    });
  };

  const addLocalParticipant = (name: string) => {
    if (!name.trim()) return;
    const newPerson: Person = { id: crypto.randomUUID(), name: name.trim() };
    saveTicketAndSyncTotal({ ...ticket, participants: [...ticket.participants, newPerson] });
    setNewParticipantName("");
  };

  const removeLocalParticipant = (id: string) => {
    const participants = ticket.participants.filter(p => p.id !== id);
    const lines = ticket.lines.map(line => ({
      ...line,
      assignments: line.assignments.map(asgn => ({
        ...asgn,
        personIds: asgn.personIds.filter(pid => pid !== id)
      })).filter(asgn => asgn.personIds.length > 0)
    }));
    saveTicketAndSyncTotal({ ...ticket, participants, lines });
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await pendingSaveRef.current.catch(() => {});
      if (isPersistedRef.current) {
        await db.tickets.delete(ticket.id);
      }
      setShowDeleteConfirm(false);
      onBack();
    } catch (err: any) {
      setDeleteError(err?.message || 'No se pudo eliminar el ticket.');
      setIsDeleting(false);
    }
  };

  const addAssignment = (lineId: string) => {
    const lines = ticket.lines.map(l => {
      if (l.id === lineId) {
        const consumedInGroups = l.assignments.reduce((sum, a) => sum + a.units, 0);
        const remainingToGroup = Math.max(0, l.quantity - consumedInGroups);
        if (remainingToGroup <= 0) return l;
        const newAssignment: Assignment = { id: crypto.randomUUID(), units: Math.floor(remainingToGroup), personIds: [] };
        return { ...l, assignments: [...l.assignments, newAssignment] };
      }
      return l;
    });
    saveTicketAndSyncTotal({ ...ticket, lines });
  };

  const updateAssignment = (lineId: string, assignmentId: string, data: Partial<Assignment>) => {
    const lines = ticket.lines.map(l => {
      if (l.id === lineId) {
        const assignments = l.assignments.map(a => a.id === assignmentId ? { ...a, ...data } : a);
        return { ...l, assignments };
      }
      return l;
    });
    saveTicketAndSyncTotal({ ...ticket, lines });
  };

  const deleteAssignment = (lineId: string, assignmentId: string) => {
    const lines = ticket.lines.map(l => {
      if (l.id === lineId) {
        return { ...l, assignments: l.assignments.filter(a => a.id !== assignmentId) };
      }
      return l;
    });
    saveTicketAndSyncTotal({ ...ticket, lines });
  };

  const gcd = (a: number, b: number): number => {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y !== 0) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };

  const formatShareQuantity = (num: number, den: number): string => {
    const g = gcd(num, den);
    const n = num / g;
    const d = den / g;
    const whole = Math.floor(n / d);
    const rem = n % d;

    if (rem === 0) {
      return whole <= 1 ? '' : ` (×${whole})`;
    }
    if (whole === 0) {
      return ` (×${rem}/${d})`;
    }
    return ` (×${whole}+${rem}/${d})`;
  };

  const formatShareText = (num: number, den: number): string => {
    const g = gcd(num, den);
    const n = num / g;
    const d = den / g;
    const whole = Math.floor(n / d);
    const rem = n % d;
    if (rem === 0) return `${whole}`;
    if (whole === 0) return `${rem}/${d}`;
    return `${whole} + ${rem}/${d}`;
  };

  const userTotals: { [key: string]: number } = {};
  const personAssignedItems: Record<
    string,
    Map<string, { description: string; num: number; den: number; amount: number }>
  > = {};
  ticket.participants.forEach((p) => {
    userTotals[p.id] = 0;
    personAssignedItems[p.id] = new Map();
  });
  const pendingAssignments: { lineId: string; description: string; units: number }[] = [];

  ticket.lines.forEach((line) => {
    const unitsAssignedToPeople = line.assignments.reduce(
      (sum, a) => (a.personIds.length > 0 ? sum + a.units : sum),
      0
    );
    const lineRemaining = line.quantity - unitsAssignedToPeople;
    if (lineRemaining > 0) {
      pendingAssignments.push({ lineId: line.id, description: line.description, units: lineRemaining });
    }
    line.assignments.forEach((asgn) => {
      if (asgn.personIds.length === 0 || asgn.units <= 0) return;
      const groupTotal = asgn.units * line.unitPrice;
      const perPerson = groupTotal / asgn.personIds.length;
      const addNum = Number.isInteger(asgn.units)
        ? asgn.units
        : Math.round(asgn.units * 100);
      const addDen = Number.isInteger(asgn.units)
        ? asgn.personIds.length
        : 100 * asgn.personIds.length;

      asgn.personIds.forEach((pId) => {
        userTotals[pId] = (userTotals[pId] || 0) + perPerson;
        if (!personAssignedItems[pId]) personAssignedItems[pId] = new Map();
        const existing = personAssignedItems[pId].get(line.id);
        if (existing) {
          const rawNum = existing.num * addDen + addNum * existing.den;
          const rawDen = existing.den * addDen;
          const g = gcd(rawNum, rawDen);
          existing.num = rawNum / g;
          existing.den = rawDen / g;
          existing.amount += perPerson;
        } else {
          const g = gcd(addNum, addDen);
          personAssignedItems[pId].set(line.id, {
            description: line.description,
            num: addNum / g,
            den: addDen / g,
            amount: perPerson,
          });
        }
      });
    });
  });

  const totalRepartido = Object.values(userTotals).reduce((a, b) => a + b, 0);
  const isRepartoCompleto =
    pendingAssignments.length === 0 && Math.abs(totalRepartido - ticket.totalAmount) < 0.01;
  const pendingCount = ticket.lines.filter((line) => {
    const assigned = line.assignments.reduce(
      (s, a) => (a.personIds.length > 0 ? s + a.units : s),
      0
    );
    return line.quantity - assigned > 0.001;
  }).length;
  const showSplitProgress = ticket.lines.length > 0 && ticket.participants.length > 0;

  const handleStatusChange = async (newStatus: 'borrador' | 'repartido' | 'pagado') => {
    const updated = { ...ticket, status: newStatus };
    await persistTicket(updated);
  };

  const merchantDisplayName =
    ticket.merchant && ticket.merchant.trim() && ticket.merchant.trim().toLowerCase() !== 'null'
      ? ticket.merchant.trim()
      : 'Sin nombre';

  const merchantInputValue =
    ticket.merchant && ticket.merchant.toLowerCase() !== 'null' ? ticket.merchant : '';

  const participantsWithItems = ticket.participants.filter(
    (p) => (personAssignedItems[p.id]?.size || 0) > 0
  );
  const hasAssignedItems = participantsWithItems.length > 0;

  const whatsappUrl = (() => {
    if (!hasAssignedItems) return '';
    const sections: string[] = [
      `*${merchantDisplayName}*`,
      `${ticket.date} · Total: ${formatMoney(ticket.totalAmount)}`,
    ];

    participantsWithItems.forEach((p) => {
      const items = Array.from(personAssignedItems[p.id]?.values() || []);
      const personLines = items.map(
        (item) =>
          `  • ${item.description}${formatShareQuantity(item.num, item.den)} — ${formatMoney(item.amount)}`
      );
      const total = formatMoney(userTotals[p.id] || 0);
      sections.push('', [`*${p.name} — ${total}*`, ...personLines].join('\n'));
    });

    return `https://wa.me/?text=${encodeURIComponent(sections.join('\n'))}`;
  })();

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20 shrink-0">
        <button type="button" onClick={handleBack} className="p-3 -ml-2 text-gray-500 hover:text-indigo-600 active-scale">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 px-2 text-center overflow-hidden">
          <h2 className="font-black truncate text-gray-900 leading-tight">{merchantDisplayName}</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{ticket.date}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setShowDeleteConfirm(true);
          }}
          aria-label="Eliminar ticket"
          className="p-3 -mr-2 text-red-400 hover:text-red-600 active-scale"
        >
          <Trash2 size={24} />
        </button>
      </header>

      <div className="flex border-b border-gray-100 text-[10px] sm:text-xs font-black sticky top-[68px] bg-white z-20 shrink-0 uppercase tracking-wider sm:tracking-widest shadow-sm">
        {(['info', 'items', 'split', 'summary'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const isSplitTabWithProgress = tab === 'split' && showSplitProgress;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 min-w-0 py-4 px-1 flex items-center justify-center whitespace-nowrap transition-colors ${
                isActive ? 'text-indigo-600 bg-indigo-50/30' : 'text-gray-400'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1 h-[18px] leading-none">
                <span>
                  {tab === 'info' && 'General'}
                  {tab === 'items' && 'Productos'}
                  {tab === 'split' && 'Reparto'}
                  {tab === 'summary' && 'Resumen'}
                </span>
                {isSplitTabWithProgress && (
                  pendingCount > 0 ? (
                    <span
                      aria-label={`${pendingCount} productos pendientes`}
                      className={`min-w-[17px] h-[17px] rounded-full bg-amber-400 text-amber-950 text-[10px] font-black leading-none inline-flex items-center justify-center shrink-0 tabular-nums ${
                        pendingCount > 9 ? 'px-1' : ''
                      }`}
                    >
                      {pendingCount}
                    </span>
                  ) : (
                    <span
                      aria-label="Todo repartido"
                      className="w-[17px] h-[17px] rounded-full bg-green-600 text-white inline-flex items-center justify-center shrink-0"
                    >
                      <Check size={11} strokeWidth={3.5} />
                    </span>
                  )
                )}
              </span>

              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'info' && (
          <div className="space-y-6 pb-10">
            <div className="bg-gray-50 p-5 rounded-2xl space-y-5 border border-gray-100 shadow-inner">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Establecimiento</label>
                <input type="text" placeholder="Sin nombre" value={merchantInputValue} onChange={(e) => saveTicketAndSyncTotal({...ticket, merchant: e.target.value})} className="w-full bg-transparent border-b border-gray-200 py-1 font-bold text-xl text-indigo-900 focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="ticket-category-select"
                  className="text-[10px] font-black text-gray-400 uppercase tracking-widest block"
                >
                  Categoría
                </label>
                <select
                  id="ticket-category-select"
                  value={ticket.categoryId || ''}
                  onChange={(e) =>
                    saveTicketAndSyncTotal({
                      ...ticket,
                      categoryId: e.target.value || undefined,
                    })
                  }
                  className="w-full bg-transparent border-b border-gray-200 py-1.5 font-bold text-sm text-gray-700 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Fecha</label>
                  <input type="date" value={ticket.date} onChange={(e) => saveTicketAndSyncTotal({...ticket, date: e.target.value})} className="w-full bg-transparent border-b border-gray-200 py-1 font-bold text-gray-700 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Total Ticket (€)</label>
                  <div className="text-2xl font-black text-gray-900 py-1">{formatMoney(ticket.totalAmount)}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-5 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-indigo-600" />
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Participantes</label>
                </div>
                <div className="bg-indigo-600 text-white text-[11px] font-black px-4 py-1.5 rounded-full">
                  {ticket.participants.length} PERSONAS
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ticket.participants.map(p => (
                  <div key={p.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-bold text-indigo-700">
                    {p.name}
                    <button onClick={() => removeLocalParticipant(p.id)} className="hover:text-red-500 active-scale p-0.5">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <input type="text" placeholder="Añadir nombre..." value={newParticipantName} onChange={(e) => setNewParticipantName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLocalParticipant(newParticipantName)} className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold outline-none border border-transparent focus:border-indigo-200 focus:bg-white transition-all shadow-inner" />
                <button onClick={() => addLocalParticipant(newParticipantName)} className="bg-indigo-600 text-white px-5 rounded-xl active-scale shadow-md"><Plus size={24} /></button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Imagen del Ticket
                </label>
                {ticket.imageBase64 && (
                  <button
                    type="button"
                    onClick={removeTicketImage}
                    disabled={isProcessing}
                    className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest active-scale disabled:opacity-40"
                  >
                    Quitar foto
                  </button>
                )}
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-3 p-4 bg-indigo-600 rounded-2xl text-white shadow-lg">
                  <RefreshCw className="animate-spin shrink-0" size={20} />
                  <span className="text-xs font-black tracking-widest uppercase">
                    Analizando ticket con IA...
                  </span>
                </div>
              )}

              {ocrError && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs font-medium leading-relaxed">
                    {ocrError}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcrError(null)}
                    className="text-amber-500 hover:text-amber-700 p-0.5"
                    aria-label="Cerrar aviso"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {ticket.imageBase64 ? (
                <div className="space-y-3">
                  <div
                    onClick={() => !isProcessing && setShowImageLightbox(true)}
                    className="relative rounded-3xl border border-gray-200 bg-gray-900/5 overflow-hidden cursor-pointer group shadow-inner"
                  >
                    <img
                      src={ticket.imageBase64}
                      alt={`Ticket de ${merchantDisplayName}`}
                      className="w-full max-h-96 object-contain mx-auto"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-indigo-950/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 text-white p-4">
                        <RefreshCw className="animate-spin" size={32} />
                        <span className="text-xs font-black uppercase tracking-widest text-center">
                          Extrayendo productos...
                        </span>
                      </div>
                    )}
                    {!isProcessing && (
                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Maximize2 size={12} />
                        Ampliar
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowCameraModal(true)}
                      className="py-3.5 px-4 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active-scale disabled:opacity-50"
                    >
                      <Camera size={18} />
                      Nueva Foto
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => galleryInputRef.current?.click()}
                      className="py-3.5 px-4 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale disabled:opacity-50"
                    >
                      <Images size={18} />
                      De Galería
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                      onClick={() => ticket.imageBase64 && runOcrOnImage(ticket, ticket.imageBase64)}
                    className="w-full py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale disabled:opacity-50 transition-colors"
                  >
                    <Sparkles size={16} className="text-indigo-600" />
                    Re-escanear ticket con IA
                  </button>

                  <button
                    type="button"
                    onClick={saveImageToDevice}
                    className="w-full py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale transition-colors"
                  >
                    <Download size={16} className="text-indigo-600" />
                    Guardar foto en el dispositivo
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDropImage}
                  className={`rounded-3xl border-2 border-dashed p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-colors shadow-inner ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/70'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4">
                    <Camera size={32} />
                  </div>
                  <p className="text-sm font-bold text-gray-800 mb-1">
                    Escanear Ticket con IA
                  </p>
                  <p className="text-xs text-gray-500 mb-6 max-w-xs leading-relaxed">
                    Captura el ticket en directo con la cámara o carga una foto desde tu galería.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowCameraModal(true)}
                      className="py-4 px-5 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-200 active-scale disabled:opacity-50"
                    >
                      <Camera size={20} />
                      Cámara en Directo
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => galleryInputRef.current?.click()}
                      className="py-4 px-5 rounded-2xl bg-white text-indigo-700 border-2 border-indigo-100 hover:border-indigo-200 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm active-scale disabled:opacity-50"
                    >
                      <Images size={20} />
                      Subir de Galería
                    </button>
                  </div>
                </div>
              )}

              {/* Gallery input (NO capture attribute -> opens photo library / file picker) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Native camera fallback input (WITH capture="environment" for mobile fallback) */}
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="space-y-6 pb-40 animate-in fade-in duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2 pt-2">
                <h3 className="font-black text-gray-900 uppercase text-[10px] tracking-widest flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500" />Productos en la cuenta</h3>
                <button onClick={openAddLineModal} className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 bg-indigo-50 px-4 py-2.5 rounded-xl active-scale shadow-sm ring-2 ring-indigo-100"><Plus size={14} /> AÑADIR</button>
              </div>
              <div className="space-y-3">
                {ticket.lines.map(line => (
                  <div key={line.id} id={`line-${line.id}`} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md animate-in slide-in-from-left-2">
                    <div className="mb-3"><input type="text" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} className="w-full font-bold text-gray-800 text-sm outline-none border-b border-transparent focus:border-indigo-100 py-1 transition-colors" /></div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center bg-gray-50 rounded-lg px-2 py-1.5 gap-2 ring-1 ring-gray-100">
                        <input type="number" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })} className="w-8 bg-transparent font-black text-xs text-center outline-none text-indigo-600" />
                        <span className="text-gray-400 text-[10px] font-bold">x</span>
                        <div className="flex items-center"><PriceInput value={line.unitPrice} onChange={(v) => updateLine(line.id, { unitPrice: v })} className="w-14 bg-transparent font-black text-xs text-gray-600 outline-none text-right" /><span className="text-[10px] font-bold text-gray-400 ml-0.5">€</span></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-gray-900 text-base tabular-nums">{formatMoney(line.total)}</span>
                        <button onClick={() => discardLine(line.id)} className="text-gray-400 hover:text-red-500 p-2 active-scale transition-colors bg-gray-100 rounded-lg"><ArchiveX size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {ticket.discardedLines && ticket.discardedLines.length > 0 && (
              <div className="mt-12 space-y-4 pt-8 border-t-2 border-dashed border-gray-100">
                <h3 className="font-black text-gray-400 uppercase text-[10px] tracking-widest px-2">Productos Descartados</h3>
                <div className="space-y-2">
                  {ticket.discardedLines.map(line => (
                    <div key={line.id} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-200 flex items-center justify-between opacity-60 grayscale scale-[0.98] transition-all hover:opacity-80">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-bold text-gray-500 text-xs truncate line-through italic">{line.description}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">{line.quantity} uds × {formatMoney(line.unitPrice)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-gray-400 text-sm line-through tabular-nums">{formatMoney(line.total)}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => restoreLine(line.id)} className="bg-indigo-50 text-indigo-600 p-2 rounded-lg active-scale"><Undo2 size={16} /></button>
                          <button onClick={() => deletePermanently(line.id)} className="text-gray-300 hover:text-red-600 p-2 active-scale"><X size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto p-4 bg-white/60 backdrop-blur-xl border-t border-gray-100 z-30">
              <div className="p-5 rounded-3xl flex items-center justify-between shadow-2xl bg-indigo-600 text-white">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total de la Cuenta</p>
                  <p className="text-3xl font-black tabular-nums">{formatMoney(ticket.totalAmount)}</p>
                </div>
                <div className="text-right border-l border-white/20 pl-6">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Productos</p>
                  <p className="text-lg font-bold tabular-nums">{ticket.lines.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'split' && (
          <div className="pb-20 animate-in fade-in duration-300">
             {ticket.participants.length === 0 ? (
               <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 m-4">
                 <UserPlus size={48} className="mx-auto text-gray-300 mb-4" />
                 <p className="text-gray-500 font-bold px-8">Añade participantes en General para repartir.</p>
                 <button onClick={() => setActiveTab('info')} className="bg-indigo-600 text-white font-black text-[10px] px-8 py-4 rounded-full mt-6 active-scale uppercase tracking-widest shadow-lg">Añadir Personas</button>
               </div>
             ) : (() => {
               const visibleLines = splitFilter === 'pending'
                 ? ticket.lines.filter(line => {
                     const assigned = line.assignments.reduce((s, a) => a.personIds.length > 0 ? s + a.units : s, 0);
                     return line.quantity - assigned > 0.001;
                   })
                 : ticket.lines;
               return (
                 <>
                   {/* Chips de filtro */}
                   <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                     <button
                       onClick={() => setSplitFilter('all')}
                       className={`px-4 py-1.5 rounded-full text-[11px] font-black border transition-all ${splitFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}
                     >
                       Todos
                     </button>
                     <button
                       onClick={() => setSplitFilter('pending')}
                       className={`px-4 py-1.5 rounded-full text-[11px] font-black border transition-all ${splitFilter === 'pending' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}
                     >
                       Pendientes {pendingCount > 0 && `(${pendingCount})`}
                     </button>
                   </div>

                   {/* Lista de productos */}
                   <div className="space-y-6 pt-4">
                     {visibleLines.length === 0 && (
                       <div className="text-center py-16 text-gray-400 font-bold text-sm">Todo repartido</div>
                     )}
                     {visibleLines.map(line => {
                       const unitsAssignedToPeople = line.assignments.reduce((sum, a) => a.personIds.length > 0 ? sum + a.units : sum, 0);
                       const pendingUnits = Math.max(0, line.quantity - unitsAssignedToPeople);
                       const isFullyAssigned = pendingUnits <= 0;
                       return (
                         <div key={line.id} className={`border rounded-3xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 transition-all ${isFullyAssigned ? 'bg-green-50 border-green-100 opacity-75' : 'bg-white border-gray-100'}`}>
                           <div className={`p-4 flex justify-between items-center text-white transition-colors duration-500 ${isFullyAssigned ? 'bg-green-600' : 'bg-indigo-900'}`}>
                             <div className="flex items-center gap-2 max-w-[70%]">
                               <div>
                                 <h4 className={`font-black text-xs uppercase truncate ${isFullyAssigned ? 'opacity-80' : ''}`}>{line.description}</h4>
                                 <p className="text-[10px] opacity-70 font-bold">{line.quantity} uds × {formatMoney(line.unitPrice)}</p>
                               </div>
                             </div>
                             <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest shadow-inner flex items-center justify-center ${isFullyAssigned ? 'bg-white/20' : 'bg-amber-500 animate-pulse'}`}>
                               {isFullyAssigned ? <Check size={16} strokeWidth={3} /> : `${pendingUnits} PEND.`}
                             </div>
                           </div>
                           <div className="p-4 space-y-4 bg-gray-50/30">
                             {line.assignments.map(asgn => (
                               <div key={asgn.id} className={`p-4 border rounded-2xl animate-in slide-in-from-left-2 duration-200 shadow-sm ${asgn.personIds.length > 0 ? 'bg-white border-gray-100' : 'bg-amber-50/50 border-amber-100'}`}>
                                 <div className="flex items-center justify-between mb-4">
                                   <div className="flex flex-col">
                                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Unidades</span>
                                     <UnitsStepper
                                       value={asgn.units}
                                       canIncrease={line.assignments.reduce((sum, a) => sum + a.units, 0) < line.quantity}
                                       onChange={(v) => updateAssignment(line.id, asgn.id, { units: v })}
                                     />
                                   </div>
                                   <button onClick={() => deleteAssignment(line.id, asgn.id)} className="text-gray-300 hover:text-red-500 p-2 active-scale transition-colors bg-gray-100/50 rounded-xl">
                                     <Trash2 size={18} />
                                   </button>
                                 </div>
                                 <div className="flex flex-wrap gap-2">
                                   {ticket.participants.map(p => {
                                     const isSelected = asgn.personIds.includes(p.id);
                                     return (
                                       <button key={p.id} onClick={() => {
                                         const newPids = isSelected ? asgn.personIds.filter(id => id !== p.id) : [...asgn.personIds, p.id];
                                         updateAssignment(line.id, asgn.id, { personIds: newPids });
                                       }} className={`px-4 py-2 rounded-xl text-[11px] font-black border transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'} active-scale`}>
                                         {p.name}
                                       </button>
                                     );
                                   })}
                                 </div>
                               </div>
                             ))}
                             {line.assignments.reduce((sum, a) => sum + a.units, 0) < line.quantity && (
                               <button onClick={() => addAssignment(line.id)} className="w-full border-2 border-dashed border-indigo-100 bg-white/80 rounded-2xl py-4 text-[10px] font-black text-indigo-400 uppercase tracking-widest active-scale">+ NUEVO GRUPO DE REPARTO</button>
                             )}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </>
               );
             })()}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            <div className={`rounded-[2rem] p-8 text-white shadow-2xl transition-colors duration-700 ${isRepartoCompleto ? 'bg-green-600' : 'bg-indigo-700'}`}>
              <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-center">Resumen de Cuenta</p>
              <h2 className="text-6xl font-black mb-6 tracking-tighter text-center tabular-nums">{formatMoney(totalRepartido)}</h2>
              <div className="h-4 bg-black/10 rounded-full overflow-hidden p-1">
                <div className="h-full bg-white rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, (totalRepartido / ticket.totalAmount) * 100)}%` }} />
              </div>
              <div className="mt-6 flex justify-between text-[11px] font-black uppercase tracking-widest opacity-80">
                <span className="bg-black/20 px-3 py-1 rounded-full">TICKET: {formatMoney(ticket.totalAmount)}</span>
                <span className={`px-3 py-1 rounded-full ${isRepartoCompleto ? 'bg-white/20' : 'bg-amber-500'}`}>{isRepartoCompleto ? 'TODO OK' : `REPARTIDO: ${formatMoney(totalRepartido)}`}</span>
              </div>
            </div>

            {pendingAssignments.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-100 p-6 rounded-3xl animate-in shake duration-500">
                <div className="flex items-center gap-3 text-amber-800 mb-5 font-black text-xs uppercase tracking-widest"><AlertCircle size={20} />Faltan repartos</div>
                <div className="space-y-3">
                  {pendingAssignments.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPendingLineModal(p.lineId)}
                      className="w-full flex justify-between items-center bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:border-indigo-200 hover:shadow-md active-scale transition-all text-left"
                    >
                      <span className="text-sm font-bold text-gray-700 truncate mr-4">{p.description}</span>
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">{p.units} UDS PEND.</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-black text-gray-900 px-2 flex items-center gap-2 uppercase text-[10px] tracking-widest"><Users size={18} className="text-indigo-600" />Cuentas por Persona</h3>
              <div className="grid gap-4">
                {ticket.participants.map(p => {
                  const amount = userTotals[p.id] || 0;
                  const share = totalRepartido > 0 ? (amount / totalRepartido) * 100 : 0;
                  return (
                    <button type="button" key={p.id} onClick={() => setPersonDetailModal(p.id)} className="w-full text-left bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow active-scale">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner">{p.name[0].toUpperCase()}</div>
                        <div><p className="font-black text-gray-900 text-xl tracking-tight leading-none mb-1">{p.name}</p><p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{share.toFixed(0)}% del reparto</p></div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{formatMoney(amount)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botones de transición de estado */}
            <div className="space-y-3">
              {/* Confirmar reparto: reparto completo y aún en borrador */}
              {isRepartoCompleto && (!ticket.status || ticket.status === 'borrador') && (
                <button
                  type="button"
                  onClick={() => handleStatusChange('repartido')}
                  className="w-full py-4 px-6 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-orange-200 active-scale transition-colors"
                >
                  <CreditCard size={20} />
                  Confirmar reparto
                </button>
              )}

              {/* Marcar como pagado: cuando está en repartido */}
              {ticket.status === 'repartido' && (
                <>
                  {hasAssignedItems && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-4 px-6 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-emerald-200 active-scale transition-colors"
                    >
                      <MessageCircle size={20} />
                      Compartir por WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStatusChange('pagado')}
                    className="w-full py-4 px-6 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-green-200 active-scale transition-colors"
                  >
                    <CheckCircle2 size={20} />
                    Marcar como pagado
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('borrador')}
                    className="w-full py-3 px-6 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active-scale transition-colors"
                  >
                    <RotateCcw size={16} />
                    Reabrir ticket
                  </button>
                </>
              )}

              {/* Ticket pagado: banner verde + opción de reabrir */}
              {ticket.status === 'pagado' && (
                <div className="space-y-3">
                  <div className="w-full py-4 px-6 rounded-2xl bg-green-50 border-2 border-green-200 flex items-center justify-center gap-3">
                    <CheckCircle2 size={20} className="text-green-600" />
                    <span className="font-black text-sm text-green-700 uppercase tracking-widest">Ticket pagado</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('borrador')}
                    className="w-full py-3 px-6 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active-scale transition-colors"
                  >
                    <RotateCcw size={16} />
                    Reabrir ticket
                  </button>
                </div>
              )}

              {/* WhatsApp: solo visible si no es borrador sin reparto confirmado */}
              {(!ticket.status || ticket.status === 'borrador') && hasAssignedItems && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-6 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-emerald-200 active-scale transition-colors"
                >
                  <MessageCircle size={20} />
                  Compartir por WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: detalle de productos de una persona (Resumen) */}
      {personDetailModal && (() => {
        const person = ticket.participants.find(p => p.id === personDetailModal);
        if (!person) return null;
        const items = Array.from(personAssignedItems[person.id]?.values() || []);
        const total = userTotals[person.id] || 0;
        return (
          <div
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPersonDetailModal(null)}
          >
            <div
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100%-2rem)] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-3 flex justify-between items-center text-white bg-indigo-900">
                <div className="min-w-0 mr-3">
                  <h4 className="font-black text-lg truncate">{person.name}</h4>
                  <p className="text-[11px] opacity-70 font-bold uppercase tracking-widest">{items.length} {items.length === 1 ? 'producto' : 'productos'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPersonDetailModal(null)}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 py-2 overflow-y-auto flex-1">
                {items.length === 0 ? (
                  <p className="text-center py-6 text-gray-400 font-bold text-sm">Sin productos asignados</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {items.map((it, i) => (
                      <li key={i} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 text-sm uppercase truncate">{it.description}</p>
                          <p className="text-[11px] text-gray-400 font-bold">{formatShareText(it.num, it.den)} ud{it.num / it.den > 1 ? 's' : ''}</p>
                        </div>
                        <p className="font-black text-gray-900 tabular-nums shrink-0">{formatMoney(it.amount)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</span>
                <span className="text-2xl font-black text-gray-900 tabular-nums">{formatMoney(total)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: añadir un producto nuevo (centrado en la zona visible: sube solo cuando aparece el teclado) */}
      {newLineModal && (() => {
        const price = parsePrice(newLineModal.price);
        const qty = Math.max(0, Math.round(newLineModal.quantity || 0));
        const nameOk = newLineModal.name.trim().length > 0;
        const priceOk = Number.isFinite(price) && price >= 0;
        const canSubmit = nameOk && priceOk && qty >= 1;
        const lineTotal = canSubmit ? Math.round(qty * price * 100) / 100 : 0;
        return (
          <div
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm"
            onClick={() => setNewLineModal(null)}
          >
            {/* El fondo oscuro cubre toda la pantalla; la ventana se centra solo en la zona visible */}
            <div
              className="absolute left-0 right-0 flex items-center justify-center p-3 sm:p-4 pointer-events-none"
              style={{ top: newLineBox?.top ?? 0, height: newLineBox ? newLineBox.height : '100%' }}
            >
            <form
              className="pointer-events-auto bg-white w-full sm:max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-full flex flex-col"
              onClick={e => e.stopPropagation()}
              onSubmit={(e) => { e.preventDefault(); void confirmAddLine(); }}
            >
              <div className="px-4 py-3 flex justify-between items-center text-white bg-indigo-900">
                <h4 className="font-black text-xs uppercase tracking-widest">Nuevo producto</h4>
                <button
                  type="button"
                  onClick={() => setNewLineModal(null)}
                  aria-label="Cerrar"
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto overscroll-contain">
                <label className="block">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</span>
                  <input
                    type="text"
                    name="producto-nuevo"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="next"
                    placeholder="Ej. Cerveza"
                    value={newLineModal.name}
                    onChange={(e) => setNewLineModal({ ...newLineModal, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); newLinePriceRef.current?.focus(); }
                    }}
                    className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:border-indigo-400"
                  />
                </label>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Uds</span>
                    <UnitsStepper
                      value={newLineModal.quantity}
                      canIncrease
                      onChange={(v) => setNewLineModal({ ...newLineModal, quantity: v })}
                    />
                  </div>
                  <label className="block flex-1 min-w-0">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Precio unidad</span>
                    <div className="mt-1 flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 focus-within:border-indigo-400">
                      <input
                        ref={newLinePriceRef}
                        type="text"
                        name="precio-nuevo"
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="done"
                        placeholder="0,00"
                        value={newLineModal.price}
                        onChange={(e) => { if (!/^\d*([.,]\d{0,2})?$/.test(e.target.value)) return; setNewLineModal({ ...newLineModal, price: e.target.value.replace('.', ',') }); }}
                        className="w-full min-w-0 bg-transparent py-2.5 text-sm font-bold text-gray-900 focus:outline-none"
                      />
                      <span className="text-gray-400 font-bold text-sm ml-1">€</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="px-4 pb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewLineModal(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 text-[11px] font-black uppercase tracking-widest active-scale"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-[2] py-3 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 active-scale disabled:opacity-40"
                >
                  {canSubmit ? `Añadir · ${formatMoney(lineTotal)}` : 'Añadir producto'}
                </button>
              </div>
            </form>
            </div>
          </div>
        );
      })()}

      {/* Mini modal: repartir producto pendiente desde Resumen */}
      {pendingLineModal && (() => {
        const line = ticket.lines.find(l => l.id === pendingLineModal);
        if (!line) return null;
        const unitsAssignedToPeople = line.assignments.reduce((s, a) => a.personIds.length > 0 ? s + a.units : s, 0);
        const unitsAssigned = line.assignments.reduce((s, a) => s + a.units, 0);
        const pendingUnits = Math.max(0, line.quantity - unitsAssignedToPeople);
        const isFullyAssigned = pendingUnits <= 0;
        return (
          <div
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPendingLineModal(null)}
          >
            <div
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[calc(100%-2rem)] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Cabecera del producto */}
              <div className={`px-4 py-3 flex justify-between items-center text-white transition-colors ${isFullyAssigned ? 'bg-green-600' : 'bg-indigo-900'}`}>
                <div className="min-w-0 mr-3">
                  <h4 className="font-black text-sm uppercase truncate">{line.description}</h4>
                  <p className="text-[11px] opacity-70 font-bold">{line.quantity} uds × {formatMoney(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest ${isFullyAssigned ? 'bg-white/20' : 'bg-amber-500'}`}>
                    {isFullyAssigned ? 'OK' : `${pendingUnits} PEND.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingLineModal(null)}
                    className="p-1.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Cuerpo con los grupos de reparto */}
              <div className="overflow-y-auto flex-1 p-3 space-y-3 bg-gray-50/40">
                {ticket.participants.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm font-bold">Añade participantes en la pestaña General primero.</p>
                  </div>
                ) : (
                  <>
                    {line.assignments.map(asgn => (
                      <div key={asgn.id} className={`p-3 border rounded-2xl shadow-sm ${asgn.personIds.length > 0 ? 'bg-white border-gray-100' : 'bg-amber-50/50 border-amber-100'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Unidades</span>
                            <UnitsStepper
                              value={asgn.units}
                              canIncrease={line.assignments.reduce((sum, a) => sum + a.units, 0) < line.quantity}
                              onChange={v => updateAssignment(line.id, asgn.id, { units: v })}
                            />
                          </div>
                          <button
                            onClick={() => deleteAssignment(line.id, asgn.id)}
                            className="text-gray-300 hover:text-red-500 p-2 active-scale transition-colors bg-gray-100/50 rounded-xl"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {ticket.participants.map(p => {
                            const isSelected = asgn.personIds.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  const newPids = isSelected
                                    ? asgn.personIds.filter(id => id !== p.id)
                                    : [...asgn.personIds, p.id];
                                  updateAssignment(line.id, asgn.id, { personIds: newPids });
                                }}
                                className={`px-4 py-2 rounded-xl text-[11px] font-black border transition-all active-scale ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                              >
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {unitsAssigned < line.quantity && (
                      <button
                        onClick={() => addAssignment(line.id)}
                        className="w-full border-2 border-dashed border-indigo-100 bg-white/80 rounded-2xl py-3 text-[10px] font-black text-indigo-400 uppercase tracking-widest active-scale"
                      >
                        + NUEVO GRUPO DE REPARTO
                      </button>
                    )}

                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPendingLineModal(null)}
                  className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest active-scale"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <LiveCameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={async (dataUrl) => {
          setShowCameraModal(false);
          await processImageSource(dataUrl);
        }}
        onOpenGallery={() => galleryInputRef.current?.click()}
        onOpenNativeCamera={() => nativeCameraInputRef.current?.click()}
      />

      {showImageLightbox && ticket.imageBase64 && (
        <div
          onClick={() => setShowImageLightbox(false)}
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col max-w-2xl mx-auto p-4"
        >
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setShowImageLightbox(false)}
              className="p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 active-scale"
              aria-label="Cerrar vista ampliada"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto">
            <img
              src={ticket.imageBase64}
              alt={`Ticket de ${merchantDisplayName}`}
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
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
                  ¿Eliminar este ticket? Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
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

export default TicketDetail;
