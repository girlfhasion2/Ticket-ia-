
import React, { useState, useEffect } from 'react';
import { db } from './db';
import { Ticket, AppState } from './types';
import TicketList from './views/TicketList';
import TicketDetail from './views/TicketDetail';
import Settings from './views/Settings';
import Auth from './views/Auth';
import { useAuth } from './src/contexts/AuthContext';
import { Home, Settings as SettingsIcon, PlusCircle, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AppState['view']>('list');
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();

  useEffect(() => {
    if (!user) {
      setView('list');
      setSelectedTicketId(undefined);
    }
  }, [user]);

  const navigateToTicket = (id: string) => {
    setSelectedTicketId(id);
    setView('detail');
  };

  const createNewTicket = async () => {
    const id = crypto.randomUUID();
    const newTicket: Ticket = {
      id,
      merchant: "Nuevo Comercio",
      date: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      participants: [], 
      lines: [],
      discardedLines: [], // Inicialización necesaria
      createdAt: Date.now()
    };
    try {
      await db.tickets.add(newTicket);
      navigateToTicket(id);
    } catch (error) {
      console.error('Error creating ticket:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen max-w-2xl mx-auto bg-white shadow-xl">
        <RefreshCw size={32} className="animate-spin text-indigo-600 mb-3" />
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">
          Cargando sesión...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50 shadow-xl overflow-y-auto">
        <Auth />
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'list':
        return <TicketList onSelectTicket={navigateToTicket} onCreateTicket={createNewTicket} />;
      case 'detail':
        return selectedTicketId ? (
          <TicketDetail 
            ticketId={selectedTicketId} 
            onBack={() => setView('list')} 
          />
        ) : null;
      case 'settings':
        return <Settings />;
      default:
        return <TicketList onSelectTicket={navigateToTicket} onCreateTicket={createNewTicket} />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-xl overflow-hidden relative">
      <main className="flex-1 overflow-y-auto pb-20">
        {renderView()}
      </main>

      {view !== 'detail' && (
        <nav className="fixed bottom-0 w-full max-w-2xl bg-white border-t border-gray-200 px-12 py-3 flex justify-between items-center z-50">
          <button 
            onClick={() => setView('list')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'list' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Home size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Tickets</span>
          </button>
          
          <button 
            onClick={createNewTicket}
            className="flex flex-col items-center gap-1 -mt-10 bg-indigo-600 text-white p-4 rounded-full shadow-2xl active-scale border-4 border-white transition-transform"
          >
            <PlusCircle size={32} />
          </button>
          
          <button 
            onClick={() => setView('settings')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'settings' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <SettingsIcon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Ajustes</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;
