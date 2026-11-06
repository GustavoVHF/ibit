import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, TrendingUp, User as UserIcon, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { StatusReport, ImpactStatus, StatusReportImpactEvaluation } from '../../types';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../../utils/firestoreWrite';
import { IMPACT_STATUSES, IMPACT_STATUS_STYLES, formatDate, generateEvaluationId } from './statusReportHelpers';
import { useI18n } from '../../i18n/LanguageContext';

interface ImpactEvaluationModalProps {
  report: StatusReport;
  currentUserUid: string;
  currentUserName: string;
  onClose: () => void;
}

/**
 * "Avaliação de Impacto & Histórico" — lets managers register a post-meeting
 * impact assessment ("o que mudou?") and browse the timeline of previous
 * evaluations for this report.
 */
export default function ImpactEvaluationModal({ report, currentUserUid, currentUserName, onClose }: ImpactEvaluationModalProps) {
  const { t } = useI18n();
  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  const [impactStatus, setImpactStatus] = useState<ImpactStatus>(report.impactStatus || 'Pendente de Avaliação');
  const [whatChanged, setWhatChanged] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const history = [...(report.impactEvaluations || [])].sort((a, b) => {
    const ta = a.date?.toMillis?.() || 0;
    const tb = b.date?.toMillis?.() || 0;
    return tb - ta;
  });

  const handleSaveNewEvaluation = async () => {
    if (!whatChanged.trim()) return;
    setSaving(true);
    try {
      const newEvaluation: StatusReportImpactEvaluation = {
        id: generateEvaluationId(),
        date: new Date(),
        authorUid: currentUserUid,
        authorName: currentUserName,
        whatChanged: whatChanged.trim(),
        impactStatus,
      };

      await commitWrite(updateDoc(doc(db, 'statusReports', report.id), {
        impactStatus,
        impactEvaluations: [...(report.impactEvaluations || []), newEvaluation],
        updatedAt: serverTimestamp(),
      }), { label: 'a avaliação de impacto' });
      setWhatChanged('');
      setIsNewFormOpen(false);
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'statusReports');
      alert(friendlyWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvaluation = async (evaluationId: string) => {
    setDeletingId(evaluationId);
    try {
      const updatedHistory = (report.impactEvaluations || []).filter((ev) => ev.id !== evaluationId);
      await commitWrite(updateDoc(doc(db, 'statusReports', report.id), {
        impactEvaluations: updatedHistory,
        updatedAt: serverTimestamp(),
      }), { label: 'a exclusão da avaliação' });
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'statusReports');
      alert(friendlyWriteError(error));
    } finally {
      setDeletingId(null);
    }
  };

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[900] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
            <div>
              <h2 className="text-lg font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#ff7f00]" />
                {t.statusReports.impactEvaluation}
              </h2>
              <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mt-0.5 line-clamp-1">
                {report.agenda}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
            {/* Status de Impacto atual */}
            <div className="flex items-center justify-between">
              <span className={clsx('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border', IMPACT_STATUS_STYLES[report.impactStatus || 'Pendente de Avaliação'])}>
                {t.enums.impactStatus[report.impactStatus || 'Pendente de Avaliação']}
              </span>
              {!isNewFormOpen && (
                <button
                  type="button"
                  onClick={() => setIsNewFormOpen(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#ff7f00] hover:text-orange-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.statusReports.newEvaluation}
                </button>
              )}
            </div>

            {/* Formulário de nova avaliação */}
            {isNewFormOpen && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    {t.statusReports.impactStatus}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {IMPACT_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setImpactStatus(status)}
                        className={clsx(
                          'px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all text-center',
                          impactStatus === status
                            ? IMPACT_STATUS_STYLES[status] + ' ring-1 ring-inset ring-current'
                            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                        )}
                      >
                        {t.enums.impactStatus[status]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                    {t.statusReports.whatChanged}
                  </label>
                  <textarea
                    value={whatChanged}
                    onChange={(e) => setWhatChanged(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 resize-none focus:outline-none focus:border-[#ff7f00] focus:ring-2 focus:ring-orange-100 bg-white"
                    placeholder={t.statusReports.whatChangedPlaceholder}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsNewFormOpen(false); setWhatChanged(''); }}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-[11px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewEvaluation}
                    disabled={saving || !whatChanged.trim()}
                    className="flex-1 px-4 py-2 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white font-bold uppercase tracking-widest text-[11px] rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t.statusReports.saveEvaluation}
                  </button>
                </div>
              </div>
            )}

            {/* Linha do Tempo de Avaliações */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                {t.statusReports.evaluationHistory}
              </label>
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 font-medium">{t.statusReports.noEvaluations}</p>
              ) : (
                <div className="relative pl-4 border-l-2 border-gray-100 space-y-3 max-h-72 overflow-y-auto pr-1">
                  {history.map((ev) => (
                    <div key={ev.id} className="relative group">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#ff7f00] border-2 border-white shadow" />
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-gray-900">{formatDate(ev.date)}</span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                          <UserIcon className="w-3 h-3" />
                          {ev.authorName}
                        </span>
                        <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold border', IMPACT_STATUS_STYLES[ev.impactStatus])}>
                          {t.enums.impactStatus[ev.impactStatus]}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvaluation(ev.id)}
                          disabled={deletingId === ev.id}
                          className="ml-auto p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 disabled:opacity-50"
                          title={t.statusReports.deleteEvaluation}
                        >
                          {deletingId === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{ev.whatChanged}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 p-6 border-t border-gray-100 bg-gray-50/50 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t.common.close}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
