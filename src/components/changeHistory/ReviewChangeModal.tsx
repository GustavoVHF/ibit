import React, { useState } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { BarChart3, Check, Link2, Loader2, UserRound, X } from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { ChangeHistoryEntry, ChangeStatus, GanttTask, Task } from '../../types';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../../utils/firestoreWrite';
import { CHANGE_HISTORY_COLLECTION, diffInDays, shiftDate, toDateSafe } from '../../utils/changeHistory';
import { DECISION_OPTIONS, SECTOR_TAG_STYLES, SOURCE_STYLES, STATUS_STYLES, formatDateTime, formatSignedCurrency, formatSignedDays, impactTone, isReviewable, sourceLabel, statusLabel } from './changeHistoryHelpers';

interface ReviewChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ChangeHistoryEntry;
  currentUser: { uid: string; name: string };
  canDecide: boolean;
  ganttTasks: GanttTask[];
  kanbanTasks: Task[];
  projectMemberIds: string[];
  onEdit?: (entry: ChangeHistoryEntry) => void;
}

const badgeBase = 'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap inline-flex items-center gap-1';

export default function ReviewChangeModal({ isOpen, onClose, entry, currentUser, canDecide, ganttTasks, kanbanTasks, projectMemberIds, onEdit }: ReviewChangeModalProps) {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<ChangeStatus | null>(entry.status === 'Pendente' ? null : entry.status);
  const [decisionNote, setDecisionNote] = useState(entry.decisionNote || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isAuto = entry.origin === 'auto';
  const canReview = canDecide && isReviewable(entry);
  const ganttTask = entry.linkedGanttTaskId ? ganttTasks.find((task) => task.id === entry.linkedGanttTaskId) : null;
  const kanbanTask = entry.linkedKanbanTaskId ? kanbanTasks.find((task) => task.id === entry.linkedKanbanTaskId) : null;

  const handleSave = async () => {
    if (!decision) return setError('Escolha uma decisão para continuar.');
    if (!decisionNote.trim()) return setError('A justificativa da decisão é obrigatória.');

    setLoading(true);
    setError('');

    try {
      const batch = writeBatch(db);
      const entryRef = doc(db, CHANGE_HISTORY_COLLECTION, entry.id);
      const now = new Date();
      const isApproval = decision === 'Aprovado';
      const shiftDays = entry.impactDays || 0;
      let applied = false;

      if (isApproval && !entry.appliedAt) {
        let ganttStart: Date | null = null;
        let ganttEnd: Date | null = null;
        let ganttAssignees: string[] = [];

        if (ganttTask) {
          const oldStart = toDateSafe(ganttTask.startDate);
          const oldEnd = toDateSafe(ganttTask.endDate);
          ganttAssignees = (ganttTask.assignedTo || []).filter((uid) => projectMemberIds.includes(uid));

          if (oldStart && oldEnd) {
            ganttStart = shiftDate(oldStart, shiftDays);
            ganttEnd = shiftDate(oldEnd, shiftDays);
            batch.update(doc(db, 'ganttTasks', ganttTask.id), {
              startDate: ganttStart,
              endDate: ganttEnd,
              changeLog: [
                ...(ganttTask.changeLog || []),
                {
                  id: `change-${entry.id}-${Date.now()}`,
                  changedAt: now,
                  changedBy: { uid: currentUser.uid, name: currentUser.name },
                  changes: [
                    { field: 'Mudança aprovada', oldValue: formatDateTime(oldEnd), newValue: `${formatDateTime(ganttEnd)} (${formatSignedDays(shiftDays)})` },
                  ],
                },
              ],
              updatedAt: serverTimestamp(),
            });
            applied = true;
          }
        }

        if (kanbanTask) {
          const currentStart = toDateSafe(kanbanTask.startDate);
          const currentDue = toDateSafe(kanbanTask.dueDate);
          const nextStart = ganttStart || (currentStart ? shiftDate(currentStart, shiftDays) : null);
          const nextDue = ganttEnd || (currentDue ? shiftDate(currentDue, shiftDays) : null);
          const kanbanUpdate: any = { updatedAt: serverTimestamp() };

          if (nextStart) kanbanUpdate.startDate = nextStart;
          if (nextDue) kanbanUpdate.dueDate = nextDue;
          if (ganttAssignees.length > 0) kanbanUpdate.assignedTo = ganttAssignees;

          if (nextStart || nextDue || ganttAssignees.length > 0) {
            batch.update(doc(db, 'tasks', kanbanTask.id), kanbanUpdate);
            applied = true;
          }
        }
      }

      batch.update(entryRef, {
        status: decision,
        decisionNote: decisionNote.trim(),
        decidedBy: currentUser.uid,
        decidedByName: currentUser.name,
        decidedAt: now,
        ...(applied ? { appliedAt: now, appliedBy: currentUser.uid } : {}),
        updatedAt: serverTimestamp(),
      });
      await commitWrite(batch.commit(), { label: 'a decisão' });
      onClose();
    } catch (err) {
      logFirestoreError(err, OperationType.UPDATE, CHANGE_HISTORY_COLLECTION);
      setError(friendlyWriteError(err));
    } finally {
      setLoading(false);
    }
  };

  const contextStyle = isAuto ? SOURCE_STYLES[entry.source || 'Plataforma'] : 'bg-orange-50 text-[#ff7f00] border-orange-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl rounded-xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div className="min-w-0"><h3 className="text-lg font-bold uppercase tracking-widest text-gray-900">{canReview ? 'Avaliar Solicitação' : 'Detalhes da Mudança'}</h3><span className={clsx(badgeBase, contextStyle, 'mt-2')}>{sourceLabel(entry)}</span></div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <section className="md:col-span-2 space-y-5">
              <div><h4 className="text-lg font-bold text-gray-900 leading-snug">{entry.title}</h4><div className="flex flex-wrap gap-1.5 mt-2"><span className={clsx(badgeBase, STATUS_STYLES[entry.status])}>{statusLabel(entry.status)}</span>{entry.sector && <span className={clsx(badgeBase, SECTOR_TAG_STYLES[entry.sector])}>{entry.sector}</span>}</div></div>
              <div><span className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Justificativa</span><div className="min-h-32 p-4 bg-white border border-gray-300 rounded-lg text-sm text-gray-600 leading-relaxed whitespace-pre-line">{entry.description || 'Sem descrição.'}</div></div>
              <div className="grid grid-cols-2 gap-3"><div className="bg-gray-50 border border-gray-100 rounded-xl p-4"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Prazo</span><span className={clsx('text-lg font-bold tabular-nums', impactTone(entry.impactDays || 0))}>{formatSignedDays(entry.impactDays || 0)}</span></div><div className="bg-gray-50 border border-gray-100 rounded-xl p-4"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Orçamento</span><span className={clsx('text-lg font-bold tabular-nums', impactTone(entry.impactAmount || 0))}>{entry.impactAmount ? formatSignedCurrency(entry.impactAmount) : '—'}</span></div></div>
              {(entry.decidedAt || !canReview) && entry.decisionNote && <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Justificativa da decisão</span><p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{entry.decisionNote}</p></div>}
            </section>

            <aside className="space-y-4">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-inner"><div className="flex items-center gap-2 mb-3"><Link2 className="w-4 h-4 text-gray-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Vínculos</span></div><div className="space-y-3 text-sm"><div><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Gantt</span><span className="font-bold text-gray-700 leading-tight block mt-1">{ganttTask?.title || 'Sem vínculo'}</span></div><div><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Kanban</span><span className="font-bold text-gray-700 leading-tight block mt-1">{kanbanTask?.title || 'Sem vínculo'}</span></div></div></div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-inner"><div className="flex items-center gap-2 mb-2"><UserRound className="w-4 h-4 text-gray-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Solicitante</span></div><span className="text-sm font-bold text-gray-700">{entry.requestedByName || 'Não informado'}</span><span className="block text-[10px] text-gray-400 mt-1">{formatDateTime(entry.createdAt)}</span></div>
              {entry.appliedAt && <div className="bg-green-50 border border-green-100 rounded-xl p-4"><div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-green-600" /><span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Atualizado</span></div><span className="block text-[11px] font-medium text-green-700 mt-1">Vínculos aplicados em {formatDateTime(entry.appliedAt)}</span></div>}
            </aside>
          </div>

          {canReview && <section className="mt-6 pt-6 border-t border-gray-100 space-y-4"><div><span className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Decisão</span><div className="grid grid-cols-3 gap-2">{DECISION_OPTIONS.map((option) => <button key={option.status} type="button" onClick={() => { setDecision(option.status); setError(''); }} className={clsx('p-3 border rounded-lg text-center transition-all', decision === option.status ? STATUS_STYLES[option.status] : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400')}><span className="text-xs font-bold uppercase tracking-widest">{option.label}</span></button>)}</div></div><div><label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Justificativa da Decisão <span className="text-[#ff7f00]">*</span></label><textarea required rows={3} value={decisionNote} onChange={(e) => { setDecisionNote(e.target.value); setError(''); }} className="w-full bg-white border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-medium rounded-lg resize-none" placeholder="Informe o motivo da decisão..." /></div>{error && <p className="text-[11px] font-bold text-red-600">{error}</p>}</section>}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between items-center gap-3 bg-gray-50 shrink-0"><div>{!canReview && entry.origin === 'manual' && entry.status === 'Pendente' && onEdit && <button onClick={() => onEdit(entry)} type="button" className="px-5 py-3 text-gray-600 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-100">Editar</button>}</div><div className="flex gap-3"><button onClick={onClose} type="button" className="px-5 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50">Cancelar</button>{canReview && <button onClick={handleSave} disabled={loading} type="button" className="px-5 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 shadow-md shadow-orange-100">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{loading ? 'Salvando...' : 'Salvar Decisão'}</button>}</div></div>
      </motion.div>
    </div>
  );
}
