
import React, { useState, useEffect } from 'react';
import { db } from './db';
import { Ticket, AppState, TicketSortConfig } from './types';
import TicketList from './views/TicketList';
import TicketDetail from './views/TicketDetail';
import Settings from './views/Settings';
import HomeView from './views/Home';
import Friends from './views/Friends';
import SharedTicketView from './views/SharedTicketView';
import JoinInvite from './views/JoinInvite';
import { pendingInvite } from './sharingService';
import { notificationsService } from './notificationsService';
import Auth from './views/Auth';
import ResetPassword from './views/ResetPassword';
import { useAuth } from './src/contexts/AuthContext';
import { supabase, supabaseReady, wasRecoveryDetected } from './src/lib/supabase';
import { Home, Receipt, Settings as SettingsIcon, PlusCircle, RefreshCw, Users } from 'lucide-react';

function hasRecoveryHash(): boolean {
  const hash = window.location.hash;
  return hash.includes('type=recovery') || hash.includes('access_token');
}

const App: React.FC = () => {
  const {
    user,
    loading,
    isPasswordRecovery: authPasswordRecovery,
    clearPasswordRecovery,
  } = useAuth();
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(
    () => hasRecoveryHash() || wasRecoveryDetected()
  );
  const [view, setView] = useState<AppState['view']>('home');
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();
  const [draftTicket, setDraftTicket] = useState<Ticket | undefined>();
  const [isListSelectionMode, setIsListSelectionMode] = useState(false);
  const [sortConfig, setSortConfig] = useState<TicketSortConfig>({
    field: 'date',
    direction: 'desc',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [selectedSharedId, setSelectedSharedId] = useState<string | undefined>();
  // Al abrir un ticket desde el detalle de un amigo, "atrás" vuelve a ese amigo.
  const [returnToFriend, setReturnToFriend] = useState<string | null>(null);
  const [friendsInitialId, setFriendsInitialId] = useState<string | undefined>();
  const [friendsInitialFilter, setFriendsInitialFilter] = useState<'owed' | 'owe' | undefined>();
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    // Un enlace de invitación llega como ?invite=TOKEN. Se guarda para sobrevivir al inicio de sesión.
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('invite');
    if (fromUrl) {
      pendingInvite.set(fromUrl);
      params.delete('invite');
      const rest = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash
      );
    }
    return pendingInvite.get();
  });

  useEffect(() => {
    const onHashChange = () => {
      if (hasRecoveryHash()) {
        setIsPasswordRecovery(true);
      }
    };
    window.addEventListener('hashchange', onHashChange);

    let active = true;
    let unsubscribe: (() => void) | undefined;

    supabaseReady
      .then((client) => {
        if (!active) return;
        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((event) => {
          if (active && event === 'PASSWORD_RECOVERY') {
            setIsPasswordRecovery(true);
          }
        });
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        // Fallback listener on exported client if config pending
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
          if (active && event === 'PASSWORD_RECOVERY') {
            setIsPasswordRecovery(true);
          }
        });
        unsubscribe = () => subscription.unsubscribe();
      });

    return () => {
      active = false;
      window.removeEventListener('hashchange', onHashChange);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setView('home');
      setSelectedTicketId(undefined);
      setDraftTicket(undefined);
      setIsListSelectionMode(false);
      setSortConfig({ field: 'date', direction: 'desc' });
      setSearchQuery('');
      setSelectedSharedId(undefined);
    }
  }, [user]);

  useEffect(() => {
    if (!user || view === 'friends') return;
    let active = true;
    notificationsService
      .attentionCount()
      .then((count) => {
        if (active) setPendingFriendRequests(count);
      })
      .catch(() => {
        // Si la parte social aún no está activada en el servidor, no se muestra el aviso.
        if (active) setPendingFriendRequests(0);
      });
    return () => {
      active = false;
    };
  }, [user, view]);

  const leaveTicket = () => {
    if (returnToFriend) {
      setFriendsInitialId(returnToFriend);
      setReturnToFriend(null);
      setView('friends');
    } else {
      setView('list');
    }
  };

  const navigateToTicket = (id: string) => {
    setIsListSelectionMode(false);
    setDraftTicket(undefined);
    setSelectedTicketId(id);
    setView('detail');
  };

  const createNewTicket = () => {
    const id = crypto.randomUUID();
    const newTicket: Ticket = {
      id,
      merchant: "Nuevo Comercio",
      date: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      participants: [],
      lines: [],
      discardedLines: [],
      createdAt: Date.now()
    };
    setIsListSelectionMode(false);
    setDraftTicket(newTicket);
    setSelectedTicketId(id);
    setView('detail');
  };

  if (isPasswordRecovery || authPasswordRecovery) {
    return (
      <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50 shadow-xl overflow-y-auto">
        <ResetPassword
          onComplete={() => {
            window.history.replaceState({}, '', '/');
            clearPasswordRecovery();
            setIsPasswordRecovery(false);
          }}
        />
      </div>
    );
  }

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
        {inviteToken && (
          <div className="m-4 mb-0 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl px-4 py-3 text-xs font-bold">
            Te han invitado a un ticket. Inicia sesión o crea una cuenta para unirte.
          </div>
        )}
        <Auth />
      </div>
    );
  }

  if (inviteToken) {
    const finishInvite = () => {
      pendingInvite.clear();
      setInviteToken(null);
    };
    return (
      <JoinInvite
        token={inviteToken}
        onJoined={(ticketId) => {
          finishInvite();
          setSelectedSharedId(ticketId);
          setView('shared');
        }}
        onOpenOwn={(ticketId) => {
          finishInvite();
          navigateToTicket(ticketId);
        }}
        onCancel={finishInvite}
      />
    );
  }

  const renderView = () => {
    switch (view) {
      case 'home':
        return (
          <HomeView
            onOpenFriends={(filter) => {
              setFriendsInitialFilter(filter);
              setView('friends');
            }}
          />
        );
      case 'list':
        return (
          <TicketList
            onSelectTicket={navigateToTicket}
            onOpenShared={(id) => {
              setSelectedSharedId(id);
              setView('shared');
            }}
            onCreateTicket={createNewTicket}
            onSelectionModeChange={setIsListSelectionMode}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'detail':
        return selectedTicketId ? (
          <TicketDetail
            ticketId={selectedTicketId}
            initialTicket={draftTicket?.id === selectedTicketId ? draftTicket : undefined}
            onBack={() => {
              setDraftTicket(undefined);
              setSelectedTicketId(undefined);
              leaveTicket();
            }}
          />
        ) : null;
      case 'shared':
        return selectedSharedId ? (
          <SharedTicketView
            ticketId={selectedSharedId}
            onBack={() => {
              setSelectedSharedId(undefined);
              leaveTicket();
            }}
          />
        ) : null;
      case 'friends':
        return (
          <Friends
            onPendingCountChange={setPendingFriendRequests}
            initialPersonId={friendsInitialId}
            onInitialConsumed={() => setFriendsInitialId(undefined)}
            initialFilter={friendsInitialFilter}
            onInitialFilterConsumed={() => setFriendsInitialFilter(undefined)}
            onOpenShared={(id, personId) => {
              setReturnToFriend(personId || null);
              setSelectedSharedId(id);
              setView('shared');
            }}
            onOpenOwn={(id, personId) => {
              setReturnToFriend(personId);
              navigateToTicket(id);
            }}
          />
        );
      case 'settings':
        return <Settings />;
      default:
        return (
          <TicketList
            onSelectTicket={navigateToTicket}
            onOpenShared={(id) => {
              setSelectedSharedId(id);
              setView('shared');
            }}
            onCreateTicket={createNewTicket}
            onSelectionModeChange={setIsListSelectionMode}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-xl overflow-hidden relative">
      <main className="flex-1 overflow-y-auto pb-20">
        {renderView()}
      </main>

      {view !== 'detail' && view !== 'shared' && !(view === 'list' && isListSelectionMode) && (
        <nav className="fixed bottom-0 w-full max-w-2xl bg-white border-t border-gray-200 px-2 py-3 flex justify-around items-center z-50">
          <button
            onClick={() => setView('home')}
            className={`flex flex-col items-center gap-1 min-w-[60px] transition-colors ${view === 'home' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Home size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Inicio</span>
          </button>

          <button
            onClick={() => setView('list')}
            className={`flex flex-col items-center gap-1 min-w-[60px] transition-colors ${view === 'list' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Receipt size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Tickets</span>
          </button>

          <button
            onClick={createNewTicket}
            aria-label="Nuevo ticket"
            className="flex flex-col items-center gap-1 -mt-10 bg-indigo-600 text-white p-4 rounded-full shadow-2xl active-scale border-4 border-white transition-transform"
          >
            <PlusCircle size={32} />
          </button>

          <button
            onClick={() => setView('friends')}
            className={`relative flex flex-col items-center gap-1 min-w-[60px] transition-colors ${view === 'friends' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Users size={24} />
            {pendingFriendRequests > 0 && (
              <span className="absolute -top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                {pendingFriendRequests}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest">Amigos</span>
          </button>

          <button
            onClick={() => setView('settings')}
            className={`flex flex-col items-center gap-1 min-w-[60px] transition-colors ${view === 'settings' ? 'text-indigo-600' : 'text-gray-400'}`}
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
