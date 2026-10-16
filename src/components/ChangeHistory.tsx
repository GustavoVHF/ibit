import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, GitPullRequest, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileToolsDrawer from './MobileToolsDrawer';
import { db } from '../firebase';
import { ChangeHistoryEntry, ChangeSector, ChangeStatus, GanttTask, Project, Task, UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { canManageMembers, canWrite as canWriteProject } from '../utils/roleHelpers';
import { CHANGE_HISTORY_COLLECTION } from '../utils/changeHistory';
import ChangeHistorySummaryCards from './changeHistory/ChangeHistorySummaryCards';
import ChangeHistoryTable from './changeHistory/ChangeHistoryTable';
import NewChangeRequestModal from './changeHistory/NewChangeRequestModal';
import ReviewChangeModal from './changeHistory/ReviewChangeModal';
import { CHANGE_SECTORS, CHANGE_STATUSES, computeTotals } from './changeHistory/changeHistoryHelpers';

/** Central de governança e Change Log integrado do projeto. */
export default function ChangeHistory() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [entries, setEntries] = useState<ChangeHistoryEntry[]>([]);
  const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([]);
  const [kanbanTasks, setKanbanTasks] = useState<Task[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChangeStatus | 'Todos'>('Todos');
  const [sectorFilter, setSectorFilter] = useState<ChangeSector | 'Todos'>('Todos');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChangeHistoryEntry | null>(null);
  const [reviewingItem, setReviewingItem] = useState<ChangeHistoryEntry | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ChangeHistoryEntry | null>(null);

  useEffect(() => {
    if (!projectId || !user) return;
    return onSnapshot(doc(db, 'projects', projectId), (snapshot) => {
      if (snapshot.exists()) setProject({ id: snapshot.id, ...snapshot.data() } as Project);
      else navigate('/dashboard');
    });
  }, [projectId, user, navigate]);

  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(query(collection(db, CHANGE_HISTORY_COLLECTION), where('projectId', '==', projectId)), (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChangeHistoryEntry));
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setEntries(data);
      setLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(query(collection(db, 'ganttTasks'), where('projectId', '==', projectId)), (snapshot) => {
      setGanttTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as GanttTask)));
    });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(query(collection(db, 'tasks'), where('projectId', '==', projectId)), (snapshot) => {
      setKanbanTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task)));
    });
  }, [projectId]);

  useEffect(() => {
    if (!project?.members?.length) return;
    return onSnapshot(query(collection(db, 'users'), where(documentId(), 'in', project.members.slice(0, 30))), (snapshot) => {
      setProjectMembers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() } as UserProfile)));
    });
  }, [project?.members?.join(',')]);

  const canDecide = !!(project && user && canManageMembers(project, user.uid));
  const canWrite = !!(project && user && canWriteProject(project, user.uid));
  const totals = useMemo(() => computeTotals(entries), [entries]);
  const filteredEntries = useMemo(() => {
    const text = searchQuery.toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== 'Todos' && entry.status !== statusFilter) return false;
      if (sectorFilter !== 'Todos' && entry.sector !== sectorFilter) return false;
      return !text || [entry.title, entry.description, entry.requestedByName, entry.source].some((value) => value?.toLowerCase().includes(text));
    });
  }, [entries, searchQuery, statusFilter, sectorFilter]);

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try { await deleteDoc(doc(db, CHANGE_HISTORY_COLLECTION, itemToDelete.id)); setItemToDelete(null); }
    catch (error) { handleFirestoreError(error, OperationType.DELETE, CHANGE_HISTORY_COLLECTION); }
  };

  if (loading || !project) return <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin" /></div>;

  const selectClass = 'bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 text-gray-700';
  return (
    <div className="flex h-screen bg-[#f8f9fa] overflow-hidden">
      <Sidebar projectId={projectId} projectName={project.name} />
      <MobileToolsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} projectId={projectId!} projectName={project.name} />
      <main className="flex-1 flex flex-col min-w-0">
        <MobileHeader projectName={project.name} projectPhotoURL={project.photoURL || undefined} onOpenDrawer={() => setIsDrawerOpen(true)} />
        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4"><div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">{project.photoURL ? <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" /> : <span className="text-xl">🏎️</span>}</div><h2 className="text-xl font-bold tracking-wider uppercase leading-tight text-gray-900">{project.name} {project.shortId && `- #${project.shortId}`}</h2><div className="flex items-center ml-4"><div className="flex -space-x-2 mr-3">{projectMembers.map((member) => <div key={member.uid} title={member.name}>{member.photoURL ? <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" /> : <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">{member.name.charAt(0)}</div>}</div>)}</div><span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">{project.members.length} {project.members.length === 1 ? 'MEMBRO' : 'MEMBROS'}</span></div></div>
        </header>

        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex flex-col gap-3 shrink-0 shadow-sm z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
              <div className="hidden xl:flex items-center gap-2 shrink-0 mr-2"><GitPullRequest className="w-5 h-5 text-[#ff7f00]" /><h1 className="text-sm font-bold text-gray-900 uppercase tracking-widest whitespace-nowrap">Gestão de Mudanças</h1></div>
              <div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Procurar no Change Log..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 focus:outline-none focus:border-[#ff7f00] text-sm font-medium rounded-lg" /></div>
              <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value as ChangeSector | 'Todos')} className={selectClass}><option value="Todos">Todos os Setores</option>{CHANGE_SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ChangeStatus | 'Todos')} className={selectClass}><option value="Todos">Todos</option>{CHANGE_STATUSES.map((status) => <option key={status} value={status}>{status === 'Pendente' ? 'Pendentes' : status === 'Aprovado' ? 'Aprovadas' : status === 'Recusado' ? 'Recusadas' : 'Postergadas'}</option>)}</select>
            </div>
            {canWrite && <button onClick={() => { setEditingItem(null); setIsFormOpen(true); }} className="bg-[#ff7f00] hover:bg-orange-600 text-white px-4 sm:px-5 py-2 flex items-center justify-center gap-2 transition-all font-bold uppercase tracking-widest text-xs rounded-lg active:scale-95 shadow-md shadow-orange-100"><Plus className="w-4 h-4" /><span>Nova Solicitação</span></button>}
          </div>
          {totals.pending > 0 && canDecide && <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg"><AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /><span className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider">{totals.pending} {totals.pending === 1 ? 'mudança aguarda' : 'mudanças aguardam'} avaliação</span><button onClick={() => setStatusFilter('Pendente')} className={clsx('ml-auto text-[10px] font-bold uppercase tracking-widest text-yellow-800 underline', statusFilter === 'Pendente' && 'opacity-40 pointer-events-none')}>Ver pendentes</button></div>}
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-5 scrollbar-hide mobile-pb-nav space-y-4 sm:space-y-5"><ChangeHistorySummaryCards totals={totals} /><ChangeHistoryTable entries={filteredEntries} projectMembers={projectMembers} onOpen={setReviewingItem} onDelete={setItemToDelete} canDelete={canDecide} /></div>
      </main>

      <AnimatePresence>
        {isFormOpen && user && <NewChangeRequestModal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditingItem(null); }} projectId={projectId!} currentUser={{ uid: user.uid, name: user.displayName || 'Membro' }} projectMembers={projectMembers} ganttTasks={ganttTasks} kanbanTasks={kanbanTasks} item={editingItem} />}
        {reviewingItem && user && <ReviewChangeModal isOpen onClose={() => setReviewingItem(null)} entry={reviewingItem} currentUser={{ uid: user.uid, name: user.displayName || 'Membro' }} canDecide={canDecide} ganttTasks={ganttTasks} kanbanTasks={kanbanTasks} projectMemberIds={project.members} onEdit={(entry) => { setReviewingItem(null); setEditingItem(entry); setIsFormOpen(true); }} />}
        {itemToDelete && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"><motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl"><div className="p-6"><div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto"><AlertTriangle className="w-6 h-6 text-red-600" /></div><h3 className="text-lg font-bold text-center text-gray-900 mb-2">Excluir Registro</h3><p className="text-gray-500 text-center text-sm mb-6">Remover <strong>{itemToDelete.title}</strong> do Change Log?</p><div className="flex gap-3"><button onClick={() => setItemToDelete(null)} className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg">Cancelar</button><button onClick={handleDeleteItem} className="flex-1 px-4 py-3 bg-red-600 text-white font-bold uppercase tracking-widest text-xs rounded-lg">Excluir</button></div></div></motion.div></div>}
      </AnimatePresence>
    </div>
  );
}
