import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Scale, SlidersHorizontal, Trophy, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/errorHandlers';
import { DecisionCriterion, DecisionMatrix, DecisionOption } from '../../types';
import {
  computeMatrix,
  DEFAULT_CRITERIA,
  emptyOption,
  formatCriterionValue,
  getCriterionMeta,
  optionLabel,
  toStoredOption,
  validateProductIdentity,
} from './decisionMatrixHelpers';
import ProductSourcePicker from './ProductSourcePicker';
import CriteriaModal from './CriteriaModal';

interface DecisionMatrixEditorProps {
  projectId: string;
  initial?: DecisionMatrix | null;
  onClose: () => void;
}

const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

export default function DecisionMatrixEditor({ projectId, initial, onClose }: DecisionMatrixEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [options, setOptions] = useState<DecisionOption[]>(() =>
    initial?.options?.length === 2
      ? initial.options.map((o) => toStoredOption(o))
      : [emptyOption('shopee'), emptyOption('shopee')]
  );
  const [criteria, setCriteria] = useState<DecisionCriterion[]>(() =>
    initial?.criteria?.length ? initial.criteria.map((c) => ({ ...c })) : DEFAULT_CRITERIA.map((c) => ({ ...c }))
  );
  const [isCriteriaOpen, setIsCriteriaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const enabledKeys = useMemo(() => criteria.map((c) => c.key), [criteria]);
  const result = useMemo(() => computeMatrix(options, criteria), [options, criteria]);
  const identityIssues = useMemo(() => validateProductIdentity(options), [options]);
  const allIssues = [...identityIssues, ...result.issues];
  const canSave = !!title.trim() && result.status === 'ok' && identityIssues.length === 0 && !saving;

  const optionName = (i: number) => options[i]?.name?.trim() || optionLabel(i);

  const setOption = (index: number, option: DecisionOption) =>
    setOptions((prev) => prev.map((o, i) => (i === index ? option : o)));

  const handleSave = async () => {
    if (!canSave || !user) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      title: title.trim(),
      criteria: criteria.map((c) => ({ key: c.key, weight: c.weight })),
      options: options.map((o) => toStoredOption(o)),
      result: { totals: result.totals, winnerIndex: result.winnerIndex },
    };
    try {
      if (initial?.id) {
        await updateDoc(doc(db, 'decisionMatrices', initial.id), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'decisionMatrices'), {
          projectId,
          ...payload,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (e) {
      try {
        handleFirestoreError(e, initial?.id ? OperationType.UPDATE : OperationType.CREATE, 'decisionMatrices');
      } catch {
        // handleFirestoreError sempre relança; o erro é exibido inline.
      }
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(
        /permission/i.test(msg)
          ? 'Sem permissão para salvar. Verifique se as regras do Firestore foram publicadas.'
          : 'Erro ao salvar a comparação. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const winner = result.status === 'ok' ? result.winnerIndex : null;
  const delta = result.status === 'ok' && result.totals.length === 2 ? Math.abs(result.totals[0] - result.totals[1]) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-6xl h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="flex justify-between items-center gap-4 p-4 sm:p-6 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Scale className="w-5 h-5 text-[#ff7f00] shrink-0" />
            <input
              type="text"
              value={title}
              maxLength={199}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da comparação (ex: Garrafa térmica 1L)"
              className="flex-1 min-w-0 bg-white border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg placeholder-gray-300 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsCriteriaOpen(true)}
            className="shrink-0 px-3 sm:px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#ff7f00]" />
            Critérios ({criteria.length})
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#f8f9fa] scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {options.map((o, i) => (
              <div key={i} className={clsx('rounded-xl transition-shadow', winner === i && 'ring-2 ring-[#ff7f00]')}>
                <ProductSourcePicker
                  label={optionLabel(i).toUpperCase()}
                  value={o}
                  onChange={(opt) => setOption(i, opt)}
                  enabledKeys={enabledKeys}
                />
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Resultado da matriz</h4>

            {allIssues.length > 0 ? (
              <div className="flex gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest mb-2">Dados incompletos</p>
                  <ul className="text-sm text-yellow-900 space-y-1 list-disc pl-4">
                    {allIssues.map((issue, idx) => (
                      <li key={idx}>
                        {issue.optionIndex != null ? `${optionLabel(issue.optionIndex)}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div
                  className={clsx(
                    'rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border',
                    winner != null ? 'bg-orange-50 border-[#ff7f00]' : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Trophy className={clsx('w-6 h-6 shrink-0', winner != null ? 'text-[#ff7f00]' : 'text-gray-400')} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {winner != null ? 'Vencedor' : 'Resultado'}
                      </p>
                      <p className="text-base font-bold text-gray-900 truncate">
                        {winner != null ? `VENCEDOR: ${optionName(winner)}` : 'EMPATE'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    {result.totals.map((t, i) => (
                      <div key={i} className="text-right">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{optionLabel(i)}</p>
                        <p className={clsx('text-2xl font-bold tabular-nums', winner === i ? 'text-[#ff7f00]' : 'text-gray-900')}>
                          {fmt2(t)}
                        </p>
                      </div>
                    ))}
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Δ</p>
                      <p className="text-2xl font-bold tabular-nums text-gray-500">{fmt2(delta)}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead>
                      <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">
                        <th className="text-left py-2 pr-3">Critério</th>
                        <th className="text-left py-2 px-3">Tipo</th>
                        <th className="text-right py-2 px-3">Peso %</th>
                        {options.map((_, i) => (
                          <React.Fragment key={i}>
                            <th className={clsx('text-right py-2 px-3', winner === i && 'bg-orange-50 text-[#ff7f00]')}>Valor {String.fromCharCode(65 + i)}</th>
                            <th className={clsx('text-right py-2 px-3', winner === i && 'bg-orange-50 text-[#ff7f00]')}>Nota {String.fromCharCode(65 + i)}</th>
                            <th className={clsx('text-right py-2 px-3', winner === i && 'bg-orange-50 text-[#ff7f00]')}>Ponderada {String.fromCharCode(65 + i)}</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => {
                        const meta = getCriterionMeta(row.key);
                        return (
                          <tr key={row.key} className="border-b border-gray-100">
                            <td className="py-2.5 pr-3 font-bold text-gray-900">{meta.label}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={clsx(
                                  'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border',
                                  meta.type === 'cost' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'
                                )}
                              >
                                {meta.type === 'cost' ? 'Custo ↓' : 'Benefício ↑'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{fmtPct(row.weight)}</td>
                            {options.map((_, i) => (
                              <React.Fragment key={i}>
                                <td className={clsx('py-2.5 px-3 text-right tabular-nums text-gray-700', winner === i && 'bg-orange-50/60')}>
                                  {formatCriterionValue(row.key, row.values[i])}
                                </td>
                                <td className={clsx('py-2.5 px-3 text-right tabular-nums text-gray-900 font-bold', winner === i && 'bg-orange-50/60')}>
                                  {fmt2(row.scores[i])}
                                </td>
                                <td className={clsx('py-2.5 px-3 text-right tabular-nums text-gray-700', winner === i && 'bg-orange-50/60')}>
                                  {fmt2(row.weighted[i])}
                                </td>
                              </React.Fragment>
                            ))}
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50">
                        <td className="py-3 pr-3 font-bold text-gray-900 uppercase tracking-widest text-xs" colSpan={2}>
                          Nota final
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-gray-700">100%</td>
                        {result.totals.map((t, i) => (
                          <React.Fragment key={i}>
                            <td className={clsx('py-3 px-3', winner === i && 'bg-orange-50')} colSpan={2} />
                            <td
                              className={clsx(
                                'py-3 px-3 text-right tabular-nums font-bold text-base',
                                winner === i ? 'bg-orange-50 text-[#ff7f00]' : 'text-gray-900'
                              )}
                            >
                              {fmt2(t)}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-4">
                  {options.map((o, i) =>
                    o.link ? (
                      <a
                        key={i}
                        href={o.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-[#ff7f00] uppercase tracking-widest flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> {optionLabel(i)} · {o.storeName}
                      </a>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
          {saveError && <p className="text-xs font-bold text-red-600 sm:mr-auto">{saveError}</p>}
          {!saveError && !title.trim() && (
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest sm:mr-auto">Informe um título para salvar</p>
          )}
          <div className="flex gap-3 sm:ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 sm:flex-none px-6 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 active:scale-95 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </motion.div>

      <CriteriaModal
        isOpen={isCriteriaOpen}
        criteria={criteria}
        onClose={() => setIsCriteriaOpen(false)}
        onApply={(next) => {
          setCriteria(next);
          setIsCriteriaOpen(false);
        }}
      />
    </div>
  );
}
