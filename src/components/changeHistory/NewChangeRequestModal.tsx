import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { CalendarClock, Check, Link2, Loader2, Users, X } from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ChangeHistoryEntry, ChangeSector, GanttTask, Task, UserProfile } from '../../types';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../../utils/firestoreWrite';
import { CHANGE_HISTORY_COLLECTION } from '../../utils/changeHistory';
import { CHANGE_SECTORS } from './changeHistoryHelpers';

interface NewChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentUser: { uid: string; name: string };
  projectMembers: UserProfile[];
  ganttTasks: GanttTask[];
  kanbanTasks: Task[];
  item?: ChangeHistoryEntry | null;
}

const labelClass = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2';
const inputClass = 'w-full bg-white border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-medium rounded-lg placeholder-gray-300 transition-colors';

export default function NewChangeRequestModal({ isOpen, onClose, projectId, currentUser, projectMembers, ganttTasks, kanbanTasks, item }: NewChangeRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const [requestedBy, setRequestedBy] = useState(item?.requestedBy || currentUser.uid);
  const [sector, setSector] = useState<ChangeSector>(item?.sector || 'Engenharia');
  const [description, setDescription] = useState(item?.description || '');
  const [impactDays, setImpactDays] = useState(item?.impactDays != null ? String(item.impactDays) : '0');
  const [impactAmount, setImpactAmount] = useState(item?.impactAmount != null ? String(item.impactAmount) : '0');
  const [qualityRisk, setQualityRisk] = useState<'Neutro' | 'Baixo' | 'Médio' | 'Alto'>(item?.qualityRisk || 'Neutro');
  const [linkedGanttTaskId, setLinkedGanttTaskId] = useState(item?.linkedGanttTaskId || '');
  const [linkedKanbanTaskId, setLinkedKanbanTaskId] = useState(item?.linkedKanbanTaskId || '');

  const sortedGanttTasks = useMemo(() => [...ganttTasks].sort((a, b) => (a.order || 0) - (b.order || 0)), [ganttTasks]);
  const sortedKanbanTasks = useMemo(() => [...kanbanTasks].sort((a, b) => a.title.localeCompare(b.title)), [kanbanTasks]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setLoading(true);

    try {
      const requesterName = projectMembers.find((m) => m.uid === requestedBy)?.name || (requestedBy === currentUser.uid ? currentUser.name : 'Membro');
      const payload = {
        projectId,
        origin: 'manual' as const,
        title: title.trim(),
        description: description.trim(),
        sector,
        linkedGanttTaskId: linkedGanttTaskId || null,
        linkedKanbanTaskId: linkedKanbanTaskId || null,
        requestedBy,
        requestedByName: requesterName,
        impactDays: parseInt(impactDays, 10) || 0,
        impactAmount: parseFloat(impactAmount.replace(',', '.')) || 0,
        qualityRisk,
        status: 'Pendente' as const,
        updatedAt: serverTimestamp(),
      };

      if (item) await commitWrite(updateDoc(doc(db, CHANGE_HISTORY_COLLECTION, item.id), payload), { label: 'a solicitação' });
      else await commitWrite(addDoc(collection(db, CHANGE_HISTORY_COLLECTION), { ...payload, createdAt: serverTimestamp() }), { label: 'a solicitação' });
      onClose();
    } catch (error) {
      logFirestoreError(error, item ? OperationType.UPDATE : OperationType.CREATE, CHANGE_HISTORY_COLLECTION);
      alert(friendlyWriteError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl rounded-xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-bold uppercase tracking-widest text-gray-900">{item ? 'Editar Solicitação' : 'Nova Solicitação de Mudança'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form id="change-request-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          <div>
            <label className={labelClass}>Título da Mudança</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Ex: Troca do material da asa dianteira" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelClass}>Solicitante</label><select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={inputClass}>{projectMembers.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}</select></div>
            <div><label className={labelClass}>Setor</label><select value={sector} onChange={(e) => setSector(e.target.value as ChangeSector)} className={inputClass}>{CHANGE_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className={labelClass}>Qualidade / Riscos</label><select value={qualityRisk} onChange={(e) => setQualityRisk(e.target.value as typeof qualityRisk)} className={inputClass}>{['Neutro', 'Baixo', 'Médio', 'Alto'].map((level) => <option key={level} value={level}>{level}</option>)}</select></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-5">
              <div>
                <label className={labelClass}>Justificativa / Motivo da Mudança</label>
                <textarea required rows={7} value={description} onChange={(e) => setDescription(e.target.value)} className={clsx(inputClass, 'resize-none')} placeholder="Descreva o motivo e o resultado esperado..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>Impacto no Prazo (dias)</label><input type="number" step="1" value={impactDays} onChange={(e) => setImpactDays(e.target.value)} className={inputClass} placeholder="+2 ou -1" /></div>
                <div><label className={labelClass}>Impacto no Custo (R$)</label><input type="number" step="0.01" value={impactAmount} onChange={(e) => setImpactAmount(e.target.value)} className={inputClass} placeholder="+50,00 ou -20,00" /></div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-inner">
                <div className="flex items-center gap-2 mb-3"><Link2 className="w-4 h-4 text-gray-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Vínculos</span></div>
                <div className="space-y-3">
                  <div><label className={labelClass}>Tarefa / Marco do Gantt</label><select value={linkedGanttTaskId} onChange={(e) => setLinkedGanttTaskId(e.target.value)} className={inputClass}><option value="">Sem vínculo</option>{sortedGanttTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>
                  <div><label className={labelClass}>Tarefa do Kanban</label><select value={linkedKanbanTaskId} onChange={(e) => setLinkedKanbanTaskId(e.target.value)} className={inputClass}><option value="">Sem vínculo</option>{sortedKanbanTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-inner">
                <div className="flex items-center gap-2 mb-2"><CalendarClock className="w-4 h-4 text-gray-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Aplicação</span></div>
                <p className="text-[11px] font-medium text-gray-500 leading-relaxed">Quando aprovada, a mudança ajusta os prazos do Gantt e atualiza a tarefa vinculada do Kanban.</p>
              </div>
            </aside>
          </div>
        </form>

        <div className="p-6 border-t border-gray-200 flex justify-end items-center gap-3 bg-gray-50 shrink-0">
          <button onClick={onClose} type="button" className="px-5 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
          <button disabled={loading} type="submit" form="change-request-form" className="px-5 py-3 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 disabled:opacity-50 active:scale-95 flex items-center gap-2 transition-all shadow-md shadow-orange-100">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{loading ? 'Salvando...' : 'Salvar Solicitação'}</button>
        </div>
      </motion.div>
    </div>
  );
}
