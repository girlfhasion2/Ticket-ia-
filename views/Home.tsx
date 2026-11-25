import React from 'react';
import { RefreshCw, AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
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
            <div
              className="rounded-3xl p-5"
              style={{ backgroundColor: '#312e81', color: '#ffffff' }}
            >
              <div
                className="text-[10px] font-black uppercase tracking-widest mb-3"
                style={{ color: '#a5b4fc' }}
              >
                Balance de tickets
              </div>

              <div className="flex items-stretch gap-3.5">
                <button
                  type="button"
                  onClick={() => onOpenFriends('owed')}
                  aria-label={`Te deben ${formatMoney(summary.owedTotal)}, ver en Amigos`}
                  className="flex-1 min-w-0 min-h-[44px] text-left active-scale"
                  style={{ opacity: summary.owedTotal <= 0.005 ? 0.6 : 1 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
                    >
                      <ArrowDown size={13} strokeWidth={3} style={{ color: '#6ee7b7' }} />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#c7d2fe' }}>
                      Te deben
                    </span>
                  </div>
                  <div className="text-[28px] leading-tight font-black tracking-tight mt-2">
                    {formatMoney(summary.owedTotal)}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: '#c7d2fe' }}>
                    {peopleText(summary.owedPeople)}
                  </div>
                </button>

                <div className="w-px" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />

                <button
                  type="button"
                  onClick={() => onOpenFriends('owe')}
                  aria-label={`Debes ${formatMoney(summary.oweTotal)}, ver en Amigos`}
                  className="flex-1 min-w-0 min-h-[44px] text-left active-scale"
                  style={{ opacity: summary.oweTotal <= 0.005 ? 0.6 : 1 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
                    >
                      <ArrowUp size={13} strokeWidth={3} style={{ color: '#fca5a5' }} />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#c7d2fe' }}>
                      Debes
                    </span>
                  </div>
                  <div className="text-[28px] leading-tight font-black tracking-tight mt-2">
                    {formatMoney(summary.oweTotal)}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: '#c7d2fe' }}>
                    {peopleText(summary.owePeople)}
                  </div>
                </button>
              </div>

              {/* Barra proporcional: cuánto pesa lo que te deben frente a lo que debes */}
              <div className="flex gap-[3px] h-2.5 mt-4" aria-hidden="true">
                {allClear ? (
                  <span className="flex-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
                ) : (
                  <>
                    {summary.owedTotal > 0.005 && (
                      <span
                        className="rounded-full"
                        style={{ flexGrow: summary.owedTotal, flexBasis: 0, backgroundColor: '#34d399' }}
                      />
                    )}
                    {summary.oweTotal > 0.005 && (
                      <span
                        className="rounded-full"
                        style={{ flexGrow: summary.oweTotal, flexBasis: 0, backgroundColor: '#f87171' }}
                      />
                    )}
                  </>
                )}
              </div>
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
