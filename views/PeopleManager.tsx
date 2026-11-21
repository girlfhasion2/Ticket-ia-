
import React, { useState, useEffect } from 'react';
import { Person } from '../types';
import { UserPlus, Trash2, Edit2, Check, X, Search } from 'lucide-react';

const PEOPLE_STORAGE_KEY = 'ticketsplit_people';

const readPeopleFromStorage = (): Person[] => {
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Person[]) : [];
  } catch {
    return [];
  }
};

const writePeopleToStorage = (items: Person[]) => {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(items));
};

const PeopleManager: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    setPeople(readPeopleFromStorage());
  };

  const addPerson = async () => {
    if (!newName.trim()) return;
    const newPerson: Person = {
      id: crypto.randomUUID(),
      name: newName.trim()
    };
    const next = [...readPeopleFromStorage(), newPerson];
    writePeopleToStorage(next);
    setNewName("");
    setPeople(next);
  };

  const deletePerson = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar a ${name}?`)) {
      const next = readPeopleFromStorage().filter((p) => p.id !== id);
      writePeopleToStorage(next);
      setPeople(next);
    }
  };

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setEditName(person.name);
  };

  const saveEdit = async () => {
    if (editingId && editName.trim()) {
      const next = readPeopleFromStorage().map((p) =>
        p.id === editingId ? { ...p, name: editName.trim() } : p
      );
      writePeopleToStorage(next);
      setEditingId(null);
      setPeople(next);
    }
  };

  const filteredPeople = people.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Personas</h1>
        <p className="text-sm text-gray-500">Añade participantes frecuentes</p>
      </header>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex gap-2">
        <input 
          type="text" 
          placeholder="Nombre de la persona..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPerson()}
          className="flex-1 bg-gray-50 border-transparent focus:bg-white focus:border-indigo-400 focus:ring-0 rounded-xl px-4 py-2 transition-all outline-none"
        />
        <button onClick={addPerson} className="bg-indigo-600 text-white p-3 rounded-xl active-scale">
          <UserPlus size={20} />
        </button>
      </div>

      <div className="relative mb-4 px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input 
          type="text"
          placeholder="Buscar persona..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      <div className="space-y-3 pb-20">
        {filteredPeople.map(person => (
          <div 
            key={person.id}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group transition-colors"
          >
            {editingId === person.id ? (
              <div className="flex-1 flex gap-2">
                <input 
                  autoFocus
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-indigo-50 border-b-2 border-indigo-500 outline-none px-2 py-1 font-semibold"
                />
                <button onClick={saveEdit} className="text-green-600"><Check size={20} /></button>
                <button onClick={() => setEditingId(null)} className="text-gray-400"><X size={20} /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500 uppercase">
                    {person.name[0]}
                  </div>
                  <span className="font-semibold text-gray-800">{person.name}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(person)} className="p-2 text-gray-400 hover:text-indigo-500 active-scale">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => deletePerson(person.id, person.name)} className="p-2 text-red-300 hover:text-red-500 active-scale">
                    <Trash2 size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {filteredPeople.length === 0 && (
          <div className="text-center py-10 bg-gray-100/50 rounded-2xl border border-dashed border-gray-200">
            <p className="text-gray-400 text-sm">No hay personas que coincidan.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PeopleManager;
