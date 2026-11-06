import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Scale, Trophy, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite } from '../../utils/firestoreWrite';
import { DecisionCriterionKey, DecisionMatrix, DecisionOption } from '../../types';
import {
  buildCriteriaRows,
  computeMatrix,
  CRITERIA_CATALOG,
  CriteriaRow,
  DEFAULT_CRITERIA,
  emptyOption,
  formatCriterionValue,
  getCriterionMeta,
  invalidFields,
  OptionField,
  optionLabel,
  rowsToCriteria,
  sumWeights,
  toStoredOption,
  validateProductIdentity,
} from './decisionMatrixHelpers';
import ProductSourcePicker from './ProductSourcePicker';
import { getLocale } from '../../i18n';
import { useI18n } from '../../i18n/LanguageContext';

interface DecisionMatrixEditorProps {
  projectId: string;
  initial?: DecisionMatrix | null;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

// Step labels come from t.finance.steps at render time.
const STEPS: { id: Step }[] = [{ id: 1 }, { id: 2 }, { id: 3 }];

// Campo da opção editado em cada linha do passo 2 (mesmos limites do antigo formulário).
const VALUE_INPUTS: Record<
  DecisionCriterionKey,
  { field: OptionField; step: string; min: number; max?: number; placeholder: string; suffix: string }
> = {
  preco: { field: 'price', step: '0.01', min: 0, placeholder: '0,00', suffix: 'R$' },
  pesoPorValor: { field: 'weightKg', step: '0.001', min: 0, placeholder: '0,000', suffix: 'kg' },
  ratePreco: { field: 'priceRating', step: '1', min: 1, max: 10, placeholder: '1–10', suffix: '/10' },
  rateQualidade: { field: 'qualityRating', step: '0.1', min: 0, max: 5, placeholder: '0–5', suffix: '★' },
  sustentabilidade: { field: 'sustainability', step: '1', min: 1, max: 10, placeholder: '1–10', suffix: '/10' },
  tempoEntrega: { field: 'deliveryDays', step: '1', min: 1, placeholder: '0', suffix: '' },
};

const parseNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const fmt2 = (v: number) => v.toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => `${(v * 100).toLocaleString(getLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

const navBtnCls =
  'px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors';
const primaryBtnCls =
  'px-6 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 active:scale-95 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none';

export default function DecisionMatrixEditor({ projectId, initial, onClose }: DecisionMatrixEditorProps) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [options, setOptions] = useState<DecisionOption[]>(() =>
    initial?.options?.length === 2
      ? initial.options.map((o) => toStoredOption(o))
      : [emptyOption('shopee'), emptyOption('shopee')]
  );
  const [rows, setRows] = useState<CriteriaRow[]>(() =>
    buildCriteriaRows(initial?.criteria?.length ? initial.criteria : DEFAULT_CRITERIA)
  );
  const [step, setStep] = useState<Step>(initial?.id ? 3 : 1);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const criteria = useMemo(() => rowsToCriteria(rows), [rows]);
  const result = useMemo(() => computeMatrix(options, criteria), [options, criteria]);
  const identityIssues = useMemo(() => validateProductIdentity(options), [options]);
  const invalid = useMemo(() => options.map((o) => invalidFields(o, criteria)), [options, criteria]);
  const complete = result.status === 'ok' && identityIssues.length === 0;
  const canSave = !!title.trim() && complete && !saving;
  const totalWeight = sumWeights(criteria);
  const enabledKeys = new Set(criteria.map((c) => c.key));

  const optionName = (i: number) => options[i]?.name?.trim() || optionLabel(i);

  const setOption = (index: number, option: DecisionOption) =>
    setOptions((prev) => prev.map((o, i) => (i === index ? option : o)));

  const setOptionField = (index: number, field: OptionField, v: number | null) =>
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: v } : o)));

  const updateRow = (key: DecisionCriterionKey, patch: Partial<CriteriaRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Passo 3 só com dados completos; senão leva ao passo com pendências e destaca os campos.
  const goTo = (target: Step) => {
    if (target === 3 && !complete) {
      setShowErrors(true);
      setStep(identityIssues.length > 0 ? 1 : 2);
      return;
    }
    setStep(target);
  };

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
        await commitWrite(
          updateDoc(doc(db, 'decisionMatrices', initial.id), { ...payload, updatedAt: serverTimestamp() }),
          { label: 'a comparação' }
        );
      } else {
        const ref = doc(collection(db, 'decisionMatrices'));
        await commitWrite(
          setDoc(ref, {
            projectId,
            ...payload,
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { label: 'a comparação' }
        );
      }
      onClose();
    } catch (e) {
      logFirestoreError(e, initial?.id ? OperationType.UPDATE : OperationType.CREATE, 'decisionMatrices');
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(
        /permission/i.test(msg)
          ? t.finance.noPermissionSave
          : t.finance.saveComparisonError
      );
    } finally {
      setSaving(false);
    }
  };

  const winner = result.status === 'ok' ? result.winnerIndex : null;
  const firstIdentityIssue = identityIssues[0];
  const generalIssue = result.issues.find((i) => i.optionIndex == null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-5xl h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50 shrink-0 space-y-4">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-[#ff7f00] shrink-0" />
            <input
              type="text"
              value={title}
              maxLength={199}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.finance.comparisonTitle}
              className={clsx(
                'flex-1 min-w-0 bg-white border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg transition-colors',
                step === 3 && !title.trim() ? 'placeholder-red-400' : 'placeholder-gray-300'
              )}
            />
            <button type="button" onClick={onClose} aria-label={t.common.close} className="text-gray-400 hover:text-gray-900 transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                className={clsx(
                  'flex-1 px-3 py-2 rounded-md font-bold text-[10px] sm:text-xs uppercase tracking-widest transition-all',
                  step === s.id
                    ? 'bg-[#ff7f00] text-white shadow-sm'
                    : s.id === 3 && !complete
                      ? 'text-gray-300'
                      : 'text-gray-500 hover:text-gray-900'
                )}
              >
                {s.id} {t.finance.steps[s.id]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#f8f9fa] scrollbar-hide">
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {options.map((o, i) => (
                  <ProductSourcePicker key={i} label={optionLabel(i)} value={o} onChange={(opt) => setOption(i, opt)} />
                ))}
              </div>
              {showErrors && firstIdentityIssue && (
                <p className="text-xs font-bold text-red-600">
                  {firstIdentityIssue.optionIndex != null ? `${optionLabel(firstIdentityIssue.optionIndex)}: ` : ''}
                  {firstIdentityIssue.message}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">
                      <th className="w-10 py-3 pl-4" />
                      <th className="text-left py-3 pr-3">{t.finance.criterion}</th>
                      <th className="text-left py-3 px-3">{t.finance.weight}</th>
                      <th className="text-right py-3 px-3">%</th>
                      {options.map((_, i) => (
                        <th key={i} className="text-left py-3 px-3 max-w-[160px] truncate" title={optionName(i)}>
                          {optionName(i)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CRITERIA_CATALOG.map((meta) => {
                      const row = rows.find((r) => r.key === meta.key)!;
                      const input = VALUE_INPUTS[meta.key];
                      // Peso por valor usa o preço: os valores de Preço ficam editáveis se qualquer um dos dois estiver ativo.
                      const valuesEditable =
                        meta.key === 'preco' ? enabledKeys.has('preco') || enabledKeys.has('pesoPorValor') : row.enabled;
                      const pct = row.enabled && totalWeight > 0 ? (Math.max(0, row.weight) / totalWeight) * 100 : 0;
                      return (
                        <tr key={meta.key} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pl-4">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => updateRow(meta.key, { enabled: e.target.checked })}
                              className="w-4 h-4 accent-[#ff7f00]"
                            />
                          </td>
                          <td className={clsx('py-2 pr-3 font-bold text-gray-900 whitespace-nowrap', !row.enabled && 'opacity-50')} title={meta.description}>
                            {meta.label} <span className="text-gray-400 font-normal">{meta.type === 'cost' ? '↓' : '↑'}</span>
                          </td>
                          <td className={clsx('py-2 px-3', !row.enabled && 'opacity-50')}>
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
                              className="w-20 bg-white border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg disabled:bg-gray-100"
                            />
                          </td>
                          <td className={clsx('py-2 px-3 text-right text-xs text-gray-400 tabular-nums', !row.enabled && 'opacity-50')}>
                            {row.enabled ? fmtPct(pct / 100) : '—'}
                          </td>
                          {options.map((o, i) => {
                            const flagged = showErrors && invalid[i].has(input.field);
                            return (
                              <td key={i} className={clsx('py-2 px-3', !valuesEditable && 'opacity-50')}>
                                <div className="relative w-32">
                                  <input
                                    type="number"
                                    step={input.step}
                                    min={input.min}
                                    max={input.max}
                                    disabled={!valuesEditable}
                                    value={o[input.field] ?? ''}
                                    onChange={(e) => setOptionField(i, input.field, parseNum(e.target.value))}
                                    placeholder={input.placeholder}
                                    className={clsx(
                                      'w-full bg-white border px-2 py-1.5 pr-10 text-sm text-gray-900 focus:outline-none font-bold rounded-lg placeholder-gray-300 disabled:bg-gray-100',
                                      flagged ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-[#ff7f00]'
                                    )}
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 pointer-events-none">
                                    {input.suffix || t.finance.daysSuffix}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                {t.finance.weightsSum(totalWeight.toLocaleString(locale, { maximumFractionDigits: 2 }))}
              </p>
              {showErrors && result.issues.length > 0 && (
                <p className="text-xs font-bold text-red-600">{generalIssue ? generalIssue.message : t.finance.fillHighlighted}</p>
              )}
            </div>
          )}

          {step === 3 &&
            (!complete ? (
              <p className="text-sm text-gray-500">{t.finance.completeToSee}</p>
            ) : (
              <div className="space-y-4">
                <div
                  className={clsx(
                    'rounded-xl p-4 border flex items-center justify-between gap-4',
                    winner != null ? 'bg-orange-50 border-[#ff7f00]' : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Trophy className={clsx('w-5 h-5 shrink-0', winner != null ? 'text-[#ff7f00]' : 'text-gray-400')} />
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {winner != null ? t.finance.winner(optionName(winner)) : t.finance.tie}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-700 tabular-nums shrink-0">
                    {result.totals.map((t, i) => `${String.fromCharCode(65 + i)} ${fmt2(t)}`).join(' × ')}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">
                        <th className="text-left py-3 px-4">{t.finance.criterion}</th>
                        <th className="text-right py-3 px-3">{t.finance.weight}</th>
                        {options.map((_, i) => (
                          <th key={i} className="text-right py-3 px-4 max-w-[160px] truncate" title={optionName(i)}>
                            {optionName(i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => {
                        const best = Math.max(...row.scores);
                        const allEqual = row.scores.every((s) => s === best);
                        return (
                          <tr key={row.key} className="border-b border-gray-100">
                            <td className="py-2.5 px-4 font-bold text-gray-900">{getCriterionMeta(row.key).label}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-500">{fmtPct(row.weight)}</td>
                            {row.scores.map((s, i) => (
                              <td key={i} className="py-2.5 px-4 text-right tabular-nums">
                                <span className={clsx('block font-bold', !allEqual && s === best ? 'text-[#ff7f00]' : 'text-gray-900')}>
                                  {fmt2(s)}
                                </span>
                                <span className="block text-[10px] text-gray-400">{formatCriterionValue(row.key, row.values[i])}</span>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50">
                        <td className="py-3 px-4 font-bold text-gray-900 uppercase tracking-widest text-xs">{t.finance.finalScore}</td>
                        <td className="py-3 px-3 text-right tabular-nums text-gray-500">100%</td>
                        {result.totals.map((t, i) => (
                          <td
                            key={i}
                            className={clsx('py-3 px-4 text-right tabular-nums font-bold text-base', winner === i ? 'text-[#ff7f00]' : 'text-gray-900')}
                          >
                            {fmt2(t)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3 shrink-0">
          {saveError ? (
            <p className="text-xs font-bold text-red-600">{saveError}</p>
          ) : step === 3 && complete && !title.trim() ? (
            <p className="text-xs font-bold text-red-600">{t.finance.titleRequired}</p>
          ) : null}
          <div className="flex gap-3 ml-auto">
            {step > 1 && (
              <button type="button" onClick={() => setStep((step - 1) as Step)} className={navBtnCls}>
                {t.common.back}
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => goTo((step + 1) as Step)}
                className={clsx(primaryBtnCls, step === 2 && !complete && 'opacity-50')}
              >
                {t.finance.next}
              </button>
            ) : (
              <button type="button" onClick={handleSave} disabled={!canSave} className={primaryBtnCls}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.common.save}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
