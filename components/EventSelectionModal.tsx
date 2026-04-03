import React, { useState, useEffect } from 'react';
import { CloseIcon, UsersIcon, TrashIcon, SparklesIcon } from './Icons';
import { clearEventStorage } from '../utils/storage';

interface EventSelectionModalProps {
  currentEventId: string;
  onClose: () => void;
  onSelectEvent: (eventId: string) => void;
}

const EventSelectionModal: React.FC<EventSelectionModalProps> = ({ currentEventId, onClose, onSelectEvent }) => {
  const [existingEvents, setExistingEvents] = useState<string[]>([]);
  const [newEventName, setNewEventName] = useState('');

  useEffect(() => {
    // Scan localStorage for unique prefixes ending in ':'
    const events = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes(':')) {
        const prefix = key.split(':')[0];
        if (prefix && prefix !== 'undefined') {
          events.add(prefix);
        }
      }
    }
    // Ensure current event is in the list even if empty
    events.add(currentEventId);
    
    setExistingEvents(Array.from(events).sort());
  }, [currentEventId]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEventName.trim()) {
      const sanitized = newEventName.trim().replace(/\s+/g, '-').toLowerCase();
      onSelectEvent(sanitized);
    }
  };

  const handleDelete = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (eventId === currentEventId) {
        alert("Você não pode excluir o evento que está usando no momento.");
        return;
    }
    if (window.confirm(`Tem certeza que deseja excluir todos os dados locais e configurações do evento "${eventId}"?`)) {
        clearEventStorage(eventId);
        setExistingEvents(prev => prev.filter(e => e !== eventId));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[80] p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <UsersIcon className="w-6 h-6 text-indigo-400" />
             <h2 className="text-xl font-semibold text-white">Meus Eventos (Perfis)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-4 overflow-y-auto flex-grow">
           
           {/* Section explaining the concept */}
           <div className="bg-indigo-900/40 border border-indigo-500/50 rounded-lg p-4 mb-6">
             <div className="flex items-start gap-3">
                <SparklesIcon className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                    <h3 className="text-sm font-bold text-white mb-1">Precisa conectar outra planilha?</h3>
                    <p className="text-sm text-indigo-200 mb-2">
                       O sistema funciona com <strong>Perfis de Evento</strong>.
                    </p>
                    <ol className="text-xs text-slate-300 list-decimal list-inside space-y-1">
                        <li>Crie um <strong>Novo Evento</strong> abaixo (ex: "loja-shopping").</li>
                        <li>O app vai abrir uma tela limpa.</li>
                        <li>Nessa nova tela, você cola o endereço da <strong>outra planilha</strong>.</li>
                    </ol>
                    <p className="text-xs text-slate-400 mt-2 italic">
                        Dica: Seus dados do evento atual ({currentEventId}) ficam salvos. Você pode voltar para ele quando quiser clicando na lista abaixo.
                    </p>
                </div>
             </div>
           </div>

           <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Criar Novo Evento (Nova Conexão)</h3>
           <form onSubmit={handleCreate} className="mb-6 flex gap-2">
             <input 
                type="text" 
                value={newEventName}
                onChange={e => setNewEventName(e.target.value)}
                placeholder="Nome (ex: feira-sp)"
                className="flex-grow bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
             />
             <button type="submit" disabled={!newEventName.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-bold transition-colors">
                Criar
             </button>
           </form>

           <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Alternar Evento</h3>
           <div className="space-y-2">
              {existingEvents.map(eventId => {
                  const isActive = eventId === currentEventId;
                  return (
                    <div 
                        key={eventId}
                        onClick={() => !isActive && onSelectEvent(eventId)}
                        className={`flex justify-between items-center p-3 rounded-lg border transition-all cursor-pointer ${
                            isActive 
                            ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50' 
                            : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 hover:border-slate-500'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`}></div>
                            <div>
                                <p className={`font-mono text-sm ${isActive ? 'text-white font-bold' : 'text-slate-300'}`}>{eventId}</p>
                                {isActive && <p className="text-[10px] text-indigo-300">Em uso (Planilha Conectada)</p>}
                            </div>
                        </div>
                        {!isActive && (
                            <button 
                                onClick={(e) => handleDelete(eventId, e)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-full transition-colors"
                                title="Apagar dados deste evento">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                  );
              })}
           </div>
        </main>
      </div>
    </div>
  );
};

export default EventSelectionModal;