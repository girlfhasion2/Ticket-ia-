import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { Person } from '../types';
import { friendsService, Friend, friendLabel } from '../friendsService';

interface ParticipantPickerProps {
  participants: Person[];
  onAddFree: (name: string) => void;
  onAddFriend: (friend: Friend) => void;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Una sola barra para añadir participantes: nombres libres o amigos de la app.
 * La primera fila del desplegable siempre es "nombre libre", así un "Pablo"
 * que no es tu amigo Pablo se resuelve sin ambigüedad.
 */
const ParticipantPicker: React.FC<ParticipantPickerProps> = ({ participants, onAddFree, onAddFriend }) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    friendsService
      .listFriends()
      .then((f) => active && setFriends(f))
      .catch(() => {
        /* sin amigos disponibles: solo nombres libres */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const addedIds = useMemo(
    () => new Set(participants.map((p) => p.userId).filter(Boolean) as string[]),
    [participants]
  );

  const q = norm(text);
  const matches = useMemo(
    () =>
      friends
        .filter((f) => !addedIds.has(f.friendId))
        .filter((f) => !q || norm(f.alias || '').includes(q) || norm(f.displayName).includes(q)),
    [friends, addedIds, q]
  );

  const hasText = text.trim().length > 0;
  const showList = open && (hasText || matches.length > 0);

  const addFree = () => {
    if (!hasText) return;
    onAddFree(text.trim());
    setText('');
  };

  const addFriend = (f: Friend) => {
    onAddFriend(f);
    setText('');
  };

  return (
    <div ref={wrapRef} className="relative pt-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Añadir nombre o amigo..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addFree();
            if (e.key === 'Escape') setOpen(false);
          }}
          className="flex-1 min-w-0 bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold outline-none border border-transparent focus:border-indigo-200 focus:bg-white transition-all shadow-inner"
        />
        <button
          type="button"
          aria-label={hasText ? 'Añadir como nombre libre' : 'Elegir de mis amigos'}
          onClick={() => (hasText ? addFree() : setOpen((o) => !o))}
          className="bg-indigo-600 text-white px-5 rounded-xl active-scale shadow-md"
        >
          <Plus size={24} />
        </button>
      </div>

      {showList && (
        <div className="absolute left-0 right-0 mt-2 z-30 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {hasText && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addFree}
              className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 active:bg-gray-50"
            >
              <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                <Plus size={16} />
              </span>
              <span className="min-w-0 text-sm font-bold text-gray-800 truncate">
                Añadir «{text.trim()}»
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Nombre libre, sin vincular
                </span>
              </span>
            </button>
          )}

          {!hasText && matches.length > 0 && (
            <div className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Tus amigos
            </div>
          )}

          {matches.map((f) => {
            const showReal = f.alias && f.alias !== f.displayName;
            return (
              <button
                key={f.friendId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addFriend(f)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-indigo-50"
              >
                <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <UserRound size={16} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-black text-gray-900 truncate">
                  {friendLabel(f)}
                </span>
                {showReal && (
                  <span className="text-[11px] font-bold text-gray-400 truncate max-w-[40%]">{f.displayName}</span>
                )}
              </button>
            );
          })}

          {hasText && matches.length === 0 && friends.length > 0 && (
            <div className="px-4 py-2.5 text-[11px] font-semibold text-gray-400">
              Ningún amigo coincide con lo que escribes.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParticipantPicker;
