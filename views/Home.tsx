import React from 'react';
import { RefreshCw, AlertCircle, ArrowDown, ArrowUp, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatMoney } from '../utils/format';
import { useBalances } from '../hooks/useBalances';

export type BalanceFilter = 'owed' | 'owe';

interface HomeProps {
  /** Abre Amigos con el filtro Te deben o Debes. */
  onOpenFriends: (filter: BalanceFilter) => void;
}

const EPS = 0.005;
const paymentsText = (n: number) =>
  n === 0 ? 'Ningún pago' : n === 1 ? '1 pago abierto' : `${n} pagos abiertos`;

interface TileProps {
  label: string;
  amount: number;
  count: number;
  accent: string;
  chip?: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/** Mismo tamaño y peso visual para las dos cuentas: ninguna es "la buena". */
const Tile: React.FC<TileProps> = ({ label, amount, count, accent, chip, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`${label} ${formatMoney(amount)}, ${paymentsText(count)}, ver en Amigos`}
    className="flex-1 min-w-0 min-h-[44px] flex flex-col justify-start items-stretch text-left rounded-2xl p-3.5 active-scale"
    style={{
      backgroundColor: 'rgba(255,255,255,0.09)',
      color: '#ffffff',
      opacity: amount <= EPS ? 0.55 : 1,
    }}
  >
    <div className="flex items-center gap-1.5">
      <span
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
      >
        {icon}
      </span>
      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#c7d2fe' }}>
        {label}
      </span>
    </div>
    <div className="text-[26px] leading-tight font-black tracking-tight mt-2 truncate">
      {formatMoney(amount)}
    </div>
    <div className="text-[11px] font-bold mt-0.5" style={{ color: '#c7d2fe' }}>
      {paymentsText(count)}
    </div>
    {chip && (
      <span
        className="self-start mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: accent }}
      >
        {chip}
      </span>
    )}
  </button>
);

const Home: React.FC<HomeProps> = ({ onOpenFriends }) => {
  const { summary, loading, error, reload } = useBalances();

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  const owedOpen = summary.owedTotal > EPS;
  const oweOpen = summary.oweTotal > EPS;
  const allClear = !loading && !error && !owedOpen && !oweOpen;

  return (
    <div className="bg-gray-50 min-h-full">
      <header className="px-4 pt-5 pb-2">
        <p className="text-xs font-bold text-gray-500">{todayLabel}</p>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Inicio</h1>
      </header>

      <div className="p-4 space-y-3 pb-24">
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

        {!loading && !error && allClear && (
          <div
            className="rounded-3xl p-5 flex items-center gap-3.5"
            style={{ backgroundColor: '#312e81', color: '#ffffff' }}
          >
            <span
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(110,231,183,0.18)' }}
            >
              <Check size={24} strokeWidth={3} style={{ color: '#6ee7b7' }} />
            </span>
            <div>
              <div className="text-lg font-black">Todo saldado</div>
              <div className="text-xs font-bold mt-0.5" style={{ color: '#c7d2fe' }}>
                No tienes pagos pendientes con nadie.
              </div>
            </div>
          </div>
        )}

        {!loading && !error && !allClear && (
          <div className="rounded-3xl p-5" style={{ backgroundColor: '#312e81', color: '#ffffff' }}>
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a5b4fc' }}>
              Pagos pendientes
            </div>

            <div className="flex items-stretch gap-2.5 mt-3">
              <Tile
                label="Te deben"
                amount={summary.owedTotal}
                count={summary.owedCount}
                accent="#7dd3fc"
                chip={summary.toConfirmCount > 0 ? `${summary.toConfirmCount} por confirmar` : undefined}
                icon={<ArrowDown size={13} strokeWidth={3} style={{ color: '#7dd3fc' }} />}
                onClick={() => onOpenFriends('owed')}
              />
              <Tile
                label="Debes"
                amount={summary.oweTotal}
                count={summary.oweCount}
                accent="#fbbf24"
                icon={<ArrowUp size={13} strokeWidth={3} style={{ color: '#fbbf24' }} />}
                onClick={() => onOpenFriends('owe')}
              />
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
