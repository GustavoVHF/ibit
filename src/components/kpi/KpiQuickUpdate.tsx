import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Zap } from 'lucide-react';
import { ProjectKPI } from '../../types';
import { formatTarget } from './kpiHelpers';

interface KpiQuickUpdateProps {
  kpi: ProjectKPI;
  onClose: () => void;
  onSave: (kpiId: string, newValue: number, note?: string) => Promise<void>;
}

/**
 * Lightweight popover/modal to quickly bump a KPI's current value without
 * opening the full edit form. Triggered by clicking the current value cell.
 */
export default function KpiQuickUpdate({ kpi, onClose, onSave }: KpiQuickUpdateProps) {
  const [value, setValue] = useState(String(kpi.currentValue));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parseFloat(value.replace(',', '.'));
    if (isNaN(parsed)) return;
    setSaving(true);
    try {
      await onSave(kpi.id, parsed, note.trim() || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[900] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#ff7f00]" />
              Atualização Rápida
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-900 truncate" title={kpi.name}>{kpi.name}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                Meta: {formatTarget(kpi)}
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                Novo Valor Atual
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-lg font-bold text-gray-900 focus:outline-none focus:border-[#ff7f00] focus:ring-2 focus:ring-orange-100"
                />
                {kpi.targetUnit && (
                  <span className="text-sm font-bold text-gray-400 shrink-0">{kpi.targetUnit}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                Nota (opcional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Resultado do sprint 4"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:border-[#ff7f00]"
              />
            </div>
          </div>

          <div className="flex gap-3 p-5 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || value.trim() === ''}
              className="flex-1 px-4 py-2.5 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white font-bold uppercase tracking-widest text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-orange-100"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Atualizar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
