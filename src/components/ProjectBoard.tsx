import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, deleteDoc, documentId, writeBatch } from 'firebase/firestore';
import { logFirestoreError, OperationType } from '../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { logAutomaticChange } from '../utils/changeHistory';
import { Project, Board, Task, UserProfile, ProjectTag } from '../types';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import { Plus, Trash2, Calendar, User as UserIcon, Pencil } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import TaskDetailsModal from './TaskDetailsModal';
import ProjectSettingsModal from './ProjectSettingsModal';
import { useI18n } from '../i18n/LanguageContext';

export default function ProjectBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { t: tr, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [isAddingTask, setIsAddingTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardName, setEditingBoardName] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Mobile states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // 1. Fetch Project Data (Scalable)
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Project;
        if (!data.members.includes(user.uid)) { navigate('/dashboard'); return; }
        setProject({ id: docSnap.id, ...data });
      } else {
        navigate('/dashboard');
      }
    });
  }, [projectId, user, navigate]);

  // 2. Fetch Members (Independent to avoid listener leaks)
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

  // 3. Fetch Boards and Tasks
  useEffect(() => {
    if (!projectId) return;

    const qBoards = query(collection(db, 'boards'), where('projectId', '==', projectId));
    const unsubBoards = onSnapshot(qBoards, (snapshot) => {
      const boardsData: Board[] = [];
      snapshot.forEach((doc) => {
        boardsData.push({ id: doc.id, ...doc.data() } as Board);
      });
      setBoards(boardsData.sort((a, b) => (a.order || 0) - (b.order || 0)));
    });

    const qTasks = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData: Task[] = [];
      snapshot.forEach((doc) => {
        tasksData.push({ id: doc.id, ...doc.data() } as Task);
      });
      setTasks(tasksData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      setLoading(false);
    });

    const qTags = query(collection(db, 'projectTags'), where('projectId', '==', projectId));
    const unsubTags = onSnapshot(qTags, (snapshot) => {
      const tagsData: ProjectTag[] = [];
      snapshot.forEach((doc) => {
        tagsData.push({ id: doc.id, ...doc.data() } as ProjectTag);
      });
      setProjectTags(tagsData);
    });

    return () => { unsubBoards(); unsubTasks(); unsubTags(); };
  }, [projectId]);

  // Auto-open task if taskId is present in URL
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId && tasks.length > 0) {
      const task = tasks.find(t => t.id === taskId);
      if (task) setSelectedTask(task);
    }
  }, [searchParams, tasks]);

  const handleCloseTaskModal = () => {
    setSelectedTask(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('taskId');
    setSearchParams(newParams);
  };

  const handleAddBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim() || !projectId) return;
    try {
      await commitWrite(addDoc(collection(db, 'boards'), {
        projectId,
        name: newBoardName.trim(),
        order: boards.length,
        ownerId: user?.uid,
        createdAt: serverTimestamp(),
      }), { label: 'a coluna' });
      setNewBoardName('');
      setIsAddingBoard(false);
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'boards');
      alert(friendlyWriteError(error));
    }
  };

  const handleUpdateBoardName = async (boardId: string) => {
    if (!editingBoardName.trim()) {
      setEditingBoardId(null);
      setEditingBoardName('');
      return;
    }
    try {
      await commitWrite(updateDoc(doc(db, 'boards', boardId), {
        name: editingBoardName.trim(),
        updatedAt: serverTimestamp()
      }), { label: 'o nome da coluna' });
      setEditingBoardId(null);
      setEditingBoardName('');
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, `boards/${boardId}`);
      alert(friendlyWriteError(error));
    }
  };

  const handleAddTask = async (e: React.FormEvent, boardId: string) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !projectId || !user) return;
    const boardTasks = tasks.filter(t => t.boardId === boardId);
    try {
      await commitWrite(addDoc(collection(db, 'tasks'), {
        projectId,
        boardId,
        title: newTaskTitle.trim(),
        order: boardTasks.length,
        createdAt: serverTimestamp(),
        ownerId: user.uid,
      }), { label: 'a tarefa' });
      setNewTaskTitle('');
      setIsAddingTask(null);
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, 'tasks');
      alert(friendlyWriteError(error));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await commitWrite(deleteDoc(doc(db, 'tasks', taskId)), { label: 'a exclusão da tarefa' });
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
      alert(friendlyWriteError(error));
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      const tasksToDelete = tasks.filter(t => t.boardId === boardId);
      await commitWrite(Promise.all([
        deleteDoc(doc(db, 'boards', boardId)),
        ...tasksToDelete.map(task => deleteDoc(doc(db, 'tasks', task.id))),
      ]), { label: 'a exclusão da coluna' });
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, `boards/${boardId}`);
      alert(friendlyWriteError(error));
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const batch = writeBatch(db);
    if (type === 'board') {
      const newBoards = [...boards];
      const [removed] = newBoards.splice(source.index, 1);
      newBoards.splice(destination.index, 0, removed);
      setBoards(newBoards);
      newBoards.forEach((board, index) => {
        batch.update(doc(db, 'boards', board.id), { order: index });
      });
      try {
        await commitWrite(batch.commit(), { label: 'a ordem das colunas' });
      } catch (error) {
        logFirestoreError(error, OperationType.UPDATE, 'boards-order');
        alert(friendlyWriteError(error));
      }
      return;
    }
    const sourceBoardId = source.droppableId;
    const destBoardId = destination.droppableId;
    const sourceTasks = tasks.filter(t => t.boardId === sourceBoardId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const destTasks = sourceBoardId === destBoardId ? sourceTasks : tasks.filter(t => t.boardId === destBoardId).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (sourceBoardId === destBoardId) {
      const newTasks = [...sourceTasks];
      const [removed] = newTasks.splice(source.index, 1);
      newTasks.splice(destination.index, 0, removed);
      newTasks.forEach((task, index) => { batch.update(doc(db, 'tasks', task.id), { order: index }); });
    } else {
      const taskToMove = sourceTasks[source.index];
      const newSourceTasks = [...sourceTasks];
      newSourceTasks.splice(source.index, 1);
      const newDestTasks = [...destTasks];
      newDestTasks.splice(destination.index, 0, { ...taskToMove, boardId: destBoardId });
      batch.update(doc(db, 'tasks', taskToMove.id), { boardId: destBoardId, order: destination.index, updatedAt: serverTimestamp() });
      newSourceTasks.forEach((task, index) => { batch.update(doc(db, 'tasks', task.id), { order: index }); });
      newDestTasks.forEach((task, index) => { if (task.id !== taskToMove.id) { batch.update(doc(db, 'tasks', task.id), { order: index }); } });
    }
    try {
      await commitWrite(batch.commit(), { label: 'a movimentação da tarefa' });

      // Mover card entre colunas é troca de status: registra no histórico
      if (sourceBoardId !== destBoardId) {
        const movedTask = sourceTasks[source.index];
        const fromName = boards.find(b => b.id === sourceBoardId)?.name || 'coluna anterior';
        const toName = boards.find(b => b.id === destBoardId)?.name || 'nova coluna';
        await logAutomaticChange({
          projectId,
          source: 'Kanban',
          title: `Tarefa "${movedTask?.title || 'sem título'}" mudou de status`,
          description: `Movida de "${fromName}" para "${toName}"`,
          actorUid: user?.uid,
          actorName: user?.displayName || user?.email || undefined,
        });
      }
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, 'tasks-movement');
      alert(friendlyWriteError(error));
    }
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent animate-spin rounded-full"></div>
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isOwner = project.ownerId === user?.uid;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
      <Sidebar projectId={projectId} projectName={project.name} onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined} />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project.name}
        onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <MobileHeader
          projectName={project.name}
          projectPhotoURL={project.photoURL || undefined}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        {/* Desktop header — hidden on mobile */}
        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project.photoURL ? <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" /> : <span className="text-xl">🏎️</span>}
            </div>
            <div><h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900">{project.name} - #{project.shortId || '---'}</h2></div>
            <div className="flex items-center ml-4">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member?.name}>
                    {member?.photoURL ? <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">{member?.name?.charAt(0).toUpperCase()}</div>}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">{project.members.length} {tr.common.membersCount(project.members.length)}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-6 mobile-pb-nav">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="all-boards" direction="horizontal" type="board">
              {(provided) => (
                <div className="flex gap-3 sm:gap-6 h-full items-start scroll-snap-x lg:!scroll-snap-type-none" {...provided.droppableProps} ref={provided.innerRef}>
                  {boards.map((board, index) => {
                    const boardTasks = tasks.filter(t => t.boardId === board.id).sort((a, b) => a.order - b.order);
                    return (
                      <Draggable key={board.id} draggableId={board.id} index={index}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className="bg-gray-50 border border-gray-200 w-[85vw] sm:w-80 shrink-0 max-h-full flex flex-col rounded-xl scroll-snap-center">
                            <div {...provided.dragHandleProps} className="p-4 border-b border-gray-200 flex justify-between items-center group bg-white rounded-t-xl">
                              {editingBoardId === board.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingBoardName}
                                  onChange={(e) => setEditingBoardName(e.target.value)}
                                  onBlur={() => handleUpdateBoardName(board.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateBoardName(board.id);
                                    if (e.key === 'Escape') { setEditingBoardId(null); setEditingBoardName(''); }
                                  }}
                                  className="font-bold text-gray-900 tracking-wider text-sm bg-gray-50 border border-gray-300 px-2 py-1 rounded-md focus:outline-none focus:border-[#ff7f00] w-full mr-2"
                                />
                              ) : (
                                <h3 
                                  className="font-bold text-gray-900 tracking-wider text-sm cursor-pointer hover:text-[#ff7f00]"
                                  onClick={() => { setEditingBoardId(board.id); setEditingBoardName(board.name); }}
                                >
                                  {board.name}
                                </h3>
                              )}
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => { setEditingBoardId(board.id); setEditingBoardName(board.name); }}
                                  className="text-gray-400 hover:text-[#ff7f00] opacity-0 group-hover:opacity-100 transition-all p-1"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteBoard(board.id); }} 
                                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <Droppable droppableId={board.id} type="task">
                              {(provided, snapshot) => (
                                <div className={clsx("flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] transition-all relative rounded-lg border-2", snapshot.isDraggingOver ? "bg-orange-50/40 border-dashed border-[#ff7f00] shadow-inner" : "bg-transparent border-transparent")} {...provided.droppableProps} ref={provided.innerRef}>
                                  {boardTasks.map((task, index) => (
                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                      {(provided, snapshot) => (
                                        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => setSelectedTask(task)} className={clsx("bg-white border-l-4 border-y border-r border-gray-200 p-4 group cursor-pointer rounded-lg transition-all", snapshot.isDragging ? "shadow-2xl ring-2 ring-[#ff7f00] rotate-[2deg] scale-[1.05] z-50 opacity-100" : "hover:border-[#ff7f00] hover:shadow-md")} style={{ ...provided.draggableProps.style, borderLeftColor: task.color && task.color !== 'transparent' ? task.color : '#e5e7eb' }}>
                                          <div className="flex justify-between items-start mb-2"><h4 className="font-medium text-sm leading-snug text-gray-900">{task.title}</h4><button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2"><Trash2 className="w-3.5 h-3.5" /></button></div>
                                          {task.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>}
                                          {task.tags && task.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-3">
                                              {task.tags.map(tagId => {
                                                const tagInfo = projectTags.find(t => t.id === tagId);
                                                return (
                                                  <span 
                                                    key={tagId} 
                                                    className={clsx(
                                                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded-md transition-all shadow-sm",
                                                      (!tagInfo || !tagInfo.color || !tagInfo.color.startsWith('#')) ? (tagInfo?.color || 'bg-gray-50 text-gray-600 border-gray-200') : 'text-white border-transparent'
                                                    )}
                                                    style={tagInfo?.color?.startsWith('#') ? { backgroundColor: tagInfo.color } : {}}
                                                  >
                                                    {tagInfo ? tagInfo.label : 'Tag'}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          )}
                                          <div className="flex items-center justify-between mt-3"><div className="flex items-center gap-1 text-xs text-gray-500 uppercase tracking-wider"><Calendar className="w-3 h-3" /><span>{task.dueDate?.toDate ? task.dueDate.toDate().toLocaleDateString(locale) : (task.createdAt?.toDate ? task.createdAt.toDate().toLocaleDateString(locale) : tr.kanban.newBadge)}</span></div>{task.assignedTo && (<div className="flex -space-x-2">{(Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).map((uid, idx) => { const member = projectMembers.find(m => m.uid === uid); return (<div key={uid} className="w-6 h-6 rounded-full border-2 border-white shadow-sm overflow-hidden bg-white" title={member?.name || tr.common.member} style={{ zIndex: 10 - idx }}>{member?.photoURL ? (<img src={member.photoURL} alt="Assignee" className="w-full h-full object-cover" />) : (<div className="w-full h-full bg-[#ff7f00] flex items-center justify-center text-white text-[10px] font-bold uppercase">{member?.name?.charAt(0) || <UserIcon className="w-3 h-3" />}</div>)}</div>); })}</div>)}</div>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {provided.placeholder}
                                  {snapshot.isDraggingOver && boardTasks.length === 0 && (<div className="absolute inset-0 m-3 border-2 border-dashed border-[#ff7f00]/50 rounded-lg flex items-center justify-center bg-orange-50/10 pointer-events-none"><span className="text-[10px] font-bold text-[#ff7f00] uppercase tracking-widest opacity-60">{tr.kanban.dropHere}</span></div>)}
                                </div>
                              )}
                            </Droppable>
                            <div className="p-3 border-t border-gray-200 bg-white rounded-b-xl">{isAddingTask === board.id ? (<form onSubmit={(e) => handleAddTask(e, board.id)} className="space-y-2"><input type="text" autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder={tr.kanban.taskPlaceholder} className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] placeholder:text-gray-400 rounded-md" /><div className="flex gap-2"><button type="submit" disabled={!newTaskTitle.trim()} className="bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none">{tr.common.add}</button><button type="button" onClick={() => { setIsAddingTask(null); setNewTaskTitle(''); }} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none">{tr.common.cancel}</button></div></form>) : (<button onClick={() => setIsAddingTask(board.id)} className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-[#ff7f00] hover:bg-orange-50 py-2 transition-colors text-xs font-bold uppercase tracking-wider rounded-md border border-transparent hover:border-orange-200"><Plus className="w-4 h-4" />{tr.kanban.newTask}</button>)}</div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  <div className="shrink-0 w-80">{isAddingBoard ? (<form onSubmit={handleAddBoard} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm"><input type="text" autoFocus value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder={tr.kanban.columnNamePlaceholder} className="w-full bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] mb-3 placeholder:text-gray-400 rounded-md" /><div className="flex gap-2"><button type="submit" disabled={!newBoardName.trim()} className="bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none">{tr.kanban.createColumn}</button><button type="button" onClick={() => { setIsAddingBoard(false); setNewBoardName(''); }} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none">{tr.common.cancel}</button></div></form>) : (<button onClick={() => setIsAddingBoard(true)} className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-[#ff7f00] hover:text-[#ff7f00] text-gray-400 transition-all font-bold uppercase tracking-widest text-xs flex items-center gap-2 bg-white/50"><Plus className="w-4 h-4" />{tr.kanban.addColumn}</button>)}</div>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </main>
      </div>

      <AnimatePresence>
        {selectedTask && (
          <div key={selectedTask.id}>
            <TaskDetailsModal task={selectedTask} onClose={handleCloseTaskModal} projectMembers={projectMembers} />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && project && (
          <ProjectSettingsModal project={project} onClose={() => setIsSettingsOpen(false)} />
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}