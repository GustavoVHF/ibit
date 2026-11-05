import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, Check, Plus, Trash2, Upload, Paperclip, CalendarClock } from 'lucide-react';
import clsx from 'clsx';
import { doc, addDoc, updateDoc, deleteDoc, getDoc, setDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { StatusReport, StatusReportActionItem, StatusReportAttachment, StatusReportSector, UserProfile } from '../../types';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite, friendlyWriteError, withTimeout } from '../../utils/firestoreWrite';
import { STATUS_REPORT_SECTORS, generateActionItemId } from './statusReportHelpers';
import StarRating from './StarRating';

const KANBAN_TODO_BOARD_NAME = 'A Fazer';

const CLOUDINARY_CLOUD_NAME = 'drmgydsjc';
const CLOUDINARY_UPLOAD_PRESET = 'cirzsuhz';

interface NewStatusReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  ownerId: string;
  item: StatusReport | null;
  projectMembers: UserProfile[];
  defaultSector?: StatusReportSector;
}

function toDateInputValue(timestamp: any): string {
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
  return date && !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : '';
}

function toTimeInputValue(timestamp: any): string {
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
  if (!date || isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function NewStatusReportModal({
  isOpen,
  onClose,
  projectId,
  ownerId,
  item,
  projectMembers,
  defaultSector,
}: NewStatusReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [dateStr, setDateStr] = useState(item ? toDateInputValue(item.date) : new Date().toISOString().split('T')[0]);
  const [timeStr, setTimeStr] = useState(item ? toTimeInputValue(item.date) : '09:00');
  const [location, setLocation] = useState(item?.location || '');
  const [sector, setSector] = useState<StatusReportSector>(item?.sector || defaultSector || 'Geral');
  const [participants, setParticipants] = useState<string[]>(item?.participants || []);
  const [agenda, setAgenda] = useState(item?.agenda || '');
  const [minutes, setMinutes] = useState(item?.minutes || '');
  const [outcome, setOutcome] = useState(item?.outcome || '');
  const [outcomeRating, setOutcomeRating] = useState(item?.outcomeRating || 0);
  const [actionItems, setActionItems] = useState<StatusReportActionItem[]>(item?.actionItems || []);
  const [attachments, setAttachments] = useState<StatusReportAttachment[]>(item?.attachments || []);

  // Próxima Reunião & Acompanhamento
  const [nextMeetingScheduled, setNextMeetingScheduled] = useState(item?.nextMeeting?.scheduled || false);
  const [nextMeetingDateStr, setNextMeetingDateStr] = useState(toDateInputValue(item?.nextMeeting?.date));
  const [nextMeetingTimeStr, setNextMeetingTimeStr] = useState(item?.nextMeeting?.date ? toTimeInputValue(item.nextMeeting.date) : '09:00');
  const [nextMeetingAgenda, setNextMeetingAgenda] = useState(item?.nextMeeting?.agenda || '');
  const [syncCalendar, setSyncCalendar] = useState(item?.nextMeeting?.syncCalendar ?? true);
  const [createKanbanCard, setCreateKanbanCard] = useState(item?.nextMeeting?.createKanbanCard ?? true);

  if (!isOpen) return null;

  const toggleParticipant = (uid: string) => {
    setParticipants((prev) => (prev.includes(uid) ? prev.filter((p) => p !== uid) : [...prev, uid]));
  };

  const addActionItem = () => {
    setActionItems((prev) => [...prev, { id: generateActionItemId(), task: '', responsible: '', done: false }]);
  };

  const updateActionItem = (id: string, patch: Partial<StatusReportActionItem>) => {
    setActionItems((prev) => prev.map((ai) => (ai.id === id ? { ...ai, ...patch } : ai)));
  };

  const removeActionItem = (id: string) => {
    setActionItems((prev) => prev.filter((ai) => ai.id !== id));
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${isImage ? 'image' : 'auto'}/upload`,
        { method: 'POST', body: uploadData }
      );
      const json = await res.json();
      if (json.secure_url) {
        setAttachments((prev) => [...prev, { name: file.name, url: json.secure_url }]);
      }
    } catch (err) {
      console.error('Upload Error', err);
      alert('Erro ao fazer upload do anexo.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Finds the project's existing "A Fazer" board (case-insensitive match).
   * Falls back to the lowest-order board (the first Kanban column is
   * conventionally the "to do" column) and only creates a brand new board
   * as a last resort, so we always reuse what the team already has.
   */
  const findOrCreateTodoBoardId = async () => {
    const boardsSnap = await withTimeout(getDocs(query(collection(db, 'boards'), where('projectId', '==', projectId))));
    const boards = boardsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const exactMatch = boards.find((b) => (b.name || '').trim().toLowerCase() === KANBAN_TODO_BOARD_NAME.toLowerCase());
    if (exactMatch) return exactMatch.id;

    if (boards.length > 0) {
      const firstBoard = boards.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      return firstBoard.id;
    }

    const boardRef = doc(collection(db, 'boards'));
    await commitWrite(setDoc(boardRef, {
      projectId,
      name: KANBAN_TODO_BOARD_NAME,
      order: 0,
      ownerId,
      createdAt: serverTimestamp(),
    }), { label: 'a coluna do Kanban' });
    return boardRef.id;
  };

  /**
   * Finds the project tag matching the report's sector by label
   * (case-insensitive), so the generated task carries the same tag
   * instead of the sector name being stuffed into the title.
   */
  const findSectorTagId = async () => {
    const tagsSnap = await withTimeout(getDocs(query(collection(db, 'projectTags'), where('projectId', '==', projectId))));
    const match = tagsSnap.docs.find((d) => (d.data().label || '').trim().toLowerCase() === sector.toLowerCase());
    return match ? match.id : null;
  };

  /**
   * Upserts the preparation task for the next meeting into the project's
   * existing "A Fazer" board, due on the next meeting date. This task also
   * makes the meeting visible on the Calendar tool, since Calendar surfaces
   * any task carrying a dueDate.
   *
   * When `existingTaskId` still points to a live task, it's updated in
   * place instead of creating a new one — otherwise every re-save of the
   * report (even with no changes) would spawn another duplicate card.
   */
  const upsertFollowUpKanbanCard = async (nextDate: Date, prepAgenda: string, existingTaskId?: string | null) => {
    const title = `Preparação: ${prepAgenda || agenda.trim()}`;
    const description = `Card gerado automaticamente a partir do Status Report "${agenda.trim()}". Pauta prévia: ${prepAgenda || 'a definir'}.`;
    const sectorTagId = await findSectorTagId();
    const tags = sectorTagId ? [sectorTagId] : [];

    if (existingTaskId) {
      const existingSnap = await withTimeout(getDoc(doc(db, 'tasks', existingTaskId)));
      if (existingSnap.exists()) {
        await commitWrite(updateDoc(doc(db, 'tasks', existingTaskId), {
          title,
          description,
          dueDate: nextDate,
          tags,
          updatedAt: serverTimestamp(),
        }), { label: 'o card de preparação' });
        return existingTaskId;
      }
    }

    const boardId = await findOrCreateTodoBoardId();

    const taskRef = doc(collection(db, 'tasks'));
    await commitWrite(setDoc(taskRef, {
      projectId,
      boardId,
      title,
      description,
      order: 0,
      createdAt: serverTimestamp(),
      ownerId,
      dueDate: nextDate,
      tags,
    }), { label: 'o card de preparação' });

    return taskRef.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agenda.trim() || !location.trim() || !dateStr) return;
    if (isUploading) return;
    setLoading(true);

    try {
      const [hours, minutesPart] = (timeStr || '00:00').split(':').map(Number);
      const combinedDate = new Date(dateStr);
      combinedDate.setHours(hours || 0, minutesPart || 0, 0, 0);

      const previousTaskId = item?.nextMeeting?.taskId || null;
      let nextMeetingPayload: any = { scheduled: false };
      let resultingTaskId: string | undefined;

      if (nextMeetingScheduled && nextMeetingDateStr) {
        const [nHours, nMinutes] = (nextMeetingTimeStr || '00:00').split(':').map(Number);
        const nextCombinedDate = new Date(nextMeetingDateStr);
        nextCombinedDate.setHours(nHours || 0, nMinutes || 0, 0, 0);

        // Automação: cria (ou atualiza, se já existir) o card de preparação
        // no Kanban. O mesmo task também aparece automaticamente no
        // Calendário por ter dueDate definido.
        if (createKanbanCard || syncCalendar) {
          resultingTaskId = await upsertFollowUpKanbanCard(nextCombinedDate, nextMeetingAgenda.trim(), previousTaskId);
        } else if (previousTaskId) {
          // Usuário desmarcou ambas as integrações: remove o card antigo.
          deleteDoc(doc(db, 'tasks', previousTaskId)).catch(() => {});
        }

        nextMeetingPayload = {
          scheduled: true,
          date: nextCombinedDate,
          agenda: nextMeetingAgenda.trim(),
          syncCalendar,
          createKanbanCard,
          taskId: resultingTaskId || null,
        };
      } else if (previousTaskId) {
        // Agendamento foi desativado: remove o card de preparação órfão.
        deleteDoc(doc(db, 'tasks', previousTaskId)).catch(() => {});
      }

      const payload: any = {
        projectId,
        date: combinedDate,
        location: location.trim(),
        sector,
        participants,
        agenda: agenda.trim(),
        minutes: minutes.trim(),
        outcome: outcome.trim(),
        outcomeRating: outcomeRating || null,
        actionItems,
        attachments,
        nextMeeting: nextMeetingPayload,
        updatedAt: serverTimestamp(),
      };

      if (item) {
        await commitWrite(updateDoc(doc(db, 'statusReports', item.id), payload), { label: 'o status report' });
      } else {
        await commitWrite(addDoc(collection(db, 'statusReports'), {
          ...payload,
          ownerId,
          approved: false,
          createdAt: serverTimestamp(),
        }), { label: 'o status report' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, item ? OperationType.UPDATE : OperationType.CREATE, 'statusReports');
      alert(friendlyWriteError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl rounded-2xl flex flex-col"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">
              {item ? 'Editar Report' : 'Novo Report'}
            </h2>
            <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mt-0.5">
              Status Reports / Relatórios de Reunião
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <form id="status-report-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Coluna Esquerda */}
            <div className="space-y-6">
              {/* Data e Horário */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    DATA *
                  </label>
                  <input
                    type="date"
                    required
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    HORÁRIO *
                  </label>
                  <input
                    type="time"
                    required
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  />
                </div>
              </div>

              {/* Local */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  LOCAL *
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  placeholder="Ex: Sala 13 - SESI, Google Meet"
                />
              </div>

              {/* Setor */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  SETOR / DEPARTAMENTO *
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value as StatusReportSector)}
                  className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                >
                  {STATUS_REPORT_SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Pauta */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  PAUTA *
                </label>
                <input
                  type="text"
                  required
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  placeholder="Ex: Revisão de cronograma do protótipo"
                />
              </div>

              {/* Participantes */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                  PARTICIPANTES
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 max-h-40 overflow-y-auto shadow-inner">
                  {projectMembers.map((member) => {
                    const selected = participants.includes(member.uid);
                    return (
                      <div
                        key={member.uid}
                        onClick={() => toggleParticipant(member.uid)}
                        className={clsx(
                          'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all',
                          selected ? 'bg-orange-50 border border-orange-200 shadow-sm' : 'hover:bg-white border border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-white">
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400 bg-gray-50">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className={clsx('text-xs font-bold', selected ? 'text-[#ff7f00]' : 'text-gray-600')}>
                            {member.name}
                          </span>
                        </div>
                        <div className={clsx(
                          'w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0',
                          selected ? 'bg-[#ff7f00] border-[#ff7f00]' : 'bg-white border-gray-300'
                        )}>
                          {selected && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                        </div>
                      </div>
                    );
                  })}
                  {projectMembers.length === 0 && (
                    <span className="text-xs text-gray-400">Nenhum membro do projeto disponível.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Coluna Direita */}
            <div className="space-y-6">
              {/* Registros / Discussão */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  REGISTROS / DISCUSSÃO
                </label>
                <textarea
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm text-sm"
                  placeholder="Ata da reunião, pontos discutidos, decisões tomadas..."
                />
              </div>

              {/* Resultado Alcançado */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                    RESULTADO ALCANÇADO
                  </label>
                  <StarRating value={outcomeRating} onChange={setOutcomeRating} size="md" />
                </div>
                <textarea
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm text-sm"
                  placeholder="Principais entregas e conclusões da reunião..."
                />
              </div>

              {/* Action Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                    PLANOS DE AÇÃO
                  </label>
                  <button
                    type="button"
                    onClick={addActionItem}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#ff7f00] hover:text-orange-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {actionItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <input
                        type="text"
                        value={item.task}
                        onChange={(e) => updateActionItem(item.id, { task: e.target.value })}
                        placeholder="Tarefa..."
                        className="flex-1 bg-white border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-900 rounded-md focus:outline-none focus:border-[#ff7f00]"
                      />
                      <select
                        value={item.responsible || ''}
                        onChange={(e) => updateActionItem(item.id, { responsible: e.target.value })}
                        className="w-32 bg-white border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 rounded-md focus:outline-none focus:border-[#ff7f00]"
                      >
                        <option value="">Responsável</option>
                        {projectMembers.map((m) => (
                          <option key={m.uid} value={m.uid}>{m.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeActionItem(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {actionItems.length === 0 && (
                    <span className="text-xs text-gray-400">Nenhum plano de ação adicionado.</span>
                  )}
                </div>
              </div>

              {/* Anexos */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  ANEXOS (OPCIONAL)
                </label>
                <div className="space-y-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <a href={att.url} target="_blank" rel="noreferrer" className="flex-1 text-xs font-bold text-gray-700 truncate hover:text-[#ff7f00] transition-colors">
                        {att.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className={clsx(
                    'border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center transition-all cursor-pointer',
                    isUploading ? 'border-orange-300 bg-orange-50/50' : 'border-gray-300 hover:border-[#ff7f00] hover:bg-orange-50/30'
                  )}>
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 text-[#ff7f00] animate-spin" />
                    ) : (
                      <>
                        <input
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={handleUploadAttachment}
                        />
                        <Upload className="w-4 h-4 text-gray-400 mb-1" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Enviar imagem ou documento
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Próxima Reunião & Acompanhamento */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <button
                    type="button"
                    onClick={() => setNextMeetingScheduled((v) => !v)}
                    className={clsx(
                      'w-9 h-5 rounded-full transition-colors relative shrink-0',
                      nextMeetingScheduled ? 'bg-[#ff7f00]' : 'bg-gray-300'
                    )}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        nextMeetingScheduled && 'translate-x-4'
                      )}
                    />
                  </button>
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                    Agendar Próxima Reunião / Acompanhamento
                  </span>
                </label>

                {nextMeetingScheduled && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                          Data
                        </label>
                        <input
                          type="date"
                          value={nextMeetingDateStr}
                          onChange={(e) => setNextMeetingDateStr(e.target.value)}
                          className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                          Horário
                        </label>
                        <input
                          type="time"
                          value={nextMeetingTimeStr}
                          onChange={(e) => setNextMeetingTimeStr(e.target.value)}
                          className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                        Pauta Prévia
                      </label>
                      <input
                        type="text"
                        value={nextMeetingAgenda}
                        onChange={(e) => setNextMeetingAgenda(e.target.value)}
                        placeholder="Pontos a serem cobrados/avaliados no próximo encontro..."
                        className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-medium rounded-lg shadow-sm text-xs"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncCalendar}
                          onChange={(e) => setSyncCalendar(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[#ff7f00] focus:ring-[#ff7f00]"
                        />
                        <span className="text-[11px] font-semibold text-gray-600">
                          Sincronizar automaticamente no Calendário
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createKanbanCard}
                          onChange={(e) => setCreateKanbanCard(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[#ff7f00] focus:ring-[#ff7f00]"
                        />
                        <span className="text-[11px] font-semibold text-gray-600">
                          Criar card de preparação na coluna "A Fazer" do Kanban do setor
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="status-report-form"
            disabled={loading || isUploading || !agenda.trim() || !location.trim() || !dateStr}
            className="px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-lg shadow-lg shadow-orange-100 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {item ? 'Salvar Alterações' : 'Criar Report'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
