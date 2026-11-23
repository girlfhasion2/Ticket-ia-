import React, { useEffect, useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { sharingService, SharedTicket } from '../sharingService';
import { formatMoney } from '../utils/format';
import { computeTicketTotals } from '../utils/ticketTotals';

interface SharedTicketsSectionProps {
  onOpen: (ticketId: string) => void;
}

/** Tickets que otros han compartido contigo. No se muestra nada si no hay ninguno. */
const SharedTicketsSection: React.FC<SharedTicketsSectionProps> = ({ onOpen }) => {
  const [items, setItems] = useState<SharedTicket[]>([]);

  useEffect(() => {
    let active = true;
    sharingService
      .listSharedTickets()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {
        // Si compartir aún no está activado en el servidor, la sección no aparece.
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 px-1 mb-2">
        <Users size={14} className="text-indigo-600" />
        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Compartidos contigo
        </h2>
      </div>
      <div className="space-y-2">
        {items.map((s) => {
          const mine = s.myParticipantId
            ? computeTicketTotals(s.ticket).totals[s.myParticipantId]
            : undefined;
          return (
            <button
              key={s.ticketId}
              type="button"
              onClick={() => onOpen(s.ticketId)}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 text-left active-scale"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-gray-900 truncate">
                  {s.ticket.merchant || 'Ticket sin nombre'}
                </div>
                <div className="text-[11px] font-bold text-gray-500 truncate">
                  De {s.ownerName} · {s.ticket.date}
                </div>
              </div>
              <div className="text-right shrink-0">
                {mine !== undefined ? (
                  <>
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      Tu parte
                    </div>
                    <div className="text-sm font-black text-indigo-700">{formatMoney(mine)}</div>
                  </>
                ) : (
                  <div className="text-xs font-black text-gray-500">{formatMoney(s.ticket.totalAmount)}</div>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SharedTicketsSection;
