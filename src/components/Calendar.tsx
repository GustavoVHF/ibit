import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, documentId } from 'firebase/firestore';
import { Task, Project, UserProfile } from '../types';
import { 
  ChevronLeft, 
  ChevronRight,
  User as UserIcon
} from 'lucide-react';
import clsx from 'clsx';
import { AnimatePresence } from 'motion/react';
import ProjectSettingsModal from './ProjectSettingsModal';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/LanguageContext';
import { getMessages } from '../i18n';

export default function CalendarTool() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docEvents, setDocEvents] = useState<any[]>([]); // To hold events from assetDocuments
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // 1. Fetch Project Data (Scalable)
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      }
    });
  }, [projectId, user]);

  // 2. Fetch Members (Independent effect to avoid nested listener leaks)
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

  // 3. Sync tasks
  useEffect(() => {
    if (!projectId) return;

    const qTasks = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData: Task[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Task;
        // Only show tasks with due dates in the calendar
        if (data.dueDate) {
          tasksData.push({ id: doc.id, ...data });
        }
      });
      setTasks(tasksData);
      setLoading(false);
    });

    return () => unsubTasks();
  }, [projectId]);

  // 4. Sync document events (from assetDocuments)
  useEffect(() => {
    if (!projectId) return;

    const qDocs = query(collection(db, 'assetDocuments'), where('projectId', '==', projectId));
    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      const eventsData: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.syncEvents && Array.isArray(data.syncEvents)) {
          data.syncEvents.forEach((event: any, index: number) => {
            if (event.date) {
              eventsData.push({
                id: `doc-${doc.id}-${index}`,
                title: event.title || data.title || getMessages().errors.documentEvent,
                dueDate: new Date(event.date + 'T12:00:00'), // Parse as noon to avoid timezone shift
                color: '#8b5cf6', // A distinct color for document events (e.g. purple)
                isDocEvent: true,
                documentId: doc.id
              });
            }
          });
        }
      });
      setDocEvents(eventsData);
    });

    return () => unsubDocs();
  }, [projectId]);

  // Calendar Helpers
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = t.common.monthsLong;

  const weekDays = t.common.weekdaysShort;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));

  const getTasksForDay = (date: Date) => {
    const allEvents = [...tasks, ...docEvents];
    return allEvents.filter(task => {
      if (!task.dueDate) return false;
      const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      return dueDate.getDate() === date.getDate() &&
             dueDate.getMonth() === date.getMonth() &&
             dueDate.getFullYear() === date.getFullYear();
    });
  };

  const handleTaskClick = (taskId: string, isDocEvent?: boolean) => {
    if (isDocEvent) {
      navigate(`/project/${projectId}/assets`);
    } else {
      navigate(`/project/${projectId}/kanban?taskId=${taskId}`);
    }
  };

  const today = new Date();
  const isViewingCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8f9fa] overflow-hidden">
      <Sidebar 
        projectId={projectId} 
        projectName={project?.name} 
        onOpenSettings={user?.uid === project?.ownerId ? () => setIsSettingsOpen(true) : undefined} 
      />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project?.name}
        onOpenSettings={user?.uid === project?.ownerId ? () => setIsSettingsOpen(true) : undefined}
      />
      
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <MobileHeader
          projectName={project?.name}
          projectPhotoURL={project?.photoURL || undefined}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        {/* Desktop header */}
        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project?.photoURL ? <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" /> : <span className="text-xl">🏎️</span>}
            </div>
            <div><h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900">{project?.name || t.common.loading} {project?.shortId && `- #${project.shortId}`}</h2></div>
            <div className="flex items-center ml-4">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member?.name}>
                    {member?.photoURL ? <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 uppercase">{member?.name?.charAt(0) || '?'}</div>}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">{project?.members.length || 0} {t.common.membersTitle(project?.members.length || 0)}</span>
            </div>
          </div>
        </header>

        <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2 sm:gap-6">
             <div className="flex items-center gap-2 sm:gap-4">
                <h2 className="text-sm sm:text-lg font-bold text-gray-900 w-32 sm:w-48 text-center uppercase tracking-widest">{monthNames[month]} {year}</h2>
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-all active:scale-95"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                   <button onClick={goToToday} className={clsx("px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all active:scale-95 rounded-lg border", isViewingCurrentMonth ? "bg-[#ff7f00] text-white border-[#ff7f00] shadow-md shadow-orange-100" : "bg-white text-gray-400 border-dashed border-gray-300 hover:border-[#ff7f00] hover:text-[#ff7f00]")}>{t.common.today}</button>
                  <button onClick={nextMonth} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-all active:scale-95"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                </div>
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 sm:p-6 flex flex-col mobile-pb-nav">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
              {weekDays.map(day => (<div key={day} className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{day}</div>))}
            </div>
            <div className="grid grid-cols-7 flex-1">
              {days.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} className="border-r border-b border-gray-50 bg-gray-50/20"></div>;
                const isToday = today.toDateString() === date.toDateString();
                const dayTasks = getTasksForDay(date);
                return (
                  <div key={date.toString()} className={clsx("border-r border-b border-gray-100 p-1 sm:p-2 min-h-[60px] sm:min-h-[120px] transition-all relative group overflow-hidden", isToday ? "bg-orange-50/20" : "hover:bg-gray-50/50")}>
                    <div className="flex justify-between items-start mb-2 relative z-10"><span className={clsx("text-xs font-semibold w-7 h-7 flex items-center justify-center rounded-lg transition-all", isToday ? "bg-[#ff7f00] text-white" : "text-gray-400 group-hover:text-gray-900")}>{date.getDate()}</span>{date.getDate() === 1 && (<span className="text-[10px] font-bold text-[#ff7f00] uppercase tracking-wider">{monthNames[date.getMonth()].substring(0, 3)}</span>)}</div>
                    <div className="space-y-1.5 relative z-10 max-h-[100px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                      {dayTasks.map(task => { const hasColor = task.color && task.color !== 'transparent'; const displayColor = hasColor ? task.color : '#9ca3af'; return (
                        <div key={task.id} title={task.title} onClick={() => handleTaskClick(task.id, task.isDocEvent)} className="px-2 py-1.5 rounded-lg text-[10px] font-medium tracking-wide truncate cursor-pointer transition-all hover:translate-x-1 border border-transparent hover:border-black/5 flex items-center gap-2 group/task shadow-sm" style={{ backgroundColor: `${displayColor}15`, color: hasColor ? displayColor : '#4b5563', borderLeft: `3px solid ${displayColor}`, filter: 'brightness(0.98)' }}><span className="truncate flex-1">{task.title}</span>
                          {task.isDocEvent && <span className="text-[8px] bg-[#8b5cf6] text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider font-bold shrink-0">DOC</span>}
                          {!task.isDocEvent && task.assignedTo && (<div className="flex -space-x-1.5 ml-auto shrink-0">{(Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).slice(0, 3).map((uid, idx) => { const member = projectMembers.find(m => m.uid === uid); return (<div key={uid} className="w-4 h-4 rounded-full border border-white shadow-sm overflow-hidden bg-white shrink-0" title={member?.name || t.common.member}>{member?.photoURL ? (<img src={member.photoURL} alt="Assignee" className="w-full h-full object-cover" />) : (<div className="w-full h-full bg-[#ff7f00] flex items-center justify-center text-white text-[7px] font-bold uppercase">{member?.name?.charAt(0) || <UserIcon className="w-2 h-2" />}</div>)}</div>); })}{(Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).length > 3 && (<div className="w-4 h-4 rounded-full border border-white bg-gray-200 flex items-center justify-center text-[6px] font-bold text-gray-600 shrink-0">+{(Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).length - 3}</div>)}</div>)}
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {project && isSettingsOpen && (
        <ProjectSettingsModal project={project} onClose={() => setIsSettingsOpen(false)} />
      )}

      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
