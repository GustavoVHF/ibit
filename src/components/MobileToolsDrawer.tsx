import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  X,
  ArrowLeft,
  LayoutDashboard,
  Kanban,
  Image,
  Calendar,
  Archive,
  Folder,
  Grid3X3,
  BarChart,
  DollarSign,
  Settings,
  Users,
  Tag,
  LogOut,
  AlertTriangle,
  Target,
  ClipboardList,
  History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import logoIbit from '../media/ibitlogo.svg';
import { Project } from '../types';
import { canManageMembers } from '../utils/roleHelpers';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface MobileToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  onOpenSettings?: () => void;
}

export default function MobileToolsDrawer({ isOpen, onClose, projectId, projectName, onOpenSettings }: MobileToolsDrawerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const [project, setProject] = React.useState<Project | null>(null);

  React.useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() } as Project);
      }
    });
  }, [projectId, user]);

  const showAdminLinks = project && user && canManageMembers(project, user.uid);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
    onClose();
  };

  const tools = [
    { id: 'kanban', label: 'KANBAN', icon: Kanban, path: `/project/${projectId}/kanban` },
    { id: 'quadro', label: 'QUADRO', icon: Image, path: `/project/${projectId}/quadro` },
    { id: 'calendar', label: 'CALENDÁRIO', icon: Calendar, path: `/project/${projectId}/calendar` },
    { id: 'inventory', label: 'INVENTÁRIO', icon: Archive, path: `/project/${projectId}/inventory` },
    { id: 'assets', label: 'ATIVOS', icon: Folder, path: `/project/${projectId}/assets` },
    { id: 'raci', label: 'MATRIZ RACI', icon: Grid3X3, path: `/project/${projectId}/raci` },
    { id: 'risks', label: 'GESTÃO DE RISCOS', icon: AlertTriangle, path: `/project/${projectId}/risks` },
    { id: 'kpis', label: 'KPIS', icon: Target, path: `/project/${projectId}/kpis` },
    { id: 'status-reports', label: 'STATUS REPORTS', icon: ClipboardList, path: `/project/${projectId}/status-reports` },
    { id: 'gestao-de-mudancas', label: 'GESTÃO DE MUDANÇAS', icon: History, path: `/project/${projectId}/gestao-de-mudancas` },
    { id: 'gantt', label: 'GANTT', icon: BarChart, path: `/project/${projectId}/gantt` },
    { id: 'finance', label: 'FINANCEIRO', icon: DollarSign, path: `/project/${projectId}/finance` },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="lg:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white z-[70] shadow-2xl flex flex-col"
          >
            {/* Logo header */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex flex-col items-start gap-1">
                <img src={logoIbit} alt="Logo IBIT" className="h-8 object-contain" referrerPolicy="no-referrer" />
                <span className="text-[9px] font-black tracking-[0.1em] text-[#ff7f00]">
                  BY CARNELIAN ESCUDERIA
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto p-3">
              <nav className="space-y-1">
                {/* Voltar */}
                <button
                  onClick={() => handleNavigate('/dashboard')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 font-bold tracking-wider text-sm rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 shrink-0" />
                  <span>VOLTAR</span>
                </button>

                {/* Dashboard do projeto */}
                <button
                  onClick={() => handleNavigate(`/project/${projectId}`)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 font-bold tracking-wider text-sm rounded-lg transition-colors',
                    location.pathname === `/project/${projectId}`
                      ? 'bg-orange-50 text-[#ff7f00]'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  <LayoutDashboard className="w-5 h-5 shrink-0" />
                  <span>DASHBOARD</span>
                </button>

                {/* Divider */}
                <div className="h-px bg-gray-200 mx-4 my-3" />

                {/* Section header */}
                <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                  FERRAMENTAS
                </div>

                {/* Tools */}
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = location.pathname === tool.path;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => handleNavigate(tool.path)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 font-bold tracking-wider text-sm rounded-lg transition-colors',
                        isActive
                          ? 'bg-orange-50 text-[#ff7f00]'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{tool.label}</span>
                    </button>
                  );
                })}

                {/* Settings */}
                {(onOpenSettings || showAdminLinks) && (
                  <>
                    <div className="h-px bg-gray-200 mx-4 my-3" />
                    <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                      CONFIGURAÇÕES
                    </div>
                    
                    {onOpenSettings && (
                      <button
                        onClick={() => { onOpenSettings(); onClose(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-[#ff7f00] hover:bg-orange-50 font-bold tracking-wider text-sm rounded-lg transition-colors"
                      >
                        <Settings className="w-5 h-5 shrink-0" />
                        <span>PERSONALIZAR</span>
                      </button>
                    )}

                    {showAdminLinks && (
                      <>
                        <button
                          onClick={() => handleNavigate(`/project/${projectId}/membros`)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 font-bold tracking-wider text-sm rounded-lg transition-colors',
                            location.pathname === `/project/${projectId}/membros`
                              ? 'bg-orange-50 text-[#ff7f00]'
                              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                          )}
                        >
                          <Users className="w-5 h-5 shrink-0" />
                          <span>MEMBROS</span>
                        </button>

                        <button
                          onClick={() => handleNavigate(`/project/${projectId}/tags`)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 font-bold tracking-wider text-sm rounded-lg transition-colors',
                            location.pathname === `/project/${projectId}/tags`
                              ? 'bg-orange-50 text-[#ff7f00]'
                              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                          )}
                        >
                          <Tag className="w-5 h-5 shrink-0" />
                          <span>TAGS</span>
                        </button>
                      </>
                    )}
                  </>
                )}
              </nav>
            </div>

            {/* Footer: user + logout */}
            <div className="p-3 border-t border-gray-200">
              <div className="flex items-center gap-3 px-3 py-2 mb-2">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-9 h-9 rounded-full border border-gray-200 object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200 text-gray-600 font-bold shrink-0 text-sm">
                    {user?.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="text-xs font-bold tracking-wider text-gray-900 truncate uppercase">{user?.displayName}</span>
                  <span className="text-[10px] text-gray-500 truncate">{user?.email}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 p-3 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors rounded-lg font-bold tracking-wider text-sm"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>SAIR</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
