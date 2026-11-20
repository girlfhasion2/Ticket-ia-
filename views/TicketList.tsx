
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Ticket } from '../types';
import { ChevronRight, Calendar, Store, Receipt, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface TicketListProps {
  onSelectTicket: (id: string) => void;
  onCreateTicket: () => void;
}

const TicketList: React.FC<TicketListProps> = ({ onSelectTicket, onCreateTicket }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const loadTickets = async () => {
    const allTickets = await db.tickets.orderBy('date').reverse().toArray();
    setTickets(allTickets);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleDeleteTicket = async (e: React.MouseEvent, id: string, merchant: string) => {
    e.stopPropagation(); // Evita que se abra el detalle del ticket
    if (window.confirm(`¿Seguro que quieres borrar el ticket de ${merchant}?`)) {
      await db.tickets.delete(id);
      loadTickets();
    }
  };

  const groupedTickets = tickets.reduce((acc: { [key: string]: Ticket[] }, ticket) => {
    const month = format(parseISO(ticket.date), 'MMMM yyyy', { locale: es });
    if (!acc[month]) acc[month] = [];
    acc[month].push(ticket);
    return acc;
  }, {});

  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Tickets</h1>
        <p className="text-sm text-gray-500">Gestiona y reparte tus gastos</p>
      </header>

      {Object.keys(groupedTickets).length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300">
          <Receipt size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No hay tickets registrados aún.</p>
          <button 
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
              {monthTickets.map((ticket) => (
                <div 
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket.id)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between active:bg-gray-50 transition-colors cursor-pointer relative"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                      <Store size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{ticket.merchant}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={12} />
                        <span>{format(parseISO(ticket.date), "dd 'de' MMM", { locale: es })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-900">
                      {ticket.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </span>
                    <div className="flex items-center">
                      <button 
                        onClick={(e) => handleDeleteTicket(e, ticket.id, ticket.merchant)}
                        className="p-2 text-gray-300 hover:text-red-500 active-scale"
                      >
                        <Trash2 size={18} />
                      </button>
                      <ChevronRight size={18} className="text-gray-300" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

export default TicketList;
