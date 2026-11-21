import React, { useEffect, useState } from 'react';
import { SortDirection, SortField, TicketSortConfig } from '../types';
import { ArrowUpDown, Calendar, ArrowDownUp, Coins, Check, X, RotateCcw } from 'lucide-react';

interface SortTicketsModalProps {
  isOpen: boolean;
  currentSort: TicketSortConfig;
  onClose: () => void;
  onApply: (sort: TicketSortConfig) => void;
}

const DEFAULT_SORT: TicketSortConfig = {
  field: 'date',
  direction: 'desc',
};

const FIELD_OPTIONS: { field: SortField; label: string; icon: React.ReactNode }[] = [
  { field: 'date', label: 'Fecha', icon: <Calendar size={17} /> },
  { field: 'name', label: 'Nombre (alfabético)', icon: <ArrowDownUp size={17} /> },
  { field: 'amount', label: 'Importe', icon: <Coins size={17} /> },
];

function getDirectionOptions(field: SortField): [
  { direction: SortDirection; label: string },
  { direction: SortDirection; label: string },
] {
  switch (field) {
    case 'name':
      return [
        { direction: 'asc', label: 'A-Z' },
        { direction: 'desc', label: 'Z-A' },
      ];
    case 'amount':
      return [
        { direction: 'desc', label: 'Mayor importe' },
        { direction: 'asc', label: 'Menor importe' },
      ];
    case 'date':
    default:
      return [
        { direction: 'desc', label: 'Más reciente primero' },
        { direction: 'asc', label: 'Más antiguo primero' },
      ];
  }
}

const SortTicketsModal: React.FC<SortTicketsModalProps> = ({
  isOpen,
  currentSort,
  onClose,
  onApply,
}) => {
  const [draftField, setDraftField] = useState<SortField>(currentSort.field);
  const [draftDirection, setDraftDirection] = useState<SortDirection>(
    currentSort.direction
  );

  useEffect(() => {
    if (isOpen) {
      setDraftField(currentSort.field);
      setDraftDirection(currentSort.direction);
    }
  }, [isOpen, currentSort.field, currentSort.direction]);

  if (!isOpen) return null;

  const handleSelectField = (field: SortField) => {
    if (field === draftField) return;
    setDraftField(field);
    setDraftDirection(field === 'name' ? 'asc' : 'desc');
  };

  const handleReset = () => {
    setDraftField(DEFAULT_SORT.field);
    setDraftDirection(DEFAULT_SORT.direction);
    onApply(DEFAULT_SORT);
  };

  const handleApply = () => {
    onApply({ field: draftField, direction: draftDirection });
    onClose();
  };

  const directionOptions = getDirectionOptions(draftField);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl rounded-t-3xl shadow-2xl border-t border-gray-100 flex flex-col"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 shrink-0" />

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowUpDown size={18} />
            </div>
            <h2 className="text-lg font-black text-gray-900">Ordenar por</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ordenación"
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active-scale transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Criterios */}
          <div className="space-y-2">
            {FIELD_OPTIONS.map((opt) => {
              const isSelected = draftField === opt.field;
              return (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => handleSelectField(opt.field)}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-colors active-scale ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="flex items-center gap-3 font-bold text-sm">
                    <span className={isSelected ? 'text-indigo-600' : 'text-gray-400'}>
                      {opt.icon}
                    </span>
                    {opt.label}
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dirección */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
              Dirección
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {directionOptions.map((dirOpt) => {
                const isSelected = draftDirection === dirOpt.direction;
                return (
                  <button
                    key={dirOpt.direction}
                    type="button"
                    onClick={() => setDraftDirection(dirOpt.direction)}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold transition-colors active-scale ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200'
                    }`}
                  >
                    {dirOpt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active-scale transition-colors"
            >
              <RotateCcw size={14} />
              Restablecer
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-[1.3] py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 active-scale transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SortTicketsModal;
