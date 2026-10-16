import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { LogOut, LayoutDashboard, ArrowLeft, Kanban, Settings, Image, Calendar, Archive, Folder, User as UserIcon, Users, Tag, Grid3X3, BarChart, ChevronLeft, ChevronRight, DollarSign, Briefcase, AlertTriangle, Target, ClipboardList, History } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSidebar } from '../contexts/SidebarContext';
import UserProfileModal from './UserProfileModal';
import logoIbit from '../media/ibitlogo.svg';
import { Project } from '../types';
import { canManageMembers } from '../utils/roleHelpers';

interface SidebarProps {
  projectId?: string;
  projectName?: string;
  onOpenSettings?: () => void;
}

export default function Sidebar({ projectId, projectName, onOpenSettings }: SidebarProps) {
  const { user } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  // Fetch project data to check permissions
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      }
    });
  }, [projectId, user]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const isProjectView = !!projectId;
  const showMembersLink = project && user && canManageMembers(project, user.uid);

  return (
    <aside 
      className={`hidden lg:flex bg-white border-r border-gray-200 flex-col h-screen shrink-0 transition-all duration-300 ease-in-out relative ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-12 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:border-[#ff7f00] hover:text-[#ff7f00] transition-all z-50 text-gray-400"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`p-6 border-b border-gray-200 flex flex-col items-center overflow-hidden transition-all duration-300 ${isCollapsed ? 'p-4' : 'p-6'}`}>
        <div className={`flex justify-center mb-2 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-40'}`}>
          <img
            src={logoIbit}
            alt="Logo Ibit"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        {!isCollapsed && (
          <h1 className="text-[10px] font-black tracking-[0.1em] font-sans text-gray-400 text-center leading-tight whitespace-nowrap">
            <span className="text-[#ff7f00]">BY CARNELIAN ESCUDERIA</span>
          </h1>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <nav className="space-y-3">
          {!isProjectView ? (
            <Link
              to="/dashboard"
              className={`flex items-center gap-3 px-4 py-3.5 font-bold uppercase tracking-wider text-sm rounded-lg transition-colors ${location.pathname === '/dashboard'
                ? 'bg-orange-50 text-[#ff7f00]'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? "PROJETOS" : ""}
            >
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>PROJETOS</span>}
            </Link>
          ) : (
            <>
              <Link
                to="/dashboard"
                className={`flex items-center gap-3 px-4 py-3.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 font-bold tracking-wider text-sm rounded-lg transition-colors mb-2 ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "VOLTAR" : ""}
              >
                <ArrowLeft className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>VOLTAR</span>}
              </Link>

              <Link
                to={`/project/${projectId}`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "DASHBOARD" : ""}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>DASHBOARD</span>}
              </Link>

              <div className={`h-px bg-gray-200 mx-4 transition-all duration-300 ${isCollapsed ? 'my-0.5' : 'my-5'}`} />
 
              {!isCollapsed && (
                <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                  FERRAMENTAS
                </div>
              )}
 
              <Link
                to={`/project/${projectId}/kanban`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/kanban`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "KANBAN" : ""}
              >
                <Kanban className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>KANBAN</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/quadro`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/quadro`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "QUADRO" : ""}
              >
                <Image className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>QUADRO</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/calendar`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/calendar`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "CALENDÁRIO" : ""}
              >
                <Calendar className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>CALENDÁRIO</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/inventory`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/inventory`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "INVENTÁRIO" : ""}
              >
                <Archive className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>INVENTÁRIO</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/assets`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/assets`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "ATIVOS" : ""}
              >
                <Folder className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>ATIVOS</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/raci`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/raci`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "MATRIZ RACI" : ""}
              >
                <Grid3X3 className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>MATRIZ RACI</span>}
              </Link>

              <Link
                to={`/project/${projectId}/stakeholders`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/stakeholders`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "STAKEHOLDERS" : ""}
              >
                <Briefcase className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>STAKEHOLDERS</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/risks`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/risks`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "GESTÃO DE RISCOS" : ""}
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>GESTÃO DE RISCOS</span>}
              </Link>

              <Link
                to={`/project/${projectId}/kpis`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/kpis`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "KPIS" : ""}
              >
                <Target className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>KPIS</span>}
              </Link>

              <Link
                to={`/project/${projectId}/status-reports`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/status-reports`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "STATUS REPORTS" : ""}
              >
                <ClipboardList className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>STATUS REPORTS</span>}
              </Link>

              <Link
                to={`/project/${projectId}/gestao-de-mudancas`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/gestao-de-mudancas`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "GESTÃO DE MUDANÇAS" : ""}
              >
                <History className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>GESTÃO DE MUDANÇAS</span>}
              </Link>
 
              <Link
                to={`/project/${projectId}/gantt`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/gantt`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "GANTT" : ""}
              >
                <BarChart className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>GANTT</span>}
              </Link>

              <Link
                to={`/project/${projectId}/finance`}
                className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/finance`
                  ? 'bg-orange-50 text-[#ff7f00]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? "FINANCEIRO" : ""}
              >
                <DollarSign className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>FINANCEIRO</span>}
              </Link>

              {/* Seção Configurações */}
              {(onOpenSettings || showMembersLink) && (
                <>
                  <div className={`h-px bg-gray-200 mx-4 transition-all duration-300 ${isCollapsed ? 'my-0.5' : 'my-5'}`} />
                  {!isCollapsed && (
                    <div className="pt-6 pb-2 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                      CONFIGURAÇÕES
                    </div>
                  )}

                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-gray-500 hover:text-[#ff7f00] hover:bg-orange-50 font-bold tracking-wider text-sm rounded-lg transition-colors text-left ${isCollapsed ? 'justify-center px-0' : ''}`}
                      title={isCollapsed ? "PERSONALIZAR" : ""}
                    >
                      <Settings className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span>PERSONALIZAR</span>}
                    </button>
                  )}

                  {showMembersLink && (
                    <Link
                      to={`/project/${projectId}/membros`}
                      className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/membros`
                        ? 'bg-orange-50 text-[#ff7f00]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                        } ${isCollapsed ? 'justify-center px-0' : ''}`}
                      title={isCollapsed ? "MEMBROS" : ""}
                    >
                      <Users className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span>MEMBROS</span>}
                    </Link>
                  )}

                  {showMembersLink && (
                    <Link
                      to={`/project/${projectId}/tags`}
                      className={`flex items-center gap-3 px-4 py-3.5 font-bold tracking-wider text-sm rounded-lg transition-colors ${location.pathname === `/project/${projectId}/tags`
                        ? 'bg-orange-50 text-[#ff7f00]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                        } ${isCollapsed ? 'justify-center px-0' : ''}`}
                      title={isCollapsed ? "TAGS" : ""}
                    >
                      <Tag className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span>TAGS</span>}
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </nav>
      </div>
 
      <div className={`p-4 border-t border-gray-200 overflow-hidden transition-all duration-300 ${isCollapsed ? 'px-2' : ''}`}>
        <div 
          onClick={() => setIsProfileModalOpen(true)}
          className={`flex items-center gap-3 mb-4 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors group ${isCollapsed ? 'justify-center p-2' : 'px-2 p-2'}`}
          title={isCollapsed ? user?.displayName || "" : ""}
        >
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border border-gray-200 object-cover shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200 text-gray-600 font-bold shrink-0">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
          )}
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold tracking-wider text-gray-900 truncate uppercase group-hover:text-[#ff7f00] transition-colors">{user?.displayName}</span>
              <span className="text-xs text-gray-500 truncate">{user?.email}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-2 px-4 py-3.5 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors rounded-lg font-bold tracking-wider text-sm ${isCollapsed ? 'justify-center' : 'justify-center'}`}
          title={isCollapsed ? "SAIR" : ""}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>SAIR</span>}
        </button>
      </div>

      <AnimatePresence>
        {isProfileModalOpen && (
          <UserProfileModal onClose={() => setIsProfileModalOpen(false)} />
        )}
      </AnimatePresence>
    </aside>
  );
}