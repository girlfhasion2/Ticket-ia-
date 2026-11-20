
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Ticket } from '../types';
import { 
  Download, Upload, Trash2, Info, ShieldCheck, 
  FileSpreadsheet, Check, X, Calendar, Store 
} from 'lucide-react';
import * as XLSX from 'xlsx';

const Settings: React.FC = () => {
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);

  useEffect(() => {
    if (showExportPicker) {
      db.tickets.orderBy('date').reverse().toArray().then(setTickets);
    }
  }, [showExportPicker]);

  const toggleTicketSelection = (id: string) => {
    setSelectedTicketIds(prev => 
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const exportData = async () => {
    const tickets = await db.tickets.toArray();
    const people = await db.people.toArray();
    const data = JSON.stringify({ tickets, people }, null, 2);
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ticketsplit-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateExcel = () => {
    const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
    if (selectedTickets.length === 0) return window.alert("Selecciona al menos un ticket");

    const extendedDetailsRows: any[] = [];
    const personTotals: { [name: string]: number } = {};
    const ticketSummaries: any[] = [];

    selectedTickets.forEach(ticket => {
      ticketSummaries.push({
        Fecha: ticket.date,
        Comercio: ticket.merchant,
        'Importe Ticket': ticket.totalAmount
      });

      ticket.lines.forEach(line => {
        line.assignments.forEach(asgn => {
          if (asgn.personIds.length === 0) return;
          const unitsPerPerson = asgn.units / asgn.personIds.length;
          const costPerPerson = unitsPerPerson * line.unitPrice;
          
          asgn.personIds.forEach(pid => {
            const p = ticket.participants.find(part => part.id === pid);
            const personName = p ? p.name : 'Desconocido';
            personTotals[personName] = (personTotals[personName] || 0) + costPerPerson;

            extendedDetailsRows.push({
              Fecha: ticket.date,
              Comercio: ticket.merchant,
              Producto: line.description,
              'Cant. Total Ticket': line.quantity,
              'Precio Unitario': line.unitPrice,
              'Total Producto (€)': line.total,
              Persona: personName,
              'Sus Unidades': Number(unitsPerPerson.toFixed(3)),
              'Su Importe (€)': Number(costPerPerson.toFixed(2))
            });
          });
        });
      });
    });

    const summaryRows = Object.entries(personTotals).map(([Nombre, Total]) => ({
      Nombre,
      'Total a Pagar (€)': Number(Total.toFixed(2))
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Totales por Persona");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extendedDetailsRows), "Detalle de Reparto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ticketSummaries), "Resumen Tickets");
    XLSX.writeFile(wb, `reparto-detallado-${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportPicker(false);
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { tickets, people } = JSON.parse(event.target?.result as string);
        if (window.confirm("Se van a sobreescribir o añadir datos externos. ¿Continuar?")) {
          for (const p of people) await db.people.put(p);
          for (const t of tickets) await db.tickets.put(t);
          window.alert("Importación completada con éxito.");
          window.location.reload();
        }
      } catch (error) {
        window.alert("Error al importar: formato de archivo inválido.");
      }
    };
    reader.readAsText(file);
  };

  const clearDatabase = async () => {
    if (window.confirm("¿ESTÁS SEGURO? Esto borrará permanentemente todos tus tickets y personas de este dispositivo.")) {
      await db.tickets.clear();
      await db.people.clear();
      window.alert("Base de datos limpia.");
      window.location.reload();
    }
  };

  return (
    <div className="p-4 bg-gray-50 min-h-full">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>
        <p className="text-sm text-gray-500">Controla tus datos y exportaciones</p>
      </header>

      <div className="space-y-4 pb-20">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Download size={18} className="text-indigo-600" />
              Exportar Gastos
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <button 
              onClick={() => setShowExportPicker(true)}
              className="w-full flex items-center justify-between p-4 bg-indigo-50 rounded-2xl hover:bg-indigo-100 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-black text-indigo-900 text-sm">Exportar a EXCEL (.xlsx)</p>
                <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">Reporte detallado por producto y persona</p>
              </div>
              <FileSpreadsheet size={24} className="text-indigo-400 group-hover:text-indigo-600" />
            </button>

            <button 
              onClick={exportData}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-bold text-gray-800 text-sm">Backup Completo (JSON)</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Descarga todos los datos para restaurar luego</p>
              </div>
              <Download size={24} className="text-gray-400 group-hover:text-gray-600" />
            </button>

            <label className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group cursor-pointer active-scale">
              <div className="text-left">
                <p className="font-bold text-gray-800 text-sm">Importar Backup</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Restaura una copia de seguridad previa</p>
              </div>
              <Upload size={24} className="text-gray-400 group-hover:text-gray-600" />
              <input type="file" accept=".json" onChange={importData} className="hidden" />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-red-600 flex items-center gap-2 uppercase text-[10px] tracking-widest">
              <Trash2 size={18} />
              Zona Peligrosa
            </h3>
          </div>
          <div className="p-4">
            <button 
              onClick={clearDatabase}
              className="w-full flex items-center justify-between p-4 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors group active-scale"
            >
              <div className="text-left">
                <p className="font-bold text-red-700 text-sm">Borrar todo</p>
                <p className="text-[10px] text-red-500/70 font-bold uppercase tracking-tight">Eliminar todos los datos locales</p>
              </div>
              <Trash2 size={24} className="text-red-300 group-hover:text-red-600" />
            </button>
          </div>
        </section>

        <div className="p-6 bg-indigo-50 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 font-black text-xs uppercase tracking-widest">
            <ShieldCheck size={18} />
            Privacidad Offline
          </div>
          <p className="text-[11px] text-indigo-600/80 font-bold leading-relaxed">
            Tus datos se guardan exclusivamente en tu dispositivo. Al exportar a Excel, el procesamiento se realiza localmente en tu navegador.
          </p>
        </div>
      </div>

      {showExportPicker && (
        <div className="fixed inset-0 bg-indigo-950/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-600 text-white">
              <div>
                <h2 className="font-black text-lg uppercase tracking-tight">Exportar a Excel</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Selecciona los tickets para el reporte</p>
              </div>
              <button onClick={() => setShowExportPicker(false)} className="p-2 bg-white/20 rounded-full active-scale">
                <X size={20} />
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
              <button 
                onClick={() => setSelectedTicketIds(tickets.map(t => t.id))}
                className="w-full text-center py-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 rounded-xl mb-4"
              >
                Marcar todos
              </button>
              
              {tickets.length === 0 ? (
                <p className="text-center py-10 text-gray-400 font-bold text-sm italic">No hay tickets guardados.</p>
              ) : (
                tickets.map(t => (
                  <div 
                    key={t.id}
                    onClick={() => toggleTicketSelection(t.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedTicketIds.includes(t.id) 
                        ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100' 
                        : 'bg-gray-50 border-gray-100 grayscale opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
                        <Store size={20} />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-sm truncate max-w-[150px]">{t.merchant}</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
                          <Calendar size={12} />
                          <span>{t.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-black text-gray-900 text-sm">{t.totalAmount.toFixed(2)}€</p>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedTicketIds.includes(t.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'
                      }`}>
                        {selectedTicketIds.includes(t.id) && <Check size={14} />}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowExportPicker(false)} className="flex-1 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest active-scale bg-white rounded-2xl border border-gray-200">
                Cancelar
              </button>
              <button 
                onClick={generateExcel}
                className="flex-[2] py-4 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-200 active-scale disabled:opacity-50"
                disabled={selectedTicketIds.length === 0}
              >
                Generar Excel ({selectedTicketIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
