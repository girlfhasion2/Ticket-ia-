import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatMoney } from '../utils/format';
import { useBalances } from '../hooks/useBalances';

export type BalanceFilter = 'owed' | 'owe';

interface HomeProps {
  /** Abre Amigos con el filtro Te deben o Debes. */
  onOpenFriends: (filter: BalanceFilter) => void;
}

const peopleText = (n: number) => (n === 0 ? 'Nadie' : n === 1 ? '1 persona' : `${n} personas`);

const Home: React.FC<HomeProps> = ({ onOpenFriends }) => {
  const { summary, loading, error, reload } = useBalances();

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  const allClear = !loading && !error && summary.owedTotal <= 0.005 && summary.oweTotal <= 0.005;

  const cardBase =
    'flex-1 min-w-0 min-h-[44px] text-left rounded-2xl p-4 border active-scale transition-opacity';

  return (
    <div className="bg-gray-50 min-h-full">
      <header className="px-4 pt-5 pb-2">
        <p className="text-xs font-bold text-gray-500">{todayLabel}</p>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Inicio</h1>
      </header>

      <div className="p-4 space-y-3 pb-24">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">
          Balance de tickets
        </h2>

        {loading && (
          <div className="flex justify-center py-10">
            <RefreshCw size={24} className="animate-spin text-indigo-600" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              {error}
              <button onClick={reload} className="block mt-2 underline">
                Reintentar
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onOpenFriends('owed')}
                aria-label={`Te deben ${formatMoney(summary.owedTotal)}, ver en Amigos`}
                className={`${cardBase} bg-green-50 border-green-200 ${summary.owedTotal <= 0.005 ? 'opacity-60' : ''}`}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-green-700">Te deben</div>
                <div className="text-2xl font-black text-green-800 mt-1">{formatMoney(summary.owedTotal)}</div>
                <div className="text-[11px] font-bold text-green-700 mt-1">{peopleText(summary.owedPeople)}</div>
              </button>

              <button
                type="button"
                onClick={() => onOpenFriends('owe')}
                aria-label={`Debes ${formatMoney(summary.oweTotal)}, ver en Amigos`}
                className={`${cardBase} bg-red-50 border-red-200 ${summary.oweTotal <= 0.005 ? 'opacity-60' : ''}`}
              >
                <div className="text-[10px] font-black uppercase tracking-widest text-red-700">Debes</div>
                <div className="text-2xl font-black text-red-800 mt-1">{formatMoney(summary.oweTotal)}</div>
                <div className="text-[11px] font-bold text-red-700 mt-1">{peopleText(summary.owePeople)}</div>
              </button>
            </div>

            {allClear && (
              <p className="text-xs font-semibold text-gray-500 px-1">
                Estás al día, no tienes pagos pendientes.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
