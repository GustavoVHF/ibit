import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  documentId
} from 'firebase/firestore';
import { 
  GanttTask, 
  Project, 
  UserProfile, 
  ProjectStakeholder 
} from '../types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  ChevronRight,
  MoreVertical,
  X,
  Loader2,
  Users,
  UserPlus,
  ArrowLeft,
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  BarChart,
  Layout,
  Upload,
  FileJson,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { diffInDays, logAutomaticChange, toDateSafe } from '../utils/changeHistory';
import { motion, AnimatePresence } from 'motion/react';
import ProjectSettingsModal from './ProjectSettingsModal';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';
import ExportButton from './export/ExportButton';
import { captureContainerAsPdf, PdfExportOptions } from '../utils/export/pdfEngine';
import { exportToExcel } from '../utils/export/excelEngine';
import { useI18n } from '../i18n/LanguageContext';

// --- Components ---

interface GanttTaskModalProps {
  task: Partial<GanttTask> | null;
  onSave: (task: Partial<GanttTask>) => void;
  onClose: () => void;
  participants: { id: string, name: string, photoURL?: string, isUser: boolean }[];
  allTasks: GanttTask[];
  taskIdToWbs: Record<string, number>;
}

function GanttTaskModal({ task, onSave, onClose, participants, allTasks, taskIdToWbs }: GanttTaskModalProps) {
  const { t: tr, locale } = useI18n();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [startDate, setStartDate] = useState(task?.startDate ? new Date((task.startDate as any).seconds * 1000).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(task?.endDate ? new Date((task.endDate as any).seconds * 1000).toISOString().split('T')[0] : '');
  const [progress, setProgress] = useState(task?.progress || 0);
  const [category, setCategory] = useState(task?.category || 'MILESTONE');
  const [section, setSection] = useState(task?.section || '');
  const [dependencies, setDependencies] = useState<string[]>(
    Array.isArray(task?.dependencies) ? task.dependencies : []
  );
  const [assignedTo, setAssignedTo] = useState<string[]>(task?.assignedTo || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      progress,
      assignedTo,
      category,
      section,
      dependencies
    });
  };

  const toggleParticipant = (id: string) => {
    setAssignedTo(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleDependency = (id: string) => {
    setDependencies(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  // Filter out self from dependency options
  const availableDeps = allTasks.filter(t => t.id !== task?.id);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-2xl overflow-hidden rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shadow-sm shrink-0">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">
            {task?.id ? tr.gantt.editTask : tr.gantt.newTask}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-6">
          <form id="gantt-func-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-6">
            <div className="col-span-2 space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.taskTitle}</label>
              <input
                autoFocus
                required
                className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm"
                placeholder={tr.gantt.taskTitlePlaceholder}
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.startDate}</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="date"
                  className="w-full bg-white border border-gray-300 pl-10 pr-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold text-sm rounded-lg shadow-sm"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.endDate}</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="date"
                  className="w-full bg-white border border-gray-300 pl-10 pr-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold text-sm rounded-lg shadow-sm"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>


            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                 <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.progress}</label>
                 <span className="text-sm font-bold text-[#ff7f00]">{progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ff7f00]"
                value={progress}
                onChange={e => setProgress(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.sectionOptional}</label>
              <input
                className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold text-sm rounded-lg shadow-sm"
                placeholder={tr.gantt.sectionPlaceholder}
                value={section}
                onChange={e => setSection(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.category}</label>
              <select
                className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold text-sm rounded-lg shadow-sm appearance-none"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {['MILESTONE', 'HIGH RISK', 'GOAL', 'MEDIUM RISK', 'CLOSING', 'EXECUTION', 'INITIATION', 'PLANNING'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Dependencies Selector - Checkbox List */}
            <div className="col-span-2 space-y-4 border-t border-gray-100 pt-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                {tr.gantt.dependencies}
                {dependencies.length > 0 && <span className="ml-2 text-[#ff7f00]">({dependencies.length})</span>}
              </label>
              {availableDeps.length > 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto shadow-inner space-y-1.5">
                  {availableDeps.map((t, idx) => (
                    <div
                      key={t.id}
                      onClick={() => toggleDependency(t.id)}
                      className={clsx(
                        "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all",
                        dependencies.includes(t.id)
                          ? "bg-white border border-orange-300 shadow-sm"
                          : "bg-white/60 border border-transparent hover:border-gray-200"
                      )}
                    >
                      <div className={clsx(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                        dependencies.includes(t.id) ? "bg-[#ff7f00] border-[#ff7f00]" : "bg-white border-gray-300"
                      )}>
                        {dependencies.includes(t.id) && <CheckCircle2 className="w-3 h-3 text-white stroke-[3px]" />}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{taskIdToWbs[t.id] || '-'}</span>
                        <span className={clsx("text-xs font-bold truncate", dependencies.includes(t.id) ? "text-[#ff7f00]" : "text-gray-600")}>
                          {t.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 font-medium italic">{tr.gantt.noOtherTasks}</p>
              )}
            </div>

            {/* Assign Participants */}
            <div className="col-span-2 space-y-4 border-t border-gray-100 pt-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.assign}</label>
              <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-100 rounded-xl p-4 max-h-48 overflow-y-auto shadow-inner">
                {participants.map(p => (
                  <div
                    key={p.id}
                    onClick={() => toggleParticipant(p.id)}
                    className={clsx(
                      "flex flex-row items-center justify-between p-2 rounded-lg cursor-pointer transition-all bg-white",
                      assignedTo.includes(p.id) 
                        ? "border border-orange-300 shadow-sm" 
                        : "border border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {p.photoURL ? (
                        <img src={p.photoURL} className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
                      ) : (
                        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border border-gray-200", p.isUser ? "bg-white text-gray-600" : "bg-red-50 text-red-600")}>
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <span className={clsx("text-xs font-bold", assignedTo.includes(p.id) ? "text-[#ff7f00]" : "text-gray-600")}>
                        {p.name}
                      </span>
                    </div>
                    <div className={clsx(
                      "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                      assignedTo.includes(p.id) ? "bg-[#ff7f00] border-[#ff7f00]" : "bg-white border-gray-300"
                    )}>
                      {assignedTo.includes(p.id) && <CheckCircle2 className="w-3 h-3 text-white stroke-[3px]" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>

          {/* HISTORY LOG SECTION */}
          {task?.id && (
            <div className="space-y-4 border-t border-gray-100 pt-6 mt-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">{tr.gantt.history}</label>
              {task.changeLog && task.changeLog.length > 0 ? (
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-gray-200">
                {task.changeLog.map((log) => (
                  <div key={log.id} className="relative flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center shrink-0 z-10 shadow-sm mt-0.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-gray-700">{log.changedBy.name}</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {log.changedAt ? new Date(log.changedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {log.changes.map((change, idx) => (
                          <li key={idx} className="text-[11px] text-gray-600">
                            <span className="font-bold text-gray-700 uppercase tracking-wider">{change.field}:</span>{' '}
                            <span className="text-red-500 line-through mr-1 text-[10px]">{change.oldValue || '-'}</span>
                            <span className="text-green-600 font-medium text-[10px]">➔ {change.newValue || '-'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
              ) : (
                <div className="text-[11px] text-gray-400 italic">{tr.gantt.noHistory}</div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg"
          >
            {tr.common.cancel}
          </button>
          <button
            type="submit"
            form="gantt-func-form"
            className="px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#ff7f00] hover:bg-orange-600 transition-colors rounded-lg shadow-lg shadow-orange-100"
          >
            {task?.id ? tr.common.saveChanges : tr.gantt.createTask}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function StakeholderModal({ projectId, stakeholder, projectMembers, currentStakeholders, onSaveMember, onSaveExternal, onClose }: { projectId: string, stakeholder: ProjectStakeholder | null, projectMembers: UserProfile[], currentStakeholders: ProjectStakeholder[], onSaveMember: (uid: string, name: string, photoURL?: string) => void, onSaveExternal: (data: Partial<ProjectStakeholder>) => void, onClose: () => void }) {
  const { t: tr } = useI18n();
  const [activeTab, setActiveTab] = useState<'members' | 'external'>('members');
  const [name, setName] = useState(stakeholder?.name || '');
  const [role, setRole] = useState(stakeholder?.role || '');

  const membersToAdd = projectMembers.filter(m => !currentStakeholders.some(s => s.userId === m.uid));

  const handleSubmitExternal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveExternal({ name, role });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-md overflow-hidden rounded-xl shadow-xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shadow-sm shrink-0">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">
            {stakeholder ? tr.raci.editStakeholder : tr.gantt.manageMembers}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors pointer-events-auto">
             <X className="w-6 h-6" />
          </button>
        </div>

        {!stakeholder && (
          <div className="flex border-b border-gray-50 flex-shrink-0">
            <button 
              onClick={() => setActiveTab('members')}
              className={clsx(
                "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                activeTab === 'members' ? "border-[#ff7f00] text-[#ff7f00] bg-orange-50/30" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              {tr.raci.teamMembers}
            </button>
            <button 
              onClick={() => setActiveTab('external')}
              className={clsx(
                "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                activeTab === 'external' ? "border-[#ff7f00] text-[#ff7f00] bg-orange-50/30" : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              {tr.raci.externalStakeholder}
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {stakeholder || activeTab === 'external' ? (
            <form id="external-form" onSubmit={handleSubmitExternal} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.raci.nameRole}</label>
                  <input 
                    type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)} 
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm transition-all" 
                    placeholder={tr.raci.namePlaceholder} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.raci.roleOptional}</label>
                  <input 
                    type="text" value={role} onChange={(e) => setRole(e.target.value)} 
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg shadow-sm transition-all" 
                    placeholder={tr.raci.rolePlaceholder} 
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button onClick={onClose} type="button" className="flex-1 px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors">{tr.common.cancel}</button>
                <button type="submit" disabled={!name.trim()} className="flex-1 px-6 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-100">
                  {tr.common.save}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {projectMembers.map(member => (
                  <div 
                    key={member.uid}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-bold text-gray-500 overflow-hidden border border-gray-200">
                        {member.photoURL ? <img src={member.photoURL} className="w-full h-full object-cover" /> : member.name.charAt(0)}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold text-gray-800 uppercase tracking-tight">{member.name}</span>
                        <span className="text-[10px] text-gray-500">{member.email}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button onClick={onClose} className="px-6 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-100">{tr.gantt.closeUpper}</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}


// --- Main Page ---

export default function GanttChart() {
  const { t: tr, locale } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [stakeholders, setStakeholders] = useState<ProjectStakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isStakeholderModalOpen, setIsStakeholderModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [editingStakeholder, setEditingStakeholder] = useState<ProjectStakeholder | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isJSONMenuOpen, setIsJSONMenuOpen] = useState(false);
  const [mobileJSONOpen, setMobileJSONOpen] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  const [isStartDateModalOpen, setIsStartDateModalOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');

  // Responsive state
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Gantt Timeline States
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('day');
  const [cellWidth, setCellWidth] = useState(60);
  const [sidebarWidth, setSidebarWidth] = useState(760);
  const timelineContainerRef = React.useRef<HTMLDivElement>(null);
  
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const timelineHeaderRef = React.useRef<HTMLDivElement>(null);
  const timelineBodyRef = React.useRef<HTMLDivElement>(null);

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineHeaderRef.current) {
      timelineHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // --- JSON Export/Import Handlers ---
  const handleExportJSON = () => {
    try {
      const exportData = {
        projectName: project?.name || tr.common.project,
        projectId,
        exportDate: new Date().toISOString(),
        type: 'ibit-gantt',
        tasks: tasks.map(t => ({
          ...t,
          startDate: t.startDate?.seconds ? new Date(t.startDate.seconds * 1000).toISOString() : t.startDate,
          endDate: t.endDate?.seconds ? new Date(t.endDate.seconds * 1000).toISOString() : t.endDate,
          createdAt: t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000).toISOString() : t.createdAt,
          updatedAt: t.updatedAt?.seconds ? new Date(t.updatedAt.seconds * 1000).toISOString() : t.updatedAt,
        }))
      };
      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gantt-${project?.name.replace(/\s+/g, '-') || tr.gantt.fileProject}-${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Gantt Export] Error:', err);
    }
  };

  const importInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId || !user) return;
    
    const confirmImport = window.confirm(tr.gantt.importConfirm);
    if (!confirmImport) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      
      if (parsed.type !== 'ibit-gantt' || !Array.isArray(parsed.tasks)) {
        throw new Error('Arquivo JSON inválido para Gantt');
      }

      // Add each task to Firestore
      for (const taskData of parsed.tasks) {
        const { id, ...cleanTask } = taskData;
        
        await addDoc(collection(db, 'ganttTasks'), {
          ...cleanTask,
          projectId,
          startDate: cleanTask.startDate ? new Date(cleanTask.startDate) : null,
          endDate: cleanTask.endDate ? new Date(cleanTask.endDate) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
      alert(tr.gantt.importSuccess);
    } catch (error) {
      console.error('Error importing JSON:', error);
      alert(tr.gantt.importError);
    }
  };

  // 1. Fetch Project Data
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      }
    });
  }, [projectId, user]);

  // 2. Fetch Members
  useEffect(() => {
    if (!project?.members || project.members.length === 0) return;
    const qMembers = query(
      collection(db, 'users'),
      where(documentId(), 'in', project.members.slice(0, 30))
    );
    return onSnapshot(qMembers, (snapshot) => {
      const membersData: UserProfile[] = [];
      snapshot.forEach((doc) => {
        membersData.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setProjectMembers(membersData);
    });
  }, [project?.members?.join(',')]);

  // 3. Fetch Gantt Tasks
  useEffect(() => {
    if (!projectId) return;
    const qTasks = query(
      collection(db, 'ganttTasks'), 
      where('projectId', '==', projectId)
    );
    return onSnapshot(qTasks, (snapshot) => {
      const taskData: GanttTask[] = [];
      snapshot.forEach((doc) => {
        taskData.push({ id: doc.id, ...doc.data() } as GanttTask);
      });
      setTasks(taskData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ganttTasks');
      setLoading(false);
    });
  }, [projectId]);

  // 4. Fetch Project Stakeholders (Unified & Legacy RACI)
  useEffect(() => {
    if (!projectId) return;
    
    const qProjectSH = query(
      collection(db, 'projectStakeholders'),
      where('projectId', '==', projectId)
    );
    const unsubProjectSH = onSnapshot(qProjectSH, (snapshot) => {
      const shData: ProjectStakeholder[] = [];
      snapshot.forEach((doc) => {
        shData.push({ id: doc.id, ...doc.data() } as ProjectStakeholder);
      });
      setStakeholders(prev => {
        // Merge with existing but prefer ProjectStakeholder
        const otherSH = prev.filter(p => !shData.some(s => s.id === p.id));
        return [...shData, ...otherSH];
      });
    });

    const qRaciSH = query(
      collection(db, 'raciStakeholders'),
      where('projectId', '==', projectId)
    );
    const unsubRaciSH = onSnapshot(qRaciSH, (snapshot) => {
      snapshot.forEach((doc) => {
        const data = doc.data();
        const sh: ProjectStakeholder = {
          id: doc.id,
          projectId: data.projectId,
          name: data.name,
          role: data.role,
          userId: data.userId,
          createdAt: data.createdAt
        };
        setStakeholders(prev => {
          if (prev.some(s => s.id === sh.id)) return prev;
          return [...prev, sh];
        });
      });
    });

    return () => {
      unsubProjectSH();
      unsubRaciSH();
    };
  }, [projectId]);

  const participants = useMemo(() => {
    const list = [
      ...projectMembers.map(m => ({ id: m.uid, name: m.name, photoURL: m.photoURL, isUser: true })),
      ...stakeholders.map(s => ({ id: s.id, name: s.name, photoURL: s.photoURL, isUser: false }))
    ];
    return list;
  }, [projectMembers, stakeholders]);

  const handleTaskSave = async (taskData: Partial<GanttTask>) => {
    if (!projectId) return;
    try {
      if (editingTask?.id) {
        const changes: { field: string, oldValue: any, newValue: any }[] = [];
        const fieldsToCheck: (keyof GanttTask)[] = ['title', 'description', 'startDate', 'endDate', 'progress', 'category', 'section', 'dependencies', 'assignedTo'];

        fieldsToCheck.forEach(field => {
          let oldVal = editingTask[field];
          let newVal = taskData[field];

          // Normalize dates for comparison
          if (field === 'startDate' || field === 'endDate') {
            oldVal = oldVal && (oldVal as any).seconds ? new Date((oldVal as any).seconds * 1000).toISOString().split('T')[0] : '';
            newVal = newVal ? (newVal as Date).toISOString().split('T')[0] : '';
          }
          
          // Arrays comparison (shallow)
          if (Array.isArray(oldVal) || Array.isArray(newVal)) {
            const arrOld = Array.isArray(oldVal) ? oldVal : [];
            const arrNew = Array.isArray(newVal) ? newVal : [];
            if (JSON.stringify([...arrOld].sort()) !== JSON.stringify([...arrNew].sort())) {
              changes.push({ field, oldValue: arrOld.join(', '), newValue: arrNew.join(', ') });
            }
          } else if (oldVal !== newVal && !(oldVal === undefined && newVal === '')) {
            changes.push({ field, oldValue: oldVal || '', newValue: newVal || '' });
          }
        });

        const newChangeLog = [...(editingTask.changeLog || [])];
        if (changes.length > 0) {
          newChangeLog.unshift({
            id: Math.random().toString(36).substr(2, 9),
            changedAt: new Date().toISOString(),
            changedBy: {
              uid: user?.uid || 'unknown',
              name: user?.displayName || user?.email || 'Usuário'
            },
            changes
          });
        }

        await commitWrite(updateDoc(doc(db, 'ganttTasks', editingTask.id), {
          ...taskData,
          changeLog: newChangeLog,
          updatedAt: serverTimestamp()
        }), { label: 'a tarefa do cronograma' });

        // Registra a alteração no Histórico de Mudanças do projeto
        if (changes.length > 0) {
          const shiftedDays = diffInDays(toDateSafe(editingTask.endDate), toDateSafe(taskData.endDate));
          await logAutomaticChange({
            projectId,
            source: 'Gantt',
            title: `Tarefa "${taskData.title || editingTask.title}" atualizada no cronograma`,
            description: changes.map(c => `${c.field}: ${c.oldValue || '—'} → ${c.newValue || '—'}`).join(' · '),
            actorUid: user?.uid,
            actorName: user?.displayName || user?.email || undefined,
            impactDays: shiftedDays,
          });
        }
      } else {
        await commitWrite(addDoc(collection(db, 'ganttTasks'), {
          ...taskData,
          projectId,
          order: tasks.length,
          changeLog: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }), { label: 'a tarefa do cronograma' });
      }
      setIsTaskModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      logFirestoreError(error, editingTask?.id ? OperationType.UPDATE : OperationType.CREATE, 'ganttTasks');
      alert(friendlyWriteError(error));
    }
  };

  const handleStakeholderSave = async (shData: Partial<ProjectStakeholder>) => {
    if (!projectId) return;
    try {
      if (editingStakeholder?.id) {
        await commitWrite(updateDoc(doc(db, 'projectStakeholders', editingStakeholder.id), shData), { label: 'o participante' });
      } else {
        await commitWrite(addDoc(collection(db, 'projectStakeholders'), {
          ...shData,
          projectId,
          createdAt: serverTimestamp()
        }), { label: 'o participante' });
      }
      setIsStakeholderModalOpen(false);
      setEditingStakeholder(null);
    } catch (error) {
      logFirestoreError(error, editingStakeholder?.id ? OperationType.UPDATE : OperationType.CREATE, 'projectStakeholders');
      alert(friendlyWriteError(error));
    }
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await commitWrite(deleteDoc(doc(db, 'ganttTasks', taskToDelete)), { label: 'a exclusão da tarefa' });
      setTaskToDelete(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, 'ganttTasks');
      alert(friendlyWriteError(error));
    }
  };

  useEffect(() => {
    if (loading) return;
    const el = timelineContainerRef.current;
    if (!el) return;
    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        setCellWidth(prev => Math.max(20, Math.min(200, prev - (e.deltaY > 0 ? 15 : -15))));
      } else if (!e.shiftKey && Math.abs(e.deltaY) > 0) {
        // Fallback for "only scroll" as requested, preventing vertical jump
        e.preventDefault();
        setCellWidth(prev => Math.max(20, Math.min(200, prev - (e.deltaY > 0 ? 15 : -15))));
      }
    };
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, [loading]);

  const handleSaveStartDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !customStartDate) return;
    try {
      await commitWrite(updateDoc(doc(db, 'projects', projectId), {
        ganttStartDate: new Date(customStartDate)
      }), { label: 'a data de início' });
      setIsStartDateModalOpen(false);
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'projects');
      alert(friendlyWriteError(error));
    }
  };

  const { startDateBase, totalDays } = useMemo(() => {
    let start = new Date();
    if (project?.ganttStartDate && project.ganttStartDate.seconds) {
      const d = new Date(project.ganttStartDate.seconds * 1000);
      start = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
    } else if (tasks.length > 0) {
      const dates = tasks.map(t => {
        const d = new Date(t.startDate.seconds * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
      });
      start = new Date(Math.min(...dates));
      start.setHours(12, 0, 0, 0);
    }
    start.setHours(12, 0, 0, 0);

    let end = new Date(start);
    end.setDate(start.getDate() + 30); // Default minimum 30 days
    
    if (tasks.length > 0) {
      const dates = tasks.map(t => {
        const d = new Date(t.endDate.seconds * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
      });
      const maxTaskEnd = new Date(Math.max(...dates));
      maxTaskEnd.setHours(12, 0, 0, 0);
      if (maxTaskEnd > end) {
        end = new Date(maxTaskEnd);
      }
    }
    // Buffer reduced to 2 days as requested
    end.setDate(end.getDate() + 2);
    end.setHours(12, 0, 0, 0);
    
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return { startDateBase: start, totalDays: diff };
  }, [tasks, project?.ganttStartDate]);

  const timelineDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDateBase);
      d.setDate(startDateBase.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [startDateBase, totalDays]);

  const todayIdx = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return timelineDates.findIndex(d => {
      const dClean = new Date(d);
      dClean.setHours(12, 0, 0, 0);
      return dClean.getTime() === today.getTime();
    });
  }, [timelineDates]);

  // --- Critical Path Method (CPM) Engine ---
  const criticalTaskIds = useMemo(() => {
    if (tasks.length === 0) return new Set<string>();

    const getMs = (ts: any): number => {
      if (!ts) return 0;
      if (ts.seconds) return ts.seconds * 1000;
      if (ts instanceof Date) return ts.getTime();
      return 0;
    };

    const DAY_MS = 86400000;

    // Build task map
    const taskMap: Record<string, { id: string; startMs: number; endMs: number; durationDays: number; deps: string[] }> = {};
    tasks.forEach(t => {
      const sMs = getMs(t.startDate);
      const eMs = getMs(t.endDate);
      const dur = Math.max(1, Math.round((eMs - sMs) / DAY_MS));
      taskMap[t.id] = {
        id: t.id,
        startMs: sMs,
        endMs: eMs,
        durationDays: dur,
        deps: Array.isArray(t.dependencies) ? t.dependencies.filter(d => taskMap[d] !== undefined || tasks.some(tt => tt.id === d)) : []
      };
    });

    // Forward Pass: compute Earliest Start (ES) and Earliest Finish (EF)
    const es: Record<string, number> = {};
    const ef: Record<string, number> = {};

    const computeES = (id: string, visited: Set<string>): number => {
      if (es[id] !== undefined) return es[id];
      if (visited.has(id)) return 0; // cycle guard
      visited.add(id);

      const task = taskMap[id];
      if (!task) return 0;
      if (task.deps.length === 0) {
        es[id] = 0;
        ef[id] = task.durationDays;
        return 0;
      }

      let maxPredEF = 0;
      for (const depId of task.deps) {
        if (taskMap[depId]) {
          computeES(depId, visited);
          maxPredEF = Math.max(maxPredEF, ef[depId] || 0);
        }
      }
      es[id] = maxPredEF;
      ef[id] = maxPredEF + task.durationDays;
      return es[id];
    };

    tasks.forEach(t => computeES(t.id, new Set()));

    // Project finish = max EF
    let projectFinish = 0;
    tasks.forEach(t => {
      projectFinish = Math.max(projectFinish, ef[t.id] || 0);
    });

    // Backward Pass: compute Latest Start (LS) and Latest Finish (LF)
    const ls: Record<string, number> = {};
    const lf: Record<string, number> = {};

    // Initialize all LF to projectFinish
    tasks.forEach(t => { lf[t.id] = projectFinish; });

    // Find successors for each task
    const successors: Record<string, string[]> = {};
    tasks.forEach(t => { successors[t.id] = []; });
    tasks.forEach(t => {
      if (Array.isArray(t.dependencies)) {
        t.dependencies.forEach(depId => {
          if (successors[depId]) successors[depId].push(t.id);
        });
      }
    });

    const computeLF = (id: string, visited: Set<string>): number => {
      if (ls[id] !== undefined) return lf[id];
      if (visited.has(id)) return projectFinish; // cycle guard
      visited.add(id);

      const task = taskMap[id];
      if (!task) return projectFinish;

      const succs = successors[id];
      if (succs.length === 0) {
        lf[id] = projectFinish;
      } else {
        let minSuccLS = projectFinish;
        for (const sId of succs) {
          computeLF(sId, visited);
          minSuccLS = Math.min(minSuccLS, ls[sId] ?? projectFinish);
        }
        lf[id] = minSuccLS;
      }
      ls[id] = lf[id] - task.durationDays;
      return lf[id];
    };

    tasks.forEach(t => computeLF(t.id, new Set()));

    // Critical = Total Float (LS - ES) === 0
    const critical = new Set<string>();
    tasks.forEach(t => {
      const totalFloat = (ls[t.id] ?? 0) - (es[t.id] ?? 0);
      if (totalFloat === 0) critical.add(t.id);
    });

    return critical;
  }, [tasks]);

  const monthGroups = useMemo(() => {
    const groups: { month: string; year: number; days: number }[] = [];
    timelineDates.forEach(date => {
      const month = date.toLocaleDateString(locale, { month: 'long' }).toUpperCase();
      const year = date.getFullYear();
      const last = groups[groups.length - 1];
      if (last && last.month === month && last.year === year) {
        last.days++;
      } else {
        groups.push({ month, year, days: 1 });
      }
    });
    return groups;
  }, [timelineDates, locale]);

  type GanttRow = { type: 'section'; id: string; name: string } | { type: 'task'; id: string; task: GanttTask };

  const rows: GanttRow[] = useMemo(() => {
    const grouped = tasks.reduce((acc, t) => {
      const s = (t.section?.trim() || '').toUpperCase();
      if (!acc[s]) acc[s] = [];
      acc[s].push(t);
      return acc;
    }, {} as Record<string, GanttTask[]>);
    
    const sectionNames = Object.keys(grouped).sort((a,b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    
    const res: GanttRow[] = [];
    for (const s of sectionNames) {
      if (s !== '') res.push({ type: 'section', id: `sec-${s}`, name: s });
      for (const t of grouped[s]) {
        res.push({ type: 'task', id: `task-${t.id}`, task: t });
      }
    }
    return res;
  }, [tasks]);

  const sectionDates = useMemo(() => {
    const grouped = tasks.reduce((acc, t) => {
      const s = (t.section?.trim() || '').toUpperCase();
      if (!acc[s]) acc[s] = [];
      acc[s].push(t);
      return acc;
    }, {} as Record<string, GanttTask[]>);

    const map: Record<string, { start: Date; end: Date; allCritical: boolean }> = {};
    Object.entries(grouped).forEach(([s, secTasks]) => {
      if (s === '' || secTasks.length === 0) return;
      
      const starts = secTasks.map(t => {
        const d = new Date(t.startDate?.seconds ? t.startDate.seconds * 1000 : new Date(t.startDate).getTime());
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0).getTime();
      });
      const ends = secTasks.map(t => {
        const d = new Date(t.endDate?.seconds ? t.endDate.seconds * 1000 : new Date(t.endDate).getTime());
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0).getTime();
      });
      const minStart = new Date(Math.min(...starts));
      const maxEnd = new Date(Math.max(...ends));
      
      minStart.setHours(12, 0, 0, 0);
      maxEnd.setHours(12, 0, 0, 0);

      const allCritical = secTasks.every(t => criticalTaskIds.has(t.id));

      map[s] = {
        start: minStart,
        end: maxEnd,
        allCritical
      };
    });
    return map;
  }, [tasks, criticalTaskIds]);

  // WBS Index Map: taskId -> sequential number (1-based, runtime only)
  const taskIdToWbs = useMemo(() => {
    const map: Record<string, number> = {};
    let idx = 1;
    rows.forEach(row => {
      if (row.type === 'task') {
        map[row.task.id] = idx++;
      }
    });
    return map;
  }, [rows]);

  const getTaskGridPosition = (task: GanttTask) => {
    const dS = new Date(task.startDate.seconds * 1000);
    const dE = new Date(task.endDate.seconds * 1000);
    
    const start = new Date(dS.getUTCFullYear(), dS.getUTCMonth(), dS.getUTCDate(), 12, 0, 0);
    const end = new Date(dE.getUTCFullYear(), dE.getUTCMonth(), dE.getUTCDate(), 12, 0, 0);
    
    const diffStart = Math.round((start.getTime() - startDateBase.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      startColumn: diffStart + 1,
      span: duration
    };
  };

  // --- PDF Export Handler ---
  // --- PDF Export Handler ---
  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || tasks.length === 0) return;
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 100));

    try {
      const allStarts = tasks.map(t => {
        const d = new Date(t.startDate.seconds * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
      });
      const allEnds = tasks.map(t => {
        const d = new Date(t.endDate.seconds * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
      });
      const minDate = new Date(Math.min(...allStarts.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...allEnds.map(d => d.getTime())));
      minDate.setHours(12, 0, 0, 0);
      maxDate.setHours(12, 0, 0, 0);
      
      // Buffer of 1 day before and 2 days after
      minDate.setDate(minDate.getDate() - 1);
      maxDate.setDate(maxDate.getDate() + 2);
      const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000);
      const dayDates: Date[] = [];
      for (let i = 0; i < totalDays; i++) { const d = new Date(minDate); d.setDate(minDate.getDate() + i); dayDates.push(d); }

      const ROW_H = 26;
      const LEFT_W = 970;
      const cellW = Math.max(8, Math.min(16, Math.floor(800 / totalDays)));
      const TIMELINE_W = totalDays * cellW;
      const TOTAL_W = LEFT_W + TIMELINE_W + 96;
      const MN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:0;top:0;background:#fff;padding:40px;font-family:system-ui,-apple-system,sans-serif;width:${TOTAL_W}px;box-sizing:border-box;z-index:50;overflow:visible;`;
      document.body.appendChild(container);
      container.innerHTML = options.chrome
        ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb;"><div><div style="font-size:24px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:0.1em;">${project?.name || 'Project'}</div><div style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;margin-top:4px;">Gantt Chart</div></div></div>`
        : '';

      const body = document.createElement('div');
      body.style.cssText = 'display:flex;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;';

      // LEFT PANEL (9 columns)
      const left = document.createElement('div');
      left.style.cssText = `width:${LEFT_W}px;flex-shrink:0;border-right:2px solid #e5e7eb;`;
      left.innerHTML = `<div style="display:grid;grid-template-columns:40px 1fr 90px 220px 70px 70px 60px 70px 60px;height:${ROW_H*2}px;background:#f9fafb;border-bottom:2px solid #e5e7eb;"><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:8px;font-weight:800;color:#9ca3af;">NO.</div><div style="padding:4px 8px;display:flex;align-items:center;border-right:1px solid #e5e7eb;font-size:8px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;">TASK</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">CATEGORY</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">ASSIGNEES</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">START</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">FINISH</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">DURATION</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:7px;font-weight:800;color:#9ca3af;text-transform:uppercase;">DEP.</div><div style="padding:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#9ca3af;text-transform:uppercase;">PROG.</div></div>`;

      let tIdx = 0;
      rows.forEach(row => {
        if (row.type === 'section') {
          const s = document.createElement('div');
          s.style.cssText = `height:${ROW_H}px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;padding:0 8px;`;
          s.innerHTML = `<span style="font-size:9px;font-weight:900;color:#374151;text-transform:uppercase;letter-spacing:0.1em;">▸ ${row.name}</span>`;
          left.appendChild(s); return;
        }
        tIdx++;
        const t = row.task;
        const wbsNum = taskIdToWbs[t.id] || '-';
        const bg = tIdx % 2 === 0 ? '#fafafa' : '#fff';
        
        const dS_row = new Date(t.startDate.seconds * 1000);
        const startStr = new Date(dS_row.getUTCFullYear(), dS_row.getUTCMonth(), dS_row.getUTCDate()).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
        const dE_row = new Date(t.endDate.seconds * 1000);
        const endStr = new Date(dE_row.getUTCFullYear(), dE_row.getUTCMonth(), dE_row.getUTCDate()).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
        
        const startMs = t.startDate.seconds * 1000;
        const endMs = t.endDate.seconds * 1000;
        
        const isSameDay = dS_row.getUTCFullYear() === dE_row.getUTCFullYear() &&
                          dS_row.getUTCMonth() === dE_row.getUTCMonth() &&
                          dS_row.getUTCDate() === dE_row.getUTCDate();
        const isMilestone = isSameDay && t.category?.trim().toLowerCase() === 'milestone';
        const duration = isMilestone ? 0 : Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

        const depString = Array.isArray(t.dependencies)
          ? t.dependencies.map(id => taskIdToWbs[id]).filter(Boolean).join(', ')
          : '-';
        const respNames = (t.assignedTo || []).map(uid => {
          const p = participants.find(part => part.id === uid);
          return p ? p.name.split(' ')[0] : '?';
        }).join(', ');

        const r = document.createElement('div');
        r.style.cssText = `display:grid;grid-template-columns:40px 1fr 90px 220px 70px 70px 60px 70px 60px;height:${ROW_H}px;background:${bg};border-bottom:1px solid #f3f4f6;`;
        r.innerHTML = `
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#6b7280;">${wbsNum}</div>
          <div style="padding:2px 8px;display:flex;align-items:center;border-right:1px solid #f0f0f0;font-size:9px;font-weight:700;color:#111;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${t.title}</div>
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:7px;font-weight:700;color:#4b5563;text-transform:uppercase;">${t.category||'-'}</div>
          <div style="padding:2px 8px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#4b5563;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="${respNames}">${respNames||'-'}</div>
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#4b5563;">${startStr}</div>
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#4b5563;">${endStr}</div>
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#4b5563;">${duration}d</div>
          <div style="padding:2px 4px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:8px;font-weight:700;color:#4b5563;">${depString}</div>
          <div style="padding:2px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#374151;">${t.progress}%</div>
        `;
        left.appendChild(r);
      });

      // RIGHT PANEL (Timeline)
      const right = document.createElement('div');
      right.style.cssText = `flex:1;overflow:visible;min-width:${TIMELINE_W}px;position:relative;`;

      // Month row
      const mRow = document.createElement('div');
      mRow.style.cssText = `display:flex;height:${ROW_H}px;background:#f9fafb;border-bottom:1px solid #e5e7eb;`;
      let cM = -1, mS = 0, mSp = 0;
      const mCells: {m:number;y:number;s:number}[] = [];
      dayDates.forEach((d, i) => { const m = d.getMonth(); if (m !== cM) { if (cM !== -1) mCells.push({m:cM,y:dayDates[mS].getFullYear(),s:mSp}); cM=m; mSp=1; mS=i; } else { mSp++; } });
      if (mSp > 0) mCells.push({m:cM,y:dayDates[mS].getFullYear(),s:mSp});
      mCells.forEach(mc => { const c = document.createElement('div'); c.style.cssText = `width:${mc.s*cellW}px;display:flex;align-items:center;justify-content:center;border-right:1px solid #e5e7eb;font-size:8px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.1em;`; c.textContent = `${MN[mc.m]} ${mc.y}`; mRow.appendChild(c); });
      right.appendChild(mRow);

      // Day row
      const dRow = document.createElement('div');
      dRow.style.cssText = `display:flex;height:${ROW_H}px;background:#f9fafb;border-bottom:2px solid #e5e7eb;`;
      dayDates.forEach(d => { const w = [0,6].includes(d.getDay()); const c = document.createElement('div'); c.style.cssText = `width:${cellW}px;display:flex;align-items:center;justify-content:center;border-right:1px solid #f0f0f0;font-size:7px;font-weight:700;${w?'background:#f9fafb;color:#bbb;':'color:#6b7280;'}`; c.textContent = `${d.getDate()}`; dRow.appendChild(c); });
      right.appendChild(dRow);

      // SVG Connections Layer
      let svgPathsHtml = '';
      rows.forEach((row, rowIdx) => {
        if (row.type !== 'task') return;
        const task = row.task;
        if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) return;
        
        const dS = new Date(task.startDate.seconds*1000);
        const ts = new Date(dS.getUTCFullYear(), dS.getUTCMonth(), dS.getUTCDate(), 12, 0, 0);
        const oD = Math.max(0, Math.floor((ts.getTime()-minDate.getTime())/86400000));
        const succX = oD*cellW + 2;
        const succY = (ROW_H * 2) + rowIdx * ROW_H + (ROW_H / 2);
        
        task.dependencies.forEach(depId => {
          const predIdx = rows.findIndex(r => r.type === 'task' && r.task.id === depId);
          if (predIdx === -1) return;
          const predRow = rows[predIdx] as any;
          const pS = new Date(predRow.task.startDate.seconds*1000);
          const pts = new Date(pS.getUTCFullYear(), pS.getUTCMonth(), pS.getUTCDate(), 12, 0, 0);
          const pE = new Date(predRow.task.endDate.seconds*1000);
          const pte = new Date(pE.getUTCFullYear(), pE.getUTCMonth(), pE.getUTCDate(), 12, 0, 0);
          const poD = Math.max(0, Math.floor((pts.getTime()-minDate.getTime())/86400000));
          const psD = Math.max(1, Math.ceil((pte.getTime()-pts.getTime())/86400000)+1);
          
          const predX = poD*cellW + 2 + Math.max(cellW-4, psD*cellW-4);
          const predY = (ROW_H * 2) + predIdx * ROW_H + (ROW_H / 2);

          // Force critical path connections on export
          const isCriticalPath = criticalTaskIds.has(task.id) && criticalTaskIds.has(depId);
          const strokeColor = isCriticalPath ? '#fca5a5' : '#d1d5db';
          const markerEnd = isCriticalPath ? 'url(#pdf-arrow-red)' : 'url(#pdf-arrow-gray)';
          const strokeWidth = isCriticalPath ? 2 : 1.5;

          let d = '';
          if (succX > predX + 16) {
            const midX = predX + 8;
            d = `M ${predX} ${predY} L ${midX} ${predY} L ${midX} ${succY} L ${succX} ${succY}`;
          } else {
            const midX1 = predX + 8;
            const midY = predY + (succY > predY ? ROW_H/2 : -ROW_H/2);
            const midX2 = succX - 8;
            d = `M ${predX} ${predY} L ${midX1} ${predY} L ${midX1} ${midY} L ${midX2} ${midY} L ${midX2} ${succY} L ${succX} ${succY}`;
          }
          svgPathsHtml += `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" marker-end="${markerEnd}" />`;
        });
      });

      const svgContainer = document.createElement('div');
      svgContainer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;';
      svgContainer.innerHTML = `<svg width="100%" height="100%"><defs><marker id="pdf-arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d1d5db" /></marker><marker id="pdf-arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fca5a5" /></marker></defs>${svgPathsHtml}</svg>`;
      right.appendChild(svgContainer);

      // Task bar rows
      rows.forEach(row => {
        const bR = document.createElement('div');
        bR.style.cssText = `display:flex;height:${ROW_H}px;position:relative;border-bottom:1px solid #f3f4f6;${row.type==='section'?'background:#f3f4f6;':''}`;
        dayDates.forEach(d => { const w = [0,6].includes(d.getDay()); const c = document.createElement('div'); c.style.cssText = `width:${cellW}px;height:100%;border-right:1px solid ${w?'#e9e9e9':'#f5f5f5'};flex-shrink:0;${w&&row.type!=='section'?'background:#f9fafb;':''}`; bR.appendChild(c); });
        
        if (row.type === 'section') {
          const secInfo = sectionDates[row.name];
          if (secInfo) {
            const ts = new Date(secInfo.start.getUTCFullYear(), secInfo.start.getUTCMonth(), secInfo.start.getUTCDate(), 12, 0, 0);
            const te = new Date(secInfo.end.getUTCFullYear(), secInfo.end.getUTCMonth(), secInfo.end.getUTCDate(), 12, 0, 0);
            const oD = Math.max(0, Math.floor((ts.getTime()-minDate.getTime())/86400000));
            const sD = Math.max(1, Math.ceil((te.getTime()-ts.getTime())/86400000)+1);
            
            let bL = oD * cellW + 8;
            let bW = sD * cellW - 16;

            // Clamp left
            if (bL < 8) {
              bW = bW + bL - 8;
              bL = 8;
            }
            // Clamp right
            const maxRight = totalDays * cellW - 8;
            if (bL + bW > maxRight) {
              bW = maxRight - bL;
            }

            if (bW > 0) {
              const isSecCritical = secInfo.allCritical;
              const col = isSecCritical ? '#ef4444' : '#4b5563';

              const bracket = document.createElement('div');
              bracket.style.cssText = `position:absolute;left:${bL}px;width:${bW}px;height:10px;top:50%;transform:translateY(-50%);z-index:10;pointer-events:none;`;
              bracket.innerHTML = `
                <div style="position:absolute;top:4px;left:0;right:0;height:2px;background:${col};"></div>
                <div style="position:absolute;left:0;top:0;bottom:0;width:2px;background:${col};"></div>
                <div style="position:absolute;right:0;top:0;bottom:0;width:2px;background:${col};"></div>
              `;
              bR.appendChild(bracket);
            }
          }
        }

        if (row.type === 'task') {
          const t = row.task;
          const dS = new Date(t.startDate.seconds*1000);
          const ts = new Date(dS.getUTCFullYear(), dS.getUTCMonth(), dS.getUTCDate(), 12, 0, 0);
          const dE = new Date(t.endDate.seconds*1000);
          const te = new Date(dE.getUTCFullYear(), dE.getUTCMonth(), dE.getUTCDate(), 12, 0, 0);
          const oD = Math.max(0, Math.floor((ts.getTime()-minDate.getTime())/86400000));
          const sD = Math.max(1, Math.ceil((te.getTime()-ts.getTime())/86400000)+1);
          
          const isCritical = criticalTaskIds.has(t.id);
          const isSameDay = ts.getTime() === te.getTime();
          const isMilestone = isSameDay && t.category?.trim().toLowerCase() === 'milestone';

          if (isMilestone) {
            const diaW = 12;
            const bL = oD * cellW + (cellW - diaW) / 2;
            const barBg = '#ff7f00';
            const barBorder = 'border:1px solid #d97706;';
            const bar = document.createElement('div');
            bar.style.cssText = `position:absolute;top:${(ROW_H-diaW)/2}px;height:${diaW}px;left:${bL}px;width:${diaW}px;background:${barBg};border-radius:0px;transform:rotate(45deg);z-index:10;${barBorder}`;
            bR.appendChild(bar);
          } else {
            const bL = oD*cellW+2, bW = Math.max(cellW-4, sD*cellW-4);
            const barBg = isCritical ? '#fee2e2' : '#e5e7eb';
            const barTextCol = isCritical ? '#991b1b' : '#374151';
            const barBorder = isCritical ? 'border:1px solid #fca5a5;' : 'border:1px solid #d1d5db;';
            const overlayBg = isCritical ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.08)';
            
            const bar = document.createElement('div');
            bar.style.cssText = `position:absolute;top:5px;height:${ROW_H-10}px;left:${bL}px;width:${bW}px;background:${barBg};border-radius:4px;overflow:hidden;display:flex;align-items:center;padding:0 6px;z-index:10;${barBorder}`;
            bar.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;width:${t.progress}%;background:${overlayBg};border-radius:4px 0 0 4px;"></div><span style="position:relative;z-index:1;font-size:7px;font-weight:800;color:${barTextCol};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:0.05em;">${t.title}</span>`;
            bR.appendChild(bar);
          }
        }
        right.appendChild(bR);
      });

      // Add Today's Line in right panel of PDF (dashed subtle orange)
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const todayDiff = Math.round((today.getTime() - minDate.getTime()) / 86400000);
      if (todayDiff >= 0 && todayDiff < totalDays) {
        const todayX = todayDiff * cellW + cellW / 2;
        const todayLine = document.createElement('div');
        todayLine.style.cssText = `position:absolute;left:${todayX}px;top:0;bottom:0;width:0px;border-left:1.5px dashed rgba(255,127,0,0.65);z-index:20;pointer-events:none;`;
        right.appendChild(todayLine);
      }

      body.appendChild(left); body.appendChild(right);
      container.appendChild(body);

      if (options.chrome) {
      // Footer
      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:100%;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;';
      
      // Legend Row (Corporate grid - 4 columns)
      const legendContainer = document.createElement('div');
      legendContainer.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px;padding:12px 0px;box-sizing:border-box;';
      legendContainer.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <div style="width:12px;height:12px;background:#e5e7eb;border-radius:3px;margin-top:2px;flex-shrink:0;"></div>
          <div style="display:flex;flex-direction:column;">
            <span style="font-size:8px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Regular Task</span>
            <span style="font-size:7px;font-weight:500;color:#6b7280;line-height:1.2;">Planned, in progress, or completed activities within the standard schedule.</span>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <div style="width:12px;height:12px;background:#fee2e2;border-radius:3px;margin-top:2px;flex-shrink:0;"></div>
          <div style="display:flex;flex-direction:column;">
            <span style="font-size:8px;font-weight:800;color:#b91c1c;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Critical Path</span>
            <span style="font-size:7px;font-weight:500;color:#6b7280;line-height:1.2;">Logical bottlenecks with zero float whose delay directly impacts the project's final deadline.</span>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <div style="width:10px;height:10px;background:#ff7f00;transform:rotate(45deg);margin-top:4px;margin-left:1px;flex-shrink:0;"></div>
          <div style="display:flex;flex-direction:column;">
            <span style="font-size:8px;font-weight:800;color:#d97706;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Milestone</span>
            <span style="font-size:7px;font-weight:500;color:#6b7280;line-height:1.2;">Significant events or key milestones in the project schedule with zero duration.</span>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <span style="font-size:12px;font-weight:bold;color:#9ca3af;line-height:1;margin-top:-2px;flex-shrink:0;">➔</span>
          <div style="display:flex;flex-direction:column;">
            <span style="font-size:8px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Manhattan Connection</span>
            <span style="font-size:7px;font-weight:500;color:#6b7280;line-height:1.2;">Orthogonal routing representing logical dependencies between tasks.</span>
          </div>
        </div>
      `;
      footer.appendChild(legendContainer);

      // Bottom Row
      const bottomRow = document.createElement('div');
      bottomRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;';
      bottomRow.innerHTML = `<span style="font-size:10px;color:#9ca3af;font-weight:500;">Gantt chart exported from the IBIT platform on ${new Date().toLocaleDateString('en-US')}</span>`;
      const fLogo = new window.Image(); fLogo.src = logoIbit; fLogo.style.cssText = 'height:30px;object-fit:contain;';
      bottomRow.appendChild(fLogo);
      footer.appendChild(bottomRow);
      
      container.appendChild(footer);
      }

      await new Promise(r => setTimeout(r, 500));

      await captureContainerAsPdf(container, {
        filename: `gantt-${(project?.name||'project').replace(/\s+/g,'-')}-${new Date().toISOString().substring(0,10)}.pdf`,
        widthPx: options.widthPx,
        heightPx: options.heightPx,
        dpi: options.dpi,
        chrome: options.chrome,
      });

      document.body.removeChild(container);
    } catch (err) {
      console.error('[Gantt PDF Export] Error:', err);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    const taskRows = rows.filter((r) => r.type === 'task') as { type: 'task'; task: GanttTask }[];
    await exportToExcel({
      filename: `gantt-${(project?.name || 'project').replace(/\s+/g, '-')}-${new Date().toISOString().substring(0, 10)}.xlsx`,
      sheetName: 'Gantt',
      title: tr.gantt.excelTitle(project?.name || tr.common.project),
      columns: [
        { header: 'WBS', key: 'wbs', type: 'string', width: 10, value: (r) => taskIdToWbs[r.task.id] || '-' },
        { header: tr.gantt.xlsTask, key: 'title', type: 'string', width: 32, value: (r) => r.task.title },
        { header: tr.gantt.xlsSection, key: 'section', type: 'string', width: 20, value: (r) => r.task.section || '-' },
        { header: tr.gantt.xlsCategory, key: 'category', type: 'string', width: 16, value: (r) => r.task.category || '-' },
        { header: tr.gantt.xlsStart, key: 'startDate', type: 'date', width: 14, value: (r) => new Date(r.task.startDate.seconds * 1000) },
        { header: tr.gantt.xlsEnd, key: 'endDate', type: 'date', width: 14, value: (r) => new Date(r.task.endDate.seconds * 1000) },
        { header: tr.gantt.xlsProgress, key: 'progress', type: 'percent', width: 14, value: (r) => (r.task.progress || 0) / 100 },
        { header: tr.gantt.xlsStatus, key: 'status', type: 'string', width: 16, value: (r) => r.task.status },
        {
          header: tr.gantt.xlsDependencies,
          key: 'dependencies',
          type: 'string',
          width: 20,
          value: (r) => (r.task.dependencies || []).map((id) => taskIdToWbs[id]).filter(Boolean).join(', '),
        },
      ],
      rows: taskRows,
    });
  };

  if (loading) {
    return (
      <div className="flex bg-[#f8f9fa] min-h-screen">
        <Sidebar projectId={projectId} projectName={project?.name} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-[#ff7f00] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-[#f8f9fa] min-h-screen font-sans selection:bg-orange-100 selection:text-[#ff7f00]">
      <Sidebar projectId={projectId} projectName={project?.name} onOpenSettings={() => setIsSettingsOpen(true)} />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project?.name}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 h-[100dvh] lg:h-screen overflow-hidden pb-[70px] lg:pb-0">
        <MobileHeader
          projectName={project?.name}
          projectPhotoURL={project?.photoURL || undefined}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project?.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🏎️</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider uppercase leading-tight text-gray-900">
                {project?.name || tr.common.loading} {project?.shortId && `- #${project.shortId}`}
              </h2>
            </div>

            <div className="flex items-center ml-4">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member?.name}>
                    {member?.photoURL ? (
                      <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 uppercase">
                        {member?.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
                {project?.members.length || 0} {tr.common.membersCount(project?.members.length || 0)}
              </span>
            </div>
          </div>
        </header>

        {/* --- Subheader --- */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-50 min-h-[68px]">
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto no-scrollbar flex-1 mr-2">
            <div className="hidden sm:flex items-center gap-2">
              <BarChart className="w-5 h-5 text-[#ff7f00]" />
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-widest">
                GANTT
              </h2>
            </div>

            <button 
              onClick={() => { setCustomStartDate(project?.ganttStartDate ? new Date(project.ganttStartDate.seconds*1000).toISOString().split('T')[0] : ''); setIsStartDateModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:border-[#ff7f00] hover:text-[#ff7f00] text-gray-500 transition-colors group whitespace-nowrap"
              title={tr.gantt.editStart}
            >
               <CalendarIcon className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#ff7f00]" />
               <span className="text-[9px] font-bold uppercase tracking-widest">{tr.gantt.startLabel} {startDateBase.toLocaleDateString(locale)}</span>
               <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
            </button>

            <div className="hidden sm:flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
               <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tr.gantt.zoom}</span>
               <input 
                 type="range" min="20" max="200" step="5" 
                 value={cellWidth} onChange={e => setCellWidth(Number(e.target.value))} 
                 className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ff7f00]" 
               />
            </div>

            {/* CPM Critical Path Toggle */}
            <div className="hidden sm:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tr.gantt.criticalPath}</span>
              <button
                onClick={() => setShowCriticalPath(!showCriticalPath)}
                className={clsx(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  showCriticalPath ? "bg-red-600" : "bg-gray-200"
                )}
              >
                <span
                  className={clsx(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    showCriticalPath ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          <div className="hidden sm:flex gap-3 items-center">
             <input
               type="file"
               ref={importInputRef}
               accept=".json"
               className="hidden"
               onChange={handleImportJSON}
             />
             <div className="relative">
                <button 
                  onClick={() => setIsJSONMenuOpen(!isJSONMenuOpen)}
                  className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 flex items-center justify-center transition-all font-bold uppercase tracking-widest text-[10px] rounded-lg hover:bg-gray-50 active:scale-95"
                  title={tr.gantt.jsonOptions}
                >
                  <FileJson className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                  {isJSONMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setIsJSONMenuOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full mt-2 right-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[70] overflow-hidden"
                      >
                        <button 
                          onClick={() => { importInputRef.current?.click(); setIsJSONMenuOpen(false); }}
                          className="w-full px-4 py-3 text-left text-[10px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-3 transition-colors border-b border-gray-100 uppercase tracking-widest"
                        >
                          <Upload className="w-3.5 h-3.5 text-gray-400" />
                          {tr.gantt.importJson}
                        </button>
                        <button 
                          onClick={() => { handleExportJSON(); setIsJSONMenuOpen(false); }}
                          disabled={tasks.length === 0}
                          className="w-full px-4 py-3 text-left text-[10px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-3 transition-colors disabled:opacity-50 uppercase tracking-widest"
                        >
                          <FileJson className="w-3.5 h-3.5 text-gray-400" />
                          {tr.gantt.exportJson}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
             <ExportButton
               formats={['pdf', 'excel']}
               title={tr.gantt.exportTitle}
               onExportPdf={handleExportPDF}
               onExportExcel={handleExportExcel}
               disabledFormats={{ pdf: tasks.length === 0, excel: tasks.length === 0 }}
               compact
               className="px-3 py-1.5 text-[10px]"
             />
             <button 
               onClick={() => setIsStakeholderModalOpen(true)}
               className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-[10px] rounded-lg hover:bg-gray-50 active:scale-95"
             >
               <Users className="w-3.5 h-3.5" />
               {tr.gantt.membersStakeholders}
             </button>
             <button 
               onClick={() => { setEditingTask(null); setIsTaskModalOpen(true); }}
               className="bg-[#ff7f00] hover:bg-orange-600 text-white px-3 py-1.5 flex items-center gap-2 transition-all font-bold uppercase tracking-widest text-[10px] rounded-lg active:scale-95 shadow-md shadow-orange-100"
             >
               <Plus className="w-3.5 h-3.5" />
               {tr.gantt.newTask}
             </button>
          </div>

          <div className="flex sm:hidden">
            <button 
              onClick={() => setShowMobileActions(true)}
              className="w-10 h-10 bg-[#ff7f00] text-white flex items-center justify-center rounded-xl active:scale-95 transition-all"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* --- Gantt Body --- */}
        <div className="flex-1 custom-scrollbar relative overflow-y-auto overflow-x-hidden bg-white">
          <div className="flex min-h-full">
            
            {/* List Sidebar */}
            <div 
              className="flex flex-col bg-white shrink-0 border-r border-gray-200 overflow-x-auto custom-scrollbar"
              style={{ width: sidebarWidth, minWidth: 400, maxWidth: 1200 }}
            >
              <div className="flex flex-col h-auto min-w-[900px]">
                <div className="flex bg-white border-b border-gray-200 uppercase text-[10px] font-bold text-gray-400 tracking-widest shrink-0 sticky top-0 z-40 h-[68px]">
                  <div className="w-[40px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">Nº</div>
                  <div className="flex-1 min-w-[200px] p-2 border-r border-gray-100 flex items-center">{tr.gantt.colTask}</div>
                  <div className="w-[90px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colCategory}</div>
                  <div className="w-[130px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colResp}</div>
                  <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colStart}</div>
                  <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colEnd}</div>
                  <div className="w-[60px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colDuration}</div>
                  <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center">{tr.gantt.colDeps}</div>
                  <div className="w-[60px] shrink-0 p-2 flex items-center justify-center">{tr.gantt.colProgress}</div>
                </div>
                
                <div className="bg-white flex flex-col w-full">
                  {rows.length > 0 ? (
                    rows.map(row => {
                      if (row.type === 'section') {
                        return (
                          <div key={row.id} className="w-full h-[46px] border-b border-gray-300 bg-gray-200 flex items-center px-4 group shrink-0">
                            <span className="text-[11px] font-black uppercase text-gray-800 tracking-widest">{row.name}</span>
                          </div>
                        );
                      }
                      const task = row.task;
                      const wbsNum = taskIdToWbs[task.id] || '-';
                      const startMs = task.startDate.seconds * 1000;
                      const endMs = task.endDate.seconds * 1000;
                      
                      const dS_row = new Date(startMs);
                      const dE_row = new Date(endMs);
                      const isSameDay = dS_row.getUTCFullYear() === dE_row.getUTCFullYear() &&
                                        dS_row.getUTCMonth() === dE_row.getUTCMonth() &&
                                        dS_row.getUTCDate() === dE_row.getUTCDate();
                      const isMilestone = isSameDay && task.category?.trim().toLowerCase() === 'milestone';
                      const duration = isMilestone ? 0 : Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

                      const depString = Array.isArray(task.dependencies)
                        ? task.dependencies.map(id => taskIdToWbs[id]).filter(Boolean).join(', ')
                        : '-';
                      return (
                        <div key={task.id} className="flex w-full border-b border-gray-100 group hover:bg-gray-50/50 transition-colors h-[46px] relative bg-white shrink-0">
                          <div className="w-[40px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-400">
                            {wbsNum}
                          </div>

                          <div className="flex-1 min-w-[200px] px-3 py-2 border-r border-gray-100 overflow-hidden flex flex-col justify-center relative">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-gray-800 uppercase truncate pr-16">{task.title}</span>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); setEditingTask(task); setIsTaskModalOpen(true); }} className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-[#ff7f00] rounded-md transition-colors"><Edit2 className="w-3 h-3" /></button>
                                <button onClick={(e) => { e.stopPropagation(); setTaskToDelete(task.id); }} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-md transition-colors"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          </div>

                          <div className="w-[90px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <span className="text-[10px] font-bold text-gray-500 uppercase truncate">
                              {task.category || '-'}
                            </span>
                          </div>

                          <div className="w-[130px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <div className="flex flex-row flex-nowrap -space-x-2 items-center w-full justify-center">
                               {task.assignedTo?.map((uid, i) => {
                                 const p = participants.find(part => part.id === uid);
                                 if (!p) return null;
                                 return p.photoURL ? (
                                   <img key={i} src={p.photoURL} className="w-6 h-6 rounded-full border-2 border-white object-cover shadow-sm shrink-0" title={p.name} />
                                 ) : (
                                   <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-600 shadow-sm shrink-0" title={p.name}>
                                     {p.name.charAt(0)}
                                   </div>
                                 );
                               })}
                            </div>
                          </div>

                          <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <span className="text-[10px] font-semibold text-gray-600 whitespace-nowrap">
                              {(() => {
                                const d = new Date(startMs);
                                return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
                              })()}
                            </span>
                          </div>

                          <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <span className="text-[10px] font-semibold text-gray-600 whitespace-nowrap">
                              {(() => {
                                const d = new Date(endMs);
                                return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
                              })()}
                            </span>
                          </div>

                          <div className="w-[60px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <span className="text-[11px] font-bold text-gray-600">
                              {duration}d
                            </span>
                          </div>

                          <div className="w-[70px] shrink-0 p-2 border-r border-gray-100 flex items-center justify-center overflow-hidden">
                            <span className="text-[10px] font-bold text-gray-500 truncate w-full text-center">
                              {depString || '-'}
                            </span>
                          </div>

                          <div className="w-[60px] shrink-0 p-2 flex items-center justify-center">
                            <span className="text-[11px] font-bold text-gray-700">{task.progress}%</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                        <BarChart className="w-8 h-8 text-gray-200" />
                      </div>
                      <div className="space-y-1 px-8 text-center max-w-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{tr.gantt.empty}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drag Resizer */}
            {isDesktop && (
              <div 
                 className="w-1 bg-gray-100 hover:bg-[#ff7f00] z-50 shrink-0 transition-all cursor-col-resize active:bg-[#ff7f00]"
                 onMouseDown={(e) => {
                   const startX = e.clientX;
                   const startWidth = sidebarWidth;
                   
                   const handleMouseMove = (moveEvent: MouseEvent) => {
                     document.body.style.cursor = 'col-resize';
                     setSidebarWidth(Math.max(400, Math.min(1200, startWidth + (moveEvent.clientX - startX))));
                   };
                   
                   const handleMouseUp = () => {
                     document.body.style.cursor = 'default';
                     document.removeEventListener('mousemove', handleMouseMove);
                     document.removeEventListener('mouseup', handleMouseUp);
                   };
                   
                   document.addEventListener('mousemove', handleMouseMove);
                   document.addEventListener('mouseup', handleMouseUp);
                 }}
              />
            )}

            {/* Timeline Column */}
            <div className="flex-1 flex flex-col min-w-0 bg-gray-50/20">
              {/* Timeline Header Wrapper */}
              <div 
                ref={timelineHeaderRef}
                className="sticky top-0 z-40 bg-white border-b border-gray-200 overflow-hidden shrink-0"
              >
                <div style={{ width: `${timelineDates.length * cellWidth}px` }}>
                  {/* Month Row */}
                  <div className="flex h-8 border-b border-gray-100">
                    {monthGroups.map((group, idx) => (
                      <div 
                        key={idx}
                        className="flex-shrink-0 border-r border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-500 tracking-[0.2em] uppercase bg-gray-50/50"
                        style={{ width: `${group.days * cellWidth}px` }}
                      >
                        {group.month} {group.year}
                      </div>
                    ))}
                  </div>
                  {/* Day Row */}
                  <div className="flex h-9">
                    {timelineDates.map((date, idx) => (
                      <div 
                        key={idx} 
                        className={clsx(
                          "flex flex-col items-center justify-center border-r border-gray-100 group transition-colors overflow-hidden shrink-0",
                          [0, 6].includes(date.getDay()) ? "bg-gray-50/30" : "hover:bg-orange-50/30"
                        )}
                        style={{ width: `${cellWidth}px` }}
                      >
                        <span className={clsx("font-bold text-gray-400 uppercase", cellWidth < 40 ? "text-[6px]" : "text-[8px]")}>
                          {date.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 3)}
                        </span>
                        <span className={clsx("font-bold text-gray-900", cellWidth < 40 ? "text-[8px]" : "text-[10px]")}>
                          {date.getDate()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline Body Wrapper */}
              <div 
                ref={timelineBodyRef}
                onScroll={handleTimelineScroll}
                className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar flex flex-col"
              >
                <div style={{ width: `${timelineDates.length * cellWidth}px` }} className="relative flex-1 flex flex-col">

                {/* Chart Grid Lines & Task Bars */}
                <div className="relative flex-1 flex flex-col">
                  {/* Background Grid */}
                  <div className="absolute inset-0 flex pointer-events-none z-0">
                    {timelineDates.map((date, idx) => (
                      <div 
                        key={idx} 
                        className={clsx(
                          "h-full border-r border-gray-100/50 transition-colors shrink-0",
                          [0, 6].includes(date.getDay()) ? "bg-gray-100/25" : ""
                        )}
                        style={{ width: `${cellWidth}px` }}
                      />
                    ))}
                  </div>

                  {/* Today's Vertical Line */}
                  {todayIdx !== -1 && (
                    <div 
                      className="absolute top-0 bottom-0 pointer-events-none z-20 border-l-[1.5px] border-dashed border-[#ff7f00]/70"
                      style={{
                        left: `${todayIdx * cellWidth + cellWidth / 2}px`,
                        width: '0px'
                      }}
                    />
                  )}

                  {/* SVG Connection Vectors */}
                  <svg className="absolute inset-0 pointer-events-none z-30" style={{ width: '100%', height: '100%' }}>
                    <defs>
                      <marker id="arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#d1d5db" />
                      </marker>
                      <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#fca5a5" />
                      </marker>
                    </defs>
                    {rows.map((row, rowIdx) => {
                      if (row.type !== 'task') return null;
                      const task = row.task;
                      if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) return null;
                      
                      const succPos = getTaskGridPosition(task);
                      const succX = (succPos.startColumn - 1) * cellWidth + 8;
                      const succY = rowIdx * 46 + 23;
                      
                      return task.dependencies.map(depId => {
                        const predIdx = rows.findIndex(r => r.type === 'task' && r.task.id === depId);
                        if (predIdx === -1) return null;
                        
                        const predRow = rows[predIdx] as { type: 'task', task: GanttTask };
                        const predPos = getTaskGridPosition(predRow.task);
                        const predX = (predPos.startColumn - 1) * cellWidth + 8 + (predPos.span * cellWidth - 16);
                        const predY = predIdx * 46 + 23;
                        
                        const isCriticalPath = showCriticalPath && criticalTaskIds.has(task.id) && criticalTaskIds.has(depId);
                        const strokeColor = isCriticalPath ? '#fca5a5' : '#d1d5db';
                        const markerEnd = isCriticalPath ? 'url(#arrow-red)' : 'url(#arrow-gray)';
                        const strokeWidth = isCriticalPath ? 2 : 1.5;

                        // Manhattan Routing
                        let d = '';
                        if (succX > predX + 16) {
                          const midX = predX + 8;
                          d = `M ${predX} ${predY} L ${midX} ${predY} L ${midX} ${succY} L ${succX} ${succY}`;
                        } else {
                          const midX1 = predX + 8;
                          const midY = predY + (succY > predY ? 23 : -23);
                          const midX2 = succX - 8;
                          d = `M ${predX} ${predY} L ${midX1} ${predY} L ${midX1} ${midY} L ${midX2} ${midY} L ${midX2} ${succY} L ${succX} ${succY}`;
                        }

                        return (
                          <path 
                            key={`${depId}-${task.id}`}
                            d={d}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeLinejoin="round"
                            markerEnd={markerEnd}
                          />
                        );
                      });
                    })}
                  </svg>

                  {/* Task Bars container */}
                  <div className="relative pt-0 flex flex-col z-10">
                    {rows.map((row, rowIndex) => {
                      if (row.type === 'section') {
                        const secInfo = sectionDates[row.name];
                        let bracketEl = null;
                        if (secInfo) {
                          const diffStart = Math.round((secInfo.start.getTime() - startDateBase.getTime()) / (1000 * 60 * 60 * 24));
                          const durationDays = Math.round((secInfo.end.getTime() - secInfo.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                          
                          const startCol = diffStart + 1;
                          const span = durationDays;
                          
                          let leftPos = (startCol - 1) * cellWidth + 8;
                          let barWidth = span * cellWidth - 16;

                          // Clamp left
                          if (leftPos < 8) {
                            barWidth = barWidth + leftPos - 8;
                            leftPos = 8;
                          }
                          // Clamp right
                          const maxRight = totalDays * cellWidth - 8;
                          if (leftPos + barWidth > maxRight) {
                            barWidth = maxRight - leftPos;
                          }

                          if (barWidth > 0) {
                            const isSecCritical = showCriticalPath && secInfo.allCritical;
                            const bracketColor = isSecCritical ? '#ef4444' : '#4b5563';

                            bracketEl = (
                              <div 
                                className="absolute top-1/2 -translate-y-1/2 h-[12px] pointer-events-none"
                                style={{
                                  left: `${leftPos}px`,
                                  width: `${barWidth}px`
                                }}
                              >
                                {/* Horizontal Line */}
                                <div className="absolute top-[5px] left-0 right-0 h-[2px]" style={{ backgroundColor: bracketColor }} />
                                {/* Left Vertical Tick */}
                                <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: bracketColor }} />
                                {/* Right Vertical Tick */}
                                <div className="absolute right-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: bracketColor }} />
                              </div>
                            );
                          }
                        }
                        return (
                          <div key={row.id} className="h-[46px] border-b border-gray-200/50 bg-gray-100/30 w-full shrink-0 relative">
                            {bracketEl}
                          </div>
                        );
                      }
                      const task = row.task;
                      const pos = getTaskGridPosition(task);
                      const dS = new Date(task.startDate.seconds * 1000);
                      const dE = new Date(task.endDate.seconds * 1000);
                      const isSameDay = dS.getUTCFullYear() === dE.getUTCFullYear() &&
                                        dS.getUTCMonth() === dE.getUTCMonth() &&
                                        dS.getUTCDate() === dE.getUTCDate();
                      const isMilestone = isSameDay && task.category?.trim().toLowerCase() === 'milestone';
                      
                      const diaW = 12;
                      const leftPos = isMilestone 
                        ? (pos.startColumn - 1) * cellWidth + (cellWidth - diaW) / 2 
                        : (pos.startColumn - 1) * cellWidth + 8;
                      const barWidth = isMilestone ? diaW : pos.span * cellWidth - 16;
                      
                      return (
                        <div 
                          key={row.id} 
                          className="h-[46px] border-b border-gray-100/30 relative group transition-colors hover:bg-gray-50/10 shrink-0"
                        >
                           <motion.div
                             initial={{ opacity: 0, x: -20 }}
                             animate={{ opacity: 1, x: 0 }}
                             className={clsx(
                               "absolute rounded-sm shadow-sm border transition-all cursor-pointer",
                               isMilestone 
                                 ? "top-[17px] border-orange-600 bg-[#ff7f00]" 
                                 : "top-1/2 -translate-y-1/2 h-[26px] overflow-hidden flex flex-col justify-end bg-gray-200 border-gray-300 text-gray-800",
                               !isMilestone && showCriticalPath && criticalTaskIds.has(task.id) && "bg-red-100 border-red-200 text-red-900"
                             )}
                             style={{
                               left: `${leftPos}px`,
                               width: `${barWidth}px`,
                               height: isMilestone ? `${diaW}px` : '26px',
                               transform: isMilestone ? 'rotate(45deg)' : undefined,
                               borderRadius: isMilestone ? '0px' : '6px'
                             }}
                             onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                           >
                              {/* Progress Overlay */}
                              {!isMilestone && (
                                <div 
                                   className={clsx(
                                     "absolute inset-0 origin-left transition-transform duration-500 pointer-events-none",
                                     showCriticalPath && criticalTaskIds.has(task.id) ? "bg-red-200/50" : "bg-black/10"
                                   )}
                                   style={{ transform: `scaleX(${task.progress / 100})` }}
                                />
                              )}
                              {/* Task Label on Bar if space allows */}
                              {!isMilestone && (
                                <div className="relative h-full flex items-center px-3 overflow-hidden pointer-events-none">
                                   <span className={clsx(
                                     "text-[9px] font-bold uppercase tracking-widest truncate",
                                     (showCriticalPath && criticalTaskIds.has(task.id)) 
                                       ? "text-red-900" 
                                       : "text-gray-800"
                                   )}>
                                     {task.title}
                                   </span>
                                </div>
                              )}
                           </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

      {/* --- Modals --- */}
      <AnimatePresence>
        {isTaskModalOpen && (
          <GanttTaskModal 
            task={editingTask} 
            participants={participants}
            allTasks={tasks}
            taskIdToWbs={taskIdToWbs}
            onSave={handleTaskSave} 
            onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); }} 
          />
        )}
        {isStakeholderModalOpen && (
          <StakeholderModal 
            projectId={projectId!}
            stakeholder={editingStakeholder}
            projectMembers={projectMembers}
            currentStakeholders={stakeholders}
            onSaveMember={async (uid, name) => {
               try {
                 await commitWrite(addDoc(collection(db, 'projectStakeholders'), {
                   projectId, name, userId: uid, createdAt: serverTimestamp()
                 }), { label: 'o participante' });
               } catch (error) {
                 logFirestoreError(error, OperationType.CREATE, 'projectStakeholders');
                 alert(friendlyWriteError(error));
               }
            }}
            onSaveExternal={handleStakeholderSave}
            onClose={() => { setIsStakeholderModalOpen(false); setEditingStakeholder(null); }}
          />
        )}
        {isSettingsOpen && project && (
          <ProjectSettingsModal 
            project={project} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        )}
        {isStartDateModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-sm overflow-hidden rounded-xl shadow-xl flex flex-col">
              <div className="flex justify-between items-center p-6 border-b border-gray-200 shadow-sm shrink-0">
                <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">{tr.gantt.timelineStart}</h2>
                <button onClick={() => setIsStartDateModalOpen(false)} className="text-gray-400 hover:text-gray-900"><X className="w-6 h-6" /></button>
              </div>
              <div className="p-6">
                <form id="start-date-form" onSubmit={handleSaveStartDate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{tr.gantt.referenceDate}</label>
                    <input type="date" required className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold text-sm rounded-lg shadow-sm" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setIsStartDateModalOpen(false)} className="flex-1 px-4 py-2.5 text-xs font-bold uppercase text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">{tr.common.cancel}</button>
                    <button type="submit" className="flex-1 px-4 py-2.5 text-xs font-bold uppercase text-white bg-[#ff7f00] hover:bg-orange-600 rounded-lg">{tr.common.save}</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
        {taskToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white border border-gray-200 w-full max-w-sm overflow-hidden rounded-xl shadow-xl flex flex-col">
               <div className="flex justify-between items-center p-6 border-b border-gray-200 shadow-sm shrink-0">
                  <h2 className="text-xl font-bold uppercase tracking-wider text-red-600">{tr.gantt.deleteTask}</h2>
                  <button onClick={() => setTaskToDelete(null)} className="text-gray-400 hover:text-gray-900"><X className="w-6 h-6" /></button>
               </div>
               <div className="p-6">
                  <p className="text-sm text-gray-600 font-medium mb-6">{tr.gantt.deleteMessage}</p>
                  <div className="flex gap-3">
                     <button onClick={() => setTaskToDelete(null)} className="flex-1 px-4 py-2.5 text-xs font-bold uppercase text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">{tr.common.cancel}</button>
                     <button onClick={confirmDeleteTask} className="flex-1 px-4 py-2.5 text-xs font-bold uppercase text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg">{tr.common.delete}</button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exporting Overlay */}
      <AnimatePresence>
        {isExporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6"
          >
            <Loader2 className="w-12 h-12 text-[#ff7f00] animate-spin" />
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900 tracking-widest uppercase mb-2">{tr.gantt.exporting}</h2>
              <p className="text-sm text-gray-500 font-medium">{tr.gantt.exportingText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMobileActions && (
          <div className="fixed inset-0 z-[70] flex items-end sm:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileActions(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full bg-white rounded-t-3xl p-6 border-t border-gray-200"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8" />
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-6 px-2">{tr.gantt.quickActions}</h3>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => { setShowMobileActions(false); setEditingTask(null); setIsTaskModalOpen(true); }}
                  className="w-full flex items-center gap-4 p-4 bg-orange-50 text-[#ff7f00] rounded-2xl border border-orange-100 font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all"
                >
                  <div className="w-10 h-10 bg-[#ff7f00] text-white flex items-center justify-center rounded-xl">
                    <Plus className="w-6 h-6" />
                  </div>
                  {tr.gantt.newTaskMobile}
                </button>

                <button 
                  onClick={() => { setShowMobileActions(false); setIsStakeholderModalOpen(true); }}
                  className="w-full flex items-center gap-4 p-4 bg-gray-50 text-gray-700 rounded-2xl border border-gray-100 font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all"
                >
                  <div className="w-10 h-10 bg-white text-gray-400 border border-gray-200 flex items-center justify-center rounded-xl">
                    <Users className="w-6 h-6" />
                  </div>
                  {tr.gantt.membersMobile}
                </button>

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => setMobileJSONOpen(!mobileJSONOpen)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 text-gray-700 rounded-2xl border border-gray-100 font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white text-gray-400 border border-gray-200 flex items-center justify-center rounded-xl">
                        <FileJson className="w-6 h-6" />
                      </div>
                      {tr.gantt.jsonData}
                    </div>
                    <ChevronDown className={clsx("w-5 h-5 transition-transform", mobileJSONOpen && "rotate-180")} />
                  </button>
                  
                  <AnimatePresence>
                    {mobileJSONOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden flex flex-col gap-2 px-2"
                      >
                        <button 
                          onClick={() => { setShowMobileActions(false); handleExportJSON(); }}
                          disabled={tasks.length === 0}
                          className="w-full flex items-center gap-4 p-3 bg-white text-gray-600 rounded-xl border border-gray-100 font-bold uppercase tracking-widest text-[10px] active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                          <FileJson className="w-4 h-4 text-gray-400" />
                          {tr.gantt.exportJson}
                        </button>
                        <button 
                          onClick={() => { setShowMobileActions(false); importInputRef.current?.click(); }}
                          className="w-full flex items-center gap-4 p-3 bg-white text-gray-600 rounded-xl border border-gray-100 font-bold uppercase tracking-widest text-[10px] active:scale-[0.98] transition-all"
                        >
                          <Upload className="w-4 h-4 text-gray-400" />
                          {tr.gantt.importJson}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <button 
                onClick={() => setShowMobileActions(false)}
                className="w-full mt-6 p-4 bg-white text-gray-400 font-bold uppercase tracking-widest text-xs rounded-2xl border border-gray-100 active:scale-[0.98] transition-all"
              >
                {tr.common.cancel}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
