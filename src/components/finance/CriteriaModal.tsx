import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, SlidersHorizontal, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';
import { DecisionCriterion, DecisionCriterionKey } from '../../types';
import { CRITERIA_CATALOG, DEFAULT_CRITERIA, rebalanceTo100, sumWeights } from './decisionMatrixHelpers';

interface CriteriaModalProps {
  isOpen: boolean;
  criteria: DecisionCriterion[];
  onClose: () => void;
  onApply: (criteria: DecisionCriterion[]) => void;
}

interface Row {
  key: DecisionCriterionKey;
  enabled: boolean;
  weight: number;
}

const buildRows = (criteria: DecisionCriterion[]): Row[] =>
  CRITERIA_CATALOG.map((meta) => {
    const current = criteria.find((c) => c.key === meta.key);
    const fallback = DEFAULT_CRITERIA.find((c) => c.key === meta.key)?.weight ?? 0;
    return { key: meta.key, enabled: !!current, weight: current ? current.weight : fallback };
  });

const fmt = (v: number, digits: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);

export default function CriteriaModal({ isOpen, criteria, onClose, onApply }: CriteriaModalProps) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(criteria));

  useEffect(() => {
    if (isOpen) setRows(buildRows(criteria));
  }, [isOpen, criteria]);

  const enabled = rows.filter((r) => r.enabled).map((r) => ({ key: r.key, weight: r.weight }));
  const total = sumWeights(enabled);
  const isHundred = Math.abs(total - 100) < 0.005;
  const canApply = enabled.length > 0 && total > 0;

  const updateRow = (key: DecisionCriterionKey, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const normalize = () => {
    const balanced = rebalanceTo100(enabled);
    setRows((prev) =>
      prev.map((r) => {
        const b = balanced.find((c) => c.key === r.key);
        return b ? { ...r, weight: b.weight } : r;
      })
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border border-gray-200 w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50 shrink-0">
              <h3 className="text-lg font-bold uppercase tracking-widest text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#ff7f00]" />
                Critérios e pesos
              </h3>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-hide">
              {CRITERIA_CATALOG.map((meta) => {
                const row = rows.find((r) => r.key === meta.key)!;
                const pct = row.enabled && total > 0 ? (Math.max(0, row.weight) / total) * 100 : 0;
                return (
                  <div
                    key={meta.key}
                    className={clsx(
                      'border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors',
                      row.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                    )}
                  >
                    <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => updateRow(meta.key, { enabled: e.target.checked })}
                        className="mt-0.5 w-4 h-4 accent-[#ff7f00] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 uppercase tracking-wider">{meta.label}</span>
                          <span
                            className={clsx(
                              'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border',
                              meta.type === 'cost'
                                ? 'bg-red-50 text-red-600 border-red-100'
                                : 'bg-green-50 text-green-600 border-green-100'
                            )}
                          >
                            {meta.type === 'cost' ? 'Custo ↓' : 'Benefício ↑'}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{meta.unit}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{meta.description}</p>
                      </div>
                    </label>
                    <div className="flex items-center gap-3 shrink-0 sm:ml-auto">
                      <div>
                        <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Peso</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          disabled={!row.enabled}
                          value={row.weight}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            updateRow(meta.key, { weight: e.target.value === '' || !Number.isFinite(n) ? 0 : Math.max(0, n) });
                          }}
                          className="w-24 bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg disabled:bg-gray-100"
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Norm.</span>
                        <span className="text-sm font-bold text-[#ff7f00] tabular-nums">{fmt(pct, 1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Soma dos pesos: <span className={clsx('tabular-nums', isHundred ? 'text-green-600' : 'text-gray-900')}>{fmt(total, 2)}%</span>
                </span>
                {!isHundred && canApply && (
                  <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
                    <span className="text-xs font-bold text-yellow-800">Pesos somam {fmt(total, 2)}% — serão normalizados para 100%</span>
                    <button
                      type="button"
                      onClick={normalize}
                      className="px-2.5 py-1 bg-white border border-yellow-300 text-yellow-800 font-bold uppercase tracking-widest text-[10px] rounded-md hover:bg-yellow-100"
                    >
                      Normalizar
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  Método da soma ponderada: os pesos são normalizados para somar 100%. Cada critério recebe uma nota de 0 a 10 —
                  em critérios de <b>custo</b> o menor valor é melhor (nota = 10 × menor ÷ valor); em critérios de <b>benefício</b> o
                  maior é melhor (nota = 10 × valor ÷ maior). Rate de preço e sustentabilidade (1–10) entram diretamente como nota.
                  Nota final = Σ nota × peso.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canApply}
                onClick={() => onApply(enabled)}
                className="flex-1 px-4 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Aplicar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
