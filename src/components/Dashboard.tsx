import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, Plus, X, Users, UserPlus, Trash2, AlertTriangle } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError, withTimeout } from '../utils/firestoreWrite';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import UserProfileModal from './UserProfileModal';
import { motion, AnimatePresence } from 'motion/react';
import { Project } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinShortId, setJoinShortId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Estados para Sair do Projeto
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [projectToLeave, setProjectToLeave] = useState<Project | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  // Estados para Excluir Projeto
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Mobile profile modal
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projects'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData: Project[] = [];
      snapshot.forEach((doc) => {
        projectsData.push({ id: doc.id, ...doc.data() } as Project);
      });
      setProjects(projectsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.READ, 'projects');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;

    setIsCreating(true);
    try {
      const now = serverTimestamp();
      const generatedShortId = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      await commitWrite(addDoc(collection(db, 'projects'), {
        name: newProjectName.trim(),
        description: newProjectDesc.trim() || null,
        photoURL: null,
        ownerId: user.uid,
        shortId: generatedShortId,
        members: [user.uid],
        createdAt: now,
        updatedAt: now,
      }), { label: 'o projeto' });

      setIsModalOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
    } catch (error) {
      console.error("Erro na criação do projeto:", error);
      logFirestoreError(error, OperationType.CREATE, 'projects');
      alert(friendlyWriteError(error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinShortId.trim() || !user) return;

    setIsJoining(true);
    setJoinError('');

    try {
      const q = query(
        collection(db, 'projects'),
        where('shortId', '==', joinShortId.trim().toUpperCase())
      );
      const querySnapshot = await withTimeout(getDocs(q));

      if (querySnapshot.empty) {
        setJoinError('Projeto não encontrado. Verifique se o código está correto.');
        setIsJoining(false);
        return;
      }

      const projectDoc = querySnapshot.docs[0];
      const projectData = projectDoc.data() as Project;

      if (projectData.members.includes(user.uid)) {
        setJoinError('Você já é membro deste projeto!');
        setIsJoining(false);
        return;
      }

      const projectRef = doc(db, 'projects', projectDoc.id);
      await commitWrite(updateDoc(projectRef, {
        members: [...projectData.members, user.uid],
        updatedAt: serverTimestamp()
      }), { label: 'o ingresso no projeto' });

      setIsJoinModalOpen(false);
      setJoinShortId('');
    } catch (error) {
      console.error("Erro ao ingressar no projeto:", error);
      setJoinError('Falha ao ingressar. Verifique o código e tente novamente.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveProject = async () => {
    if (!projectToLeave || !user) return;
    setIsLeaving(true);
    try {
      const projectRef = doc(db, 'projects', projectToLeave.id);
      const updatedMembers = projectToLeave.members.filter(m => m !== user.uid);
      
      await commitWrite(updateDoc(projectRef, {
        members: updatedMembers,
        updatedAt: serverTimestamp()
      }), { label: 'a saída do projeto' });

      setIsLeaveModalOpen(false);
      setProjectToLeave(null);
    } catch (error) {
      console.error("Erro ao sair do projeto:", error);
      logFirestoreError(error, OperationType.UPDATE, `projects/${projectToLeave.id}`);
      alert(friendlyWriteError(error));
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete || deleteConfirmId !== projectToDelete.shortId) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      const boardsQ = query(collection(db, 'boards'), where('projectId', '==', projectToDelete.id));
      const boardsSnap = await withTimeout(getDocs(boardsQ));
      boardsSnap.forEach((boardDoc) => {
        batch.delete(boardDoc.ref);
      });

      const tasksQ = query(collection(db, 'tasks'), where('projectId', '==', projectToDelete.id));
      const tasksSnap = await withTimeout(getDocs(tasksQ));
      tasksSnap.forEach((taskDoc) => {
        batch.delete(taskDoc.ref);
      });

      batch.delete(doc(db, 'projects', projectToDelete.id));

      await commitWrite(batch.commit(), { label: 'a exclusão do projeto' });

      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      setDeleteConfirmId('');
    } catch (error) {
      console.error("Erro ao deletar projeto e dependências:", error);
      logFirestoreError(error, OperationType.DELETE, `projects/${projectToDelete.id}`);
      alert(friendlyWriteError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto mobile-pb-nav mt-6 sm:mt-0">
        <div className="max-w-6xl mx-auto">
          {/* Header — stacks on mobile */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-gray-900">Meus Projetos</h2>
            
            <div className="flex gap-2 sm:gap-4">
              <button 
                onClick={() => setIsJoinModalOpen(true)}
                className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 sm:px-5 py-2.5 flex items-center gap-2 transition-colors font-bold uppercase tracking-wider rounded-none text-xs sm:text-sm flex-1 sm:flex-none justify-center"
              >
                <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                Ingressar
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-[#ff7f00] hover:bg-orange-600 text-white px-3 sm:px-5 py-2.5 flex items-center gap-2 transition-colors font-bold uppercase tracking-wider rounded-none text-xs sm:text-sm flex-1 sm:flex-none justify-center"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Novo Projeto</span>
                <span className="sm:hidden">Novo</span>
              </button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="bg-white border border-gray-200 p-12 text-center rounded-xl shadow-sm">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-50 border border-gray-200 mb-6 rounded-2xl">
                <LayoutDashboard className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold mb-2 uppercase text-gray-900">Nenhum projeto ainda</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Crie seu primeiro projeto ou ingresse na equipe com um código.
              </p>
              <div className="flex justify-center gap-4">
                <button 
                  onClick={() => setIsJoinModalOpen(true)}
                  className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 px-6 py-3 font-bold uppercase tracking-wider transition-colors rounded-none"
                >
                  Ingressar
                </button>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="bg-[#ff7f00] text-white hover:bg-orange-600 px-6 py-3 font-bold uppercase tracking-wider transition-colors rounded-none"
                >
                  Criar Primeiro Projeto
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div key={project.id} className="relative group block">
                  <Link 
                    to={`/project/${project.id}`}
                    className="bg-white border border-gray-200 p-6 hover:border-[#ff7f00] hover:shadow-md transition-all block rounded-xl h-full"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      {/* Ícone ou Capa do Projeto configurada */}
                      <div className="w-12 h-12 bg-gray-50 flex items-center justify-center border border-gray-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors rounded-lg overflow-hidden shrink-0">
                        {project.photoURL ? (
                          <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">🏎️</span>
                        )}
                      </div>
                      {/* Contador de Membros */}
                      <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-100">
                        <Users className="w-3 h-3" />
                        {project.members?.length || 0}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold mb-2 group-hover:text-[#ff7f00] transition-colors uppercase text-gray-900 pr-10">
                      {project.name} - #{project.shortId || '---'}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {project.description || 'Sem descrição.'}
                    </p>
                  </Link>

                  {/* Botões de Ação Overlay */}
                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 flex flex-col gap-2">
                    {project.ownerId === user?.uid ? (
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setProjectToDelete(project); setIsDeleteModalOpen(true); }}
                        className="p-1.5 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 border border-red-100 shadow-sm rounded-md transition-all"
                        title="Excluir Projeto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setProjectToLeave(project); setIsLeaveModalOpen(true); }}
                        className="p-1.5 bg-white text-orange-500 hover:bg-orange-50 hover:text-[#ff7f00] border border-orange-100 shadow-sm rounded-md transition-all"
                        title="Sair do Projeto"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* --- Modais Existentes --- */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-gray-200 w-full max-w-md overflow-hidden shadow-xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold uppercase text-gray-900">Novo Projeto</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 uppercase tracking-wider">Nome da Equipe / Projeto *</label>
                  <input 
                    type="text" required value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] transition-all rounded-md"
                    placeholder="Ex: STEM Racing 2026"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 uppercase tracking-wider">Descrição</label>
                  <textarea 
                    value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] transition-all resize-none h-24 rounded-md"
                    placeholder="Objetivos da temporada, membros..."
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isCreating || !newProjectName.trim()} className="flex-1 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    {isCreating ? 'Criando...' : 'Criar Projeto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
             <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-gray-200 w-full max-w-md overflow-hidden shadow-xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold uppercase text-gray-900">Ingressar no Projeto</h3>
                <button onClick={() => { setIsJoinModalOpen(false); setJoinError(''); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleJoinProject} className="p-6 space-y-4">
                {joinError && (
                  <div className="bg-red-50 text-red-600 border border-red-200 p-3 text-sm rounded-md font-medium text-center">
                    {joinError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 uppercase tracking-wider">Código de 8 Caracteres *</label>
                  <input 
                    type="text" required value={joinShortId} onChange={(e) => setJoinShortId(e.target.value.toUpperCase())}
                    maxLength={8}
                    className="w-full bg-white border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold tracking-[0.2em] uppercase transition-all rounded-md"
                    placeholder="Ex: A1B2C3D4"
                  />
                  <p className="text-xs text-gray-500 mt-2">Peça o código de compartilhamento ao líder da sua equipe.</p>
                </div>

                <div className="pt-4 flex gap-1">
                  <button type="button" onClick={() => { setIsJoinModalOpen(false); setJoinError(''); }} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isJoining || joinShortId.trim().length !== 8} className="flex-1 bg-gray-900 hover:bg-black disabled:opacity-50 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    {isJoining ? 'Buscando...' : 'Entrar na Equipe'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- NOVOS MODAIS: Sair e Excluir --- */}
      <AnimatePresence>
        {isLeaveModalOpen && projectToLeave && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-gray-200 w-full max-w-md overflow-hidden shadow-xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold uppercase text-gray-900 flex items-center gap-2">
                  <LogOut className="w-5 h-5 text-orange-500" /> Sair do Projeto
                </h3>
                <button onClick={() => { setIsLeaveModalOpen(false); setProjectToLeave(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-600">
                  Tem certeza que deseja sair de <strong className="text-gray-900 uppercase">{projectToLeave.name}</strong>?
                </p>
                <div className="bg-orange-50 text-orange-800 p-3 rounded-md text-sm border border-orange-200">
                  Você perderá o acesso a este Kanban. Se precisar voltar, terá que pedir o código de ingresso ao dono do projeto.
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => { setIsLeaveModalOpen(false); setProjectToLeave(null); }} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleLeaveProject} disabled={isLeaving} className="flex-1 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    {isLeaving ? 'Saindo...' : 'Confirmar Saída'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && projectToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-red-200 w-full max-w-md overflow-hidden shadow-2xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-red-100 bg-red-50">
                <h3 className="text-xl font-bold uppercase text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Excluir Permanentemente
                </h3>
                <button onClick={() => { setIsDeleteModalOpen(false); setProjectToDelete(null); setDeleteConfirmId(''); }} className="text-red-400 hover:text-red-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-700">
                  Atenção! Todas as colunas e tarefas de <strong className="text-gray-900 uppercase">{projectToDelete.name}</strong> serão apagadas do banco de dados para sempre.
                </p>
                
                <div className="bg-gray-50 p-4 border border-gray-200 rounded-md">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Digite o ID <span className="text-red-600 tracking-[0.2em]">{projectToDelete.shortId}</span> para confirmar:
                  </label>
                  <input 
                    type="text" 
                    value={deleteConfirmId} 
                    onChange={(e) => setDeleteConfirmId(e.target.value.toUpperCase())}
                    maxLength={8}
                    className="w-full bg-white border border-red-300 px-4 py-3 text-red-700 focus:outline-none focus:border-red-500 font-bold tracking-[0.2em] uppercase transition-all rounded-md placeholder:text-red-200"
                    placeholder="DIGITE AQUI"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => { setIsDeleteModalOpen(false); setProjectToDelete(null); setDeleteConfirmId(''); }} className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none">
                    Cancelar
                  </button>
                  <button 
                    type="button" 
                    onClick={handleDeleteProject} 
                    disabled={isDeleting || deleteConfirmId !== projectToDelete.shortId} 
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none"
                  >
                    {isDeleting ? 'Excluindo...' : 'Apagar Projeto'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      {/* Profile modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}