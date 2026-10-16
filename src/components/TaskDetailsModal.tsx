import React, { useState, useEffect } from 'react';
import { Task, UserProfile, ProjectTag } from '../types';
import { X, Calendar, User as UserIcon, Tag, AlignLeft, Check, Clock, Palette, Plus, Trash2 } from 'lucide-react';
import { doc, updateDoc, getDoc, serverTimestamp, deleteDoc, collection, query, where, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { diffInDays, logAutomaticChange, toDateSafe } from '../utils/changeHistory';

interface TaskDetailsModalProps {
  task: Task;
  onClose: () => void;
  projectMembers: UserProfile[];
}

const TASK_COLORS = [
  { id: 'none', value: 'transparent', label: 'Nenhuma' },
  { id: 'red', value: '#ef4444', label: 'Vermelho' },
  { id: 'orange', value: '#f97316', label: 'Laranja' },
  { id: 'yellow', value: '#eab308', label: 'Amarelo' },
  { id: 'green', value: '#22c55e', label: 'Verde' },
  { id: 'blue', value: '#3b82f6', label: 'Azul' },
  { id: 'purple', value: '#a855f7', label: 'Roxo' },
  { id: 'pink', value: '#ec4899', label: 'Rosa' },
];

export const TAG_COLORS = [
  { id: 'blue', color: 'bg-blue-600 text-white border-blue-700' },
  { id: 'red', color: 'bg-red-600 text-white border-red-700' },
  { id: 'orange', color: 'bg-orange-600 text-white border-orange-700' },
  { id: 'yellow', color: 'bg-yellow-500 text-white border-yellow-600' },
  { id: 'green', color: 'bg-green-600 text-white border-green-700' },
  { id: 'purple', color: 'bg-purple-600 text-white border-purple-700' },
  { id: 'pink', color: 'bg-pink-600 text-white border-pink-700' },
  { id: 'gray', color: 'bg-gray-600 text-white border-gray-700' },
];

export default function TaskDetailsModal({ task, onClose, projectMembers }: TaskDetailsModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  
  const initialAssignees = Array.isArray(task.assignedTo) 
    ? task.assignedTo 
    : (task.assignedTo ? [task.assignedTo] : []);
    
  const [assignedTo, setAssignedTo] = useState<string[]>(initialAssignees);
  
  const [startDate, setStartDate] = useState(
    task.startDate?.toDate ? task.startDate.toDate().toISOString().split('T')[0] : ''
  );
  const [dueDate, setDueDate] = useState(
    task.dueDate?.toDate ? task.dueDate.toDate().toISOString().split('T')[0] : ''
  );
  const [tags, setTags] = useState<string[]>(task.tags || []);
  const [color, setColor] = useState(task.color || 'transparent');
  
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0].color);
  const [isAddingCustomTag, setIsAddingCustomTag] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Tags
  useEffect(() => {
    if (!task.projectId) return;
    const q = query(
      collection(db, 'projectTags'),
      where('projectId', '==', task.projectId),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      const tagsData: ProjectTag[] = [];
      snapshot.forEach((doc) => {
        tagsData.push({ id: doc.id, ...doc.data() } as ProjectTag);
      });
      setProjectTags(tagsData);
    });
  }, [task.projectId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const taskRef = doc(db, 'tasks', task.id);
      const updateData: any = {
        title: title.trim(),
        description: description.trim(),
        assignedTo: assignedTo,
        tags,
        color,
        updatedAt: serverTimestamp(),
      };

      if (startDate) {
        const [year, month, day] = startDate.split('-').map(Number);
        updateData.startDate = new Date(year, month - 1, day);
      } else {
        updateData.startDate = null;
      }

      if (dueDate) {
        const [year, month, day] = dueDate.split('-').map(Number);
        updateData.dueDate = new Date(year, month - 1, day);
      } else {
        updateData.dueDate = null;
      }

      await updateDoc(taskRef, updateData);

      const previousStartDate = toDateSafe(task.startDate);
      const previousDueDate = toDateSafe(task.dueDate);
      const currentStartDate = toDateSafe(updateData.startDate);
      const currentDueDate = toDateSafe(updateData.dueDate);
      const assigneesChanged = JSON.stringify([...initialAssignees].sort()) !== JSON.stringify([...assignedTo].sort());
      const isSameDate = (first: Date | null, second: Date | null) =>
        first?.getFullYear() === second?.getFullYear()
        && first?.getMonth() === second?.getMonth()
        && first?.getDate() === second?.getDate();
      const startDateChanged = !isSameDate(previousStartDate, currentStartDate);
      const dueDateChanged = !isSameDate(previousDueDate, currentDueDate);

      if (assigneesChanged || startDateChanged || dueDateChanged) {
        const formatDate = (date: Date | null) => date?.toLocaleDateString('pt-BR') || 'Não definida';
        const formatAssignees = (uids: string[]) => {
          const names = uids.map((uid) => projectMembers.find((member) => member.uid === uid)?.name || 'Membro removido');
          return names.length > 0 ? names.join(', ') : 'Sem responsável';
        };
        const changes: string[] = [];
        if (assigneesChanged) {
          changes.push(`Responsáveis: ${formatAssignees(initialAssignees)} → ${formatAssignees(assignedTo)}`);
        }
        if (startDateChanged) {
          changes.push(`Início: ${formatDate(previousStartDate)} → ${formatDate(currentStartDate)}`);
        }
        if (dueDateChanged) {
          changes.push(`Entrega: ${formatDate(previousDueDate)} → ${formatDate(currentDueDate)}`);
        }

        await logAutomaticChange({
          projectId: task.projectId,
          source: 'Kanban',
          title: `Tarefa "${title.trim() || task.title}" atualizada no Kanban`,
          description: changes.join(' · '),
          actorUid: user?.uid,
          actorName: user?.displayName || user?.email || undefined,
          impactDays: diffInDays(previousDueDate, currentDueDate),
        });
      }

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAssignee = (uid: string) => {
    setAssignedTo(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const toggleTag = (tagId: string) => {
    setTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleAddCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagLabel.trim()) return;
    const label = newTagLabel.trim();
    
    // Check if tag already exists by label to avoid duplicates
    const existing = projectTags.find(t => t.label.toLowerCase() === label.toLowerCase());
    
    if (existing) {
      if (!tags.includes(existing.id)) setTags([...tags, existing.id]);
    } else {
      try {
        const docRef = await addDoc(collection(db, 'projectTags'), {
          projectId: task.projectId,
          label,
          color: selectedTagColor,
          createdAt: serverTimestamp()
        });
        setTags([...tags, docRef.id]);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'projectTags');
      }
    }
    
    setNewTagLabel('');
    setIsAddingCustomTag(false);
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'tasks', task.id));
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${task.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl rounded-xl flex flex-col"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">Detalhes da Tarefa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm"
              placeholder="Nome da tarefa..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              {/* Description */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  <AlignLeft className="w-4 h-4" />
                  DESCRIÇÃO
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm"
                  placeholder="Adicione uma descrição..."
                />
              </div>

              {/* Responsáveis */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                  <UserIcon className="w-4 h-4" />
                  RESPONSÁVEIS
                </label>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2 max-h-48 overflow-y-auto shadow-inner">
                  {projectMembers.map(member => (
                    <div 
                      key={member.uid} 
                      onClick={() => toggleAssignee(member.uid)}
                      className={clsx(
                        "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                        assignedTo.includes(member.uid) ? "bg-orange-50 border border-orange-200 shadow-sm" : "hover:bg-white border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 bg-white">
                          {member.photoURL ? (
                            <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className={clsx("text-xs font-bold", assignedTo.includes(member.uid) ? "text-[#ff7f00]" : "text-gray-600")}>
                          {member.name}
                        </span>
                      </div>
                      <div className={clsx(
                        "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                        assignedTo.includes(member.uid) ? "bg-[#ff7f00] border-[#ff7f00]" : "bg-white border-gray-300"
                      )}>
                        {assignedTo.includes(member.uid) && <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Datas */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    <Clock className="w-4 h-4" />
                    DATA DE INÍCIO
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] text-sm rounded-lg shadow-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    <Calendar className="w-4 h-4" />
                    DATA DE ENTREGA
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] text-sm rounded-lg shadow-sm"
                  />
                </div>
              </div>

              {/* Cor de Destaque */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  <Palette className="w-4 h-4" />
                  COR DE DESTAQUE
                </label>
                <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {TASK_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setColor(c.value)}
                      title={c.label}
                      className={`w-full aspect-square rounded-lg border-2 transition-all ${
                        color === c.value ? 'border-gray-900 scale-110 shadow-md' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.value === 'transparent' ? '#fff' : c.value }}
                    >
                      {c.value === 'transparent' && <span className="text-[10px] text-gray-400">X</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Section */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  <Tag className="w-4 h-4" />
                  TAGS DO PROJETO
                </label>
                <div className="flex flex-wrap gap-2 mb-4 max-h-40 overflow-y-auto p-1 scrollbar-hide">
                  {projectTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={clsx(
                        "px-2.5 py-1 text-[9px] font-bold border rounded transition-all shadow-sm",
                        tags.includes(tag.id) 
                          ? ((!tag.color || !tag.color.startsWith('#')) ? tag.color : 'text-white border-transparent')
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      )}
                      style={tags.includes(tag.id) && tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
                
                {isAddingCustomTag ? (
                  <form onSubmit={handleAddCustomTag} className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3">
                    <input
                      type="text" autoFocus value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)}
                      placeholder="Nome da tag..."
                      className="w-full bg-white border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg shadow-sm"
                    />
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {TAG_COLORS.map(tc => (
                        <button
                          key={tc.id}
                          type="button"
                          onClick={() => setSelectedTagColor(tc.color)}
                          className={clsx(
                            "w-6 h-6 rounded-md border-2 transition-all",
                            selectedTagColor === tc.color ? "border-gray-900 scale-110" : "border-transparent"
                          )}
                        >
                          <div className={clsx("w-full h-full rounded-[3px]", tc.color.split(' ')[0])} />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                       <button type="submit" className="flex-1 bg-[#ff7f00] text-white py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-orange-600 transition-all">CRIAR</button>
                       <button type="button" onClick={() => setIsAddingCustomTag(false)} className="px-3 py-2 bg-white border border-gray-200 text-gray-400 rounded-lg hover:text-gray-600"><X className="w-3 h-3" /></button>
                    </div>
                  </form>
                ) : (
                  <button 
                    onClick={() => setIsAddingCustomTag(true)}
                    className="w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#ff7f00] hover:text-[#ff7f00] rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                  >
                    + Nova Tag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-lg text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            EXCLUIR
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg"
            >
              CANCELAR
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              className="px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-lg shadow-lg shadow-orange-100"
            >
              {isSaving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
