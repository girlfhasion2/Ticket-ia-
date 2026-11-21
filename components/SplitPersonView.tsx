import React, { useState, useEffect } from 'react';
import { Assignment, Person, TicketLine } from '../types';
import {
  pendingUnits,
  wholeUnits,
  sharedGroups,
  sharedUnitsCount,
  joinableGroups,
  hasUnits,
  personAmount,
  joinPreviewAmount,
  addWhole,
  removeWhole,
  createShare,
  changeGroupUnits,
  toggleGroupPerson,
  setGroupAll,
  leaveGroup,
  joinGroup,
} from '../utils/splitLogic';

interface SplitPersonViewProps {
  lines: TicketLine[];
  participants: Person[];
  personId: string;
  onChangeLine: (lineId: string, assignments: Assignment[]) => void;
}

const money = (n: number) => `${n.toFixed(2)}€`;
const fmtUnits = (n: number) => String(Math.round(n * 100) / 100);

const SplitPersonView: React.FC<SplitPersonViewProps> = ({
  lines,
  participants,
  personId,
  onChangeLine,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [joinOpen, setJoinOpen] = useState<Record<string, boolean>>({});
  // Reparto compartido nuevo que aún no tiene a nadie elegido (solo existe en pantalla).
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  useEffect(() => {
    setOpen({});
    setJoinOpen({});
    setDrafts({});
  }, [personId]);

  const person = participants.find((p) => p.id === personId);
  const others = participants.filter((p) => p.id !== personId);
  const allIds = participants.map((p) => p.id);
  const personName = person?.name ?? '';

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '?';
  const namesOf = (ids: string[]) => {
    const n = ids.map(nameOf);
    return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
  };

  const removeDraft = (lineId: string) =>
    setDrafts((d) => {
      const n = { ...d };
      delete n[lineId];
      return n;
    });

  const togglePanel = (line: TicketLine) => {
    if (open[line.id]) {
      setOpen((o) => ({ ...o, [line.id]: false }));
      setJoinOpen((o) => ({ ...o, [line.id]: false }));
      removeDraft(line.id);
      return;
    }
    setOpen((o) => ({ ...o, [line.id]: true }));
    if (sharedGroups(line, personId).length === 0 && pendingUnits(line) > 0.001) {
      setDrafts((d) => ({ ...d, [line.id]: 1 }));
    }
  };

  if (lines.length === 0) {
    return <div className="text-center py-16 text-gray-400 font-bold text-sm">Nada que mostrar</div>;
  }

  const stepBtn =
    'w-9 h-9 rounded-xl border-[1.5px] border-indigo-200 bg-indigo-50 text-indigo-600 text-lg font-black active-scale disabled:opacity-30 disabled:cursor-not-allowed';
  const chipBase = 'px-3.5 py-2 rounded-xl text-[11px] font-black border-[1.5px] transition-all active-scale';

  return (
    <div className="space-y-4">
      {lines.map((line) => {
        const pending = pendingUnits(line);
        const isComplete = pending <= 0.001;
        const mine = hasUnits(line, personId);
        const whole = wholeUnits(line, personId);
        const shared = sharedGroups(line, personId);
        const sharedCount = sharedUnitsCount(line, personId);
        const isOpen = !!open[line.id];
        const draftUnits = drafts[line.id];
        const joinable = joinableGroups(line, personId);

        return (
          <div
            key={line.id}
            className={`border rounded-3xl overflow-hidden transition-all ${
              mine ? 'bg-indigo-50 border-indigo-600 ring-1 ring-indigo-600' : 'bg-white border-gray-100'
            }`}
          >
            <div
              className={`px-4 py-3 flex justify-between items-center gap-2 border-b ${
                mine ? 'bg-indigo-100 border-indigo-200' : 'bg-white border-gray-100'
              }`}
            >
              <div className="min-w-0">
                <h4
                  className={`font-black text-xs uppercase truncate ${
                    mine ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {line.description}
                </h4>
                <p className="text-[10px] text-gray-500 font-bold">
                  {fmtUnits(line.quantity)} ud × {line.unitPrice}€
                </p>
              </div>
              <span
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest ${
                  isComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isComplete ? 'OK' : `${fmtUnits(pending)} PEND.`}
              </span>
            </div>

            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-black text-gray-700">Unidades asignadas</span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className={stepBtn}
                    disabled={whole <= 0}
                    onClick={() => onChangeLine(line.id, removeWhole(line, personId))}
                    aria-label="Quitar una unidad"
                  >
                    −
                  </button>
                  <span className="min-w-[1.25rem] text-center font-black text-base tabular-nums">
                    {fmtUnits(whole)}
                  </span>
                  <button
                    type="button"
                    className={stepBtn}
                    disabled={pending <= 0.001}
                    onClick={() => onChangeLine(line.id, addWhole(line, personId))}
                    aria-label="Añadir una unidad"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => togglePanel(line)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-[1.5px] text-xs font-black active-scale ${
                    isOpen
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-indigo-200 text-indigo-600'
                  }`}
                >
                  Compartir
                  {sharedCount > 0 && (
                    <span className="bg-amber-200 text-amber-900 rounded-full px-2 text-[11px] leading-5">
                      {fmtUnits(sharedCount)}
                    </span>
                  )}
                </button>
              </div>

              <p className={`text-sm font-black ${mine ? 'text-indigo-600' : 'text-gray-400 font-bold text-xs'}`}>
                {mine ? `${personName} paga ${money(personAmount(line, personId))}` : `${personName} no tiene nada`}
              </p>

              {isOpen && (
                <div className="bg-gray-50 border border-dashed border-indigo-200 rounded-2xl p-2.5 space-y-2.5">
                  {shared.map((g) => {
                    const allOn = g.personIds.length === allIds.length;
                    return (
                      <div key={g.id} className="bg-white border border-gray-100 rounded-xl p-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              className={stepBtn}
                              disabled={g.units <= 1.001}
                              onClick={() => onChangeLine(line.id, changeGroupUnits(line, g.id, -1))}
                            >
                              −
                            </button>
                            <span className="min-w-[1.25rem] text-center font-black tabular-nums">
                              {fmtUnits(g.units)}
                            </span>
                            <button
                              type="button"
                              className={stepBtn}
                              disabled={pending <= 0.001}
                              onClick={() => onChangeLine(line.id, changeGroupUnits(line, g.id, 1))}
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[11px] font-black text-indigo-600">
                            {money((line.unitPrice * g.units) / g.personIds.length)} c/u
                          </span>
                          <button
                            type="button"
                            aria-label={`Quitar a ${personName} de este reparto`}
                            title={`Quitar a ${personName} de este reparto`}
                            className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 text-sm font-black active-scale"
                            onClick={() => onChangeLine(line.id, leaveGroup(line, g.id, personId))}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className={`${chipBase} border-dashed ${
                              allOn
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-indigo-300 text-indigo-600'
                            }`}
                            onClick={() => onChangeLine(line.id, setGroupAll(line, g.id, personId, allIds))}
                          >
                            Todos
                          </button>
                          {others.map((o) => {
                            const on = g.personIds.includes(o.id);
                            return (
                              <button
                                key={o.id}
                                type="button"
                                className={`${chipBase} ${
                                  on
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-500'
                                }`}
                                onClick={() => onChangeLine(line.id, toggleGroupPerson(line, g.id, o.id))}
                              >
                                {o.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {draftUnits !== undefined && pending > 0.001 && (
                    <div className="bg-white border border-gray-100 rounded-xl p-2.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            className={stepBtn}
                            disabled={draftUnits <= 1}
                            onClick={() => setDrafts((d) => ({ ...d, [line.id]: draftUnits - 1 }))}
                          >
                            −
                          </button>
                          <span className="min-w-[1.25rem] text-center font-black tabular-nums">
                            {draftUnits}
                          </span>
                          <button
                            type="button"
                            className={stepBtn}
                            disabled={draftUnits + 1 > pending + 0.001}
                            onClick={() => setDrafts((d) => ({ ...d, [line.id]: draftUnits + 1 }))}
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[11px] font-black text-gray-400">elige con quién</span>
                        <button
                          type="button"
                          aria-label="Descartar reparto"
                          className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 text-sm font-black active-scale"
                          onClick={() => removeDraft(line.id)}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className={`${chipBase} border-dashed bg-white border-indigo-300 text-indigo-600`}
                          onClick={() => {
                            onChangeLine(line.id, createShare(line, personId, others.map((o) => o.id), draftUnits));
                            removeDraft(line.id);
                          }}
                        >
                          Todos
                        </button>
                        {others.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={`${chipBase} bg-white border-gray-200 text-gray-500`}
                            onClick={() => {
                              onChangeLine(line.id, createShare(line, personId, [o.id], draftUnits));
                              removeDraft(line.id);
                            }}
                          >
                            {o.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {pending > 0.001 && draftUnits === undefined && (
                      <button
                        type="button"
                        className="flex-1 border-[1.5px] border-dashed border-indigo-200 bg-white rounded-xl py-2.5 text-[11px] font-black text-indigo-400 active-scale"
                        onClick={() => setDrafts((d) => ({ ...d, [line.id]: 1 }))}
                      >
                        + Otro reparto compartido
                      </button>
                    )}
                    {joinable.length > 0 && (
                      <button
                        type="button"
                        className="flex-1 border-[1.5px] border-dashed border-indigo-200 bg-white rounded-xl py-2.5 text-[11px] font-black text-indigo-400 active-scale"
                        onClick={() => setJoinOpen((o) => ({ ...o, [line.id]: !o[line.id] }))}
                      >
                        Unirme a otro grupo
                      </button>
                    )}
                  </div>

                  {joinOpen[line.id] && joinable.length > 0 && (
                    <div className="space-y-1.5">
                      {joinable.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="w-full flex items-center justify-between gap-2 bg-white border-[1.5px] border-gray-200 rounded-xl px-3 py-2.5 text-left active-scale"
                          onClick={() => {
                            onChangeLine(line.id, joinGroup(line, g.id, personId));
                            setJoinOpen((o) => ({ ...o, [line.id]: false }));
                          }}
                        >
                          <span className="text-sm font-black text-gray-800">{namesOf(g.personIds)}</span>
                          <span className="text-xs font-black text-indigo-600 shrink-0">
                            pagarías {money(joinPreviewAmount(line, g))}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {shared.length === 0 && draftUnits === undefined && joinable.length === 0 && pending <= 0.001 && (
                    <p className="text-center text-xs font-bold text-gray-400">No quedan unidades libres.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SplitPersonView;
