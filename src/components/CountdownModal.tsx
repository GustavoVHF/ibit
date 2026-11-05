import { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, X } from 'lucide-react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Project } from '../types';
import { commitWrite } from '../utils/firestoreWrite';

interface CountdownModalProps {
  project: Project;
  onClose: () => void;
}

export default function CountdownModal({ project, onClose }: CountdownModalProps) {
  const [eventName, setEventName] = useState(project.targetEventName || '');
  const [eventDate, setEventDate] = useState(
    project.targetDate ? new Date(project.targetDate.seconds * 1000).toISOString().split('T')[0] : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!eventName.trim() || !eventDate) {
      alert('Por favor, preencha o nome do evento e a data.');
      return;
    }

    setIsSaving(true);
    try {
      await commitWrite(updateDoc(doc(db, 'projects', project.id), {
        targetEventName: eventName.trim(),
        targetDate: Timestamp.fromDate(new Date(eventDate))
      }), { label: 'o evento' });
      onClose();
    } catch (error) {
      console.error('Erro ao salvar evento:', error);
      alert('Erro ao salvar evento. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#ff7f00]" />
            </div>
            <h2 className="text-lg font-bold uppercase tracking-wider text-gray-900">
              Configurar Evento
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
              Nome do Evento
            </label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Ex: Torneio Nacional"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff7f00] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
              Data do Evento
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff7f00] focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-bold uppercase tracking-wider text-xs rounded-none hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-[#ff7f00] text-white font-bold uppercase tracking-wider text-xs rounded-none hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
