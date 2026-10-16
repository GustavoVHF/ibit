/**
 * Landing do projeto: visão geral com métricas resumidas.
 * Tarefas a fazer: heurística Kanban — com 2+ colunas, a última (por order) = feito; com 1 coluna, todas contam como "a fazer".
 * Concluídas (7 dias): tarefas com dueDate nos últimos 7 dias (janela até agora), independentemente da coluna.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, collection, query, where, onSnapshot, documentId } from 'firebase/firestore';
import { Project, Board, Task, UserProfile, Transaction } from '../types';
import { canEditProject } from '../utils/roleHelpers';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import ProjectSettingsModal from './ProjectSettingsModal';
import CountdownModal from './CountdownModal';
import AuditModal from './AuditModal';
import { AnimatePresence } from 'motion/react';
import { CheckCircle2, ListTodo, Calendar, Wallet, Tv, Link as LinkIcon, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

function dueDateToDate(task: Task): Date | null {
  const raw = task.dueDate;
  if (!raw) return null;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (raw instanceof Date) return raw;
  return null;
}

function computeMetrics(boards: Board[], tasks: Task[]) {
  const sorted = [...boards].sort((a, b) => (a.order || 0) - (b.order || 0));
  let todoCount = 0;
  if (sorted.length === 0) todoCount = 0;
  else if (sorted.length === 1) todoCount = tasks.length;
  else {
    const doneBoardId = sorted[sorted.length - 1].id;
    for (const t of tasks) {
      if (t.boardId !== doneBoardId) todoCount += 1;
    }
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  let completedLast7Days = 0;
  for (const t of tasks) {
    const d = dueDateToDate(t);
    if (!d) continue;
    const ts = d.getTime();
    if (ts >= sevenDaysAgo && ts <= now) completedLast7Days += 1;
  }
  return { todoCount, completedLast7Days };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const CustomizedFlowLabel = (props: any) => {
  const { x, y, value, fill, position = 'top' } = props;
  if (!value && value !== 0) return null;
  // Format without cents if possible to save space
  const formatted = new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    maximumFractionDigits: 0 
  }).format(value);
  
  return (
    <text 
      x={x} 
      y={position === 'top' ? y - 12 : y + 20} 
      dy={0} 
      fill={fill} 
      fontSize={9} 
      fontWeight="bold" 
      textAnchor="middle" 
      className="drop-shadow-sm"
    >
      {formatted}
    </text>
  );
};

export default function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCountdownModalOpen, setIsCountdownModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isTVMode, setIsTVMode] = useState(false);
  const [showTVExitButton, setShowTVExitButton] = useState(false);
  const [tvExitButtonTimeout, setTvExitButtonTimeout] = useState<NodeJS.Timeout | null>(null);

  // Mobile states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // TV Mode fullscreen handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTVMode(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // TV Mode - Show exit button on mouse move/click
  useEffect(() => {
    if (!isTVMode) return;

    const handleActivity = () => {
      setShowTVExitButton(true);
      if (tvExitButtonTimeout) clearTimeout(tvExitButtonTimeout);
      const timeout = setTimeout(() => setShowTVExitButton(false), 3000);
      setTvExitButtonTimeout(timeout);
    };

    document.addEventListener('mousemove', handleActivity);
    document.addEventListener('click', handleActivity);

    return () => {
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('click', handleActivity);
      if (tvExitButtonTimeout) clearTimeout(tvExitButtonTimeout);
    };
  }, [isTVMode, tvExitButtonTimeout]);

  const toggleTVMode = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Project;
        if (!data.members.includes(user.uid)) {
          navigate('/dashboard');
          return;
        }
        setProject({ id: docSnap.id, ...data });
      } else {
        navigate('/dashboard');
      }
    });
  }, [projectId, user, navigate]);

  useEffect(() => {
    if (!project?.members || project.members.length === 0) return;
    const qMembers = query(
      collection(db, 'users'),
      where(documentId(), 'in', project.members.slice(0, 30))
    );
    return onSnapshot(qMembers, (snapshot) => {
      const membersData: UserProfile[] = [];
      snapshot.forEach((d) => {
        membersData.push({ uid: d.id, ...d.data() } as UserProfile);
      });
      setProjectMembers(membersData);
    });
  }, [project?.members?.join(',')]);

  useEffect(() => {
    if (!projectId) return;
    const qBoards = query(collection(db, 'boards'), where('projectId', '==', projectId));
    const unsubBoards = onSnapshot(qBoards, (snapshot) => {
      const boardsData: Board[] = [];
      snapshot.forEach((d) => {
        boardsData.push({ id: d.id, ...d.data() } as Board);
      });
      setBoards(boardsData.sort((a, b) => (a.order || 0) - (b.order || 0)));
    });

    const qTasks = query(collection(db, 'tasks'), where('projectId', '==', projectId));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData: Task[] = [];
      snapshot.forEach((d) => {
        tasksData.push({ id: d.id, ...d.data() } as Task);
      });
      setTasks(tasksData);
      setLoading(false);
    });

    const qTrans = query(collection(db, 'transactions'), where('projectId', '==', projectId));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const transData: Transaction[] = [];
      snapshot.forEach((d) => {
        transData.push({ id: d.id, ...d.data() } as Transaction);
      });
      setTransactions(transData);
    });

    return () => {
      unsubBoards();
      unsubTasks();
      unsubTrans();
    };
  }, [projectId]);

  const { todoCount, completedLast7Days } = useMemo(
    () => computeMetrics(boards, tasks),
    [boards, tasks]
  );

  // Calculate financial balance
  const balance = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.isExternal) return acc;
      return t.type === 'income' ? acc + t.amount : acc - t.amount;
    }, 0);
  }, [transactions]);

  // Calculate countdown
  const daysUntil = useMemo(() => {
    if (!project?.targetDate) return null;
    const targetTime = project.targetDate.toDate ? project.targetDate.toDate().getTime() : new Date(project.targetDate).getTime();
    const now = Date.now();
    return Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24));
  }, [project?.targetDate]);

  // Calculate chart data for Pie Chart (Despesas por Categoria)
  const chartData = useMemo(() => {
    const expenseCategories: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type === 'expense') {
        const cat = t.category || 'Sem Categoria';
        expenseCategories[cat] = (expenseCategories[cat] || 0) + t.amount;
      }
    });
    return Object.keys(expenseCategories).map(key => ({
      name: key,
      value: expenseCategories[key]
    })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Calculate cash flow data for Line Chart
  const cashFlowData = useMemo(() => {
    const sortedTrans = [...transactions].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date();
      const db = b.date?.toDate ? b.date.toDate() : new Date();
      return da.getTime() - db.getTime();
    });

    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const rawMonths: { name: string; key: string; income: number; expense: number }[] = [];

    sortedTrans.forEach(t => {
      const date = t.date?.toDate ? t.date.toDate() : new Date();
      const m = date.getMonth();
      const y = date.getFullYear();
      const key = `${y}-${m.toString().padStart(2, '0')}`;

      let monthRow = rawMonths.find(r => r.key === key);
      if (!monthRow) {
        monthRow = { name: `${monthNames[m]}/${y.toString().slice(-2)}`, key, income: 0, expense: 0 };
        rawMonths.push(monthRow);
      }
      if (t.type === 'income') monthRow.income += t.amount;
      if (t.type === 'expense') monthRow.expense += t.amount;
    });

    let accIncome = 0;
    let accExpense = 0;
    return rawMonths.map(row => {
      accIncome += row.income;
      accExpense += row.expense;
      return {
        name: row.name,
        Entrada: accIncome,
        Saída: accExpense
      };
    });
  }, [transactions]);

  const CHART_COLORS = ['#ff7f00', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

  const canEdit = project && user ? canEditProject(project, user.uid) : false;

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent animate-spin rounded-full"></div>
      </div>
    );
  }

  const isOwner = project.ownerId === user?.uid;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
      {!isTVMode && (
        <Sidebar
          projectId={projectId}
          projectName={project.name}
          onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined}
        />
      )}

      {/* TV Mode Exit Button */}
      {isTVMode && showTVExitButton && (
        <button
          onClick={toggleTVMode}
          className="fixed top-4 right-4 z-50 px-4 py-2 bg-red-600 text-white font-bold uppercase tracking-wider text-xs rounded-lg hover:bg-red-700 transition-all shadow-xl animate-in fade-in duration-200"
        >
          Sair do Modo TV
        </button>
      )}

      {/* Mobile Drawer (fixed overlay, position doesn't matter) */}
      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project.name}
        onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Mobile Header */}
        {!isTVMode && (
          <MobileHeader
            projectName={project.name}
            projectPhotoURL={project.photoURL || undefined}
            onOpenDrawer={() => setIsDrawerOpen(true)}
          />
        )}

        {/* Desktop header — hidden on mobile */}
        {!isTVMode && (
          <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
                {project.photoURL ? (
                  <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">🏎️</span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900 truncate">
                  {project.name} - #{project.shortId || '---'}
                </h2>
              </div>
              <div className="flex items-center ml-4 shrink-0">
                <div className="flex -space-x-2 mr-3">
                  {projectMembers.map((member) => (
                    <div key={member.uid} className="relative inline-block" title={member?.name}>
                      {member?.photoURL ? (
                        <img
                          src={member.photoURL}
                          alt={member.name}
                          className="w-8 h-8 rounded-full border-2 border-white object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                          {member?.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
                  {project.members.length} {project.members.length === 1 ? 'MEMBRO' : 'MEMBROS'}
                </span>
              </div>
            </div>
          </header>
        )}

        {/* Subheader */}
        {!isTVMode && (
          <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
            <h1 className="text-xl font-bold uppercase tracking-wider text-gray-900">Dashboard</h1>
            <div className="flex gap-3">
              <button
                onClick={toggleTVMode}
                className="px-4 py-2 bg-[#ff7f00] text-white font-bold uppercase tracking-wider text-xs rounded-none hover:bg-orange-600 transition-colors flex items-center gap-2"
              >
                <Tv className="w-4 h-4" />
                Modo TV
              </button>
              <button
                onClick={() => setIsAuditModalOpen(true)}
                disabled={!canEdit}
                className="px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-bold uppercase tracking-wider text-xs rounded-none hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <LinkIcon className="w-4 h-4" />
                Acesso de Auditoria
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto mobile-pb-nav">
          <div className="flex flex-col flex-1 min-h-0 gap-5 sm:gap-6 w-full max-w-[1920px] mx-auto px-4 py-5 sm:px-6 md:px-8 lg:px-10 xl:px-12">
            <div className={clsx("grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 shrink-0", isTVMode && "gap-8 sm:gap-12")}>
              {/* KPI 1: Tarefas a Fazer */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm hover:shadow-md transition-all h-full">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <ListTodo className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7f00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      Tarefas a fazer
                    </p>
                    <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">{todoCount}</p>
                  </div>
                </div>
              </div>

              {/* KPI 2: Concluídas (7 dias) */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm hover:shadow-md transition-all h-full">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7f00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      Concluídas (7 dias)
                    </p>
                    <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">{completedLast7Days}</p>
                  </div>
                </div>
              </div>

              {/* KPI 3: Contagem Regressiva */}
              <div
                onClick={() => !isTVMode && setIsCountdownModalOpen(true)}
                className={clsx(
                  "bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm transition-all h-full",
                  !isTVMode && "cursor-pointer hover:border-[#ff7f00] hover:shadow-md"
                )}
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7f00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      Contagem Regressiva
                    </p>
                    {daysUntil !== null ? (
                      <>
                        <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">
                          {daysUntil} {daysUntil === 1 ? 'Dia' : 'Dias'}
                        </p>
                        {project.targetEventName && (
                          <p className="text-[9px] text-gray-500 mt-0.5 truncate">{project.targetEventName}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-bold text-gray-400">Configurar Evento</p>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI 4: Saldo Atual */}
              <div
                onClick={() => !isTVMode && navigate(`/project/${projectId}/finance`)}
                className={clsx(
                  "bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm transition-all h-full",
                  !isTVMode && "cursor-pointer hover:border-[#ff7f00] hover:shadow-md"
                )}
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className={clsx(
                    "w-11 h-11 sm:w-14 sm:h-14 rounded-xl border flex items-center justify-center shrink-0",
                    balance >= 0 ? "bg-orange-50 border-orange-100" : "bg-red-50 border-red-100"
                  )}>
                    <Wallet className={clsx("w-5 h-5 sm:w-7 sm:h-7", balance >= 0 ? "text-[#ff7f00]" : "text-red-600")} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      Saldo Atual
                    </p>
                    <p className={clsx(
                      "text-2xl sm:text-4xl font-bold tabular-nums leading-none",
                      balance >= 0 ? "text-[#ff7f00]" : "text-red-600"
                    )}>
                      {formatCurrency(balance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:items-stretch flex-1 min-h-0 lg:min-h-[min(60vh,560px)]">
              {/* Pie Chart - Despesas por Categoria */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[220px] lg:min-h-0 lg:h-full flex flex-col">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-indigo-500" />
                  Despesas por Categoria
                </h3>
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center opacity-50 flex-1">
                    <PieChartIcon className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Nenhuma despesa registrada</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 min-h-0">
                    <div className="flex-1 w-full h-[200px] sm:h-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            dataKey="value"
                            isAnimationActive={false}
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="white" strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{payload[0].name}</p>
                                    <p className="text-sm font-bold text-gray-900">{formatCurrency(payload[0].value)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                            isAnimationActive={false}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col w-full sm:w-1/3 p-3 bg-gray-50 rounded-lg border border-gray-100 max-h-72 overflow-y-auto scrollbar-hide text-left shrink-0">
                      {chartData.map((entry, index) => {
                        const totalChartValue = chartData.reduce((acc, curr) => acc + curr.value, 0);
                        const pct = totalChartValue > 0 ? Math.round((entry.value / totalChartValue) * 100) : 0;
                        return (
                          <div
                            key={entry.name}
                            className="flex items-center gap-2 p-2 rounded text-left"
                          >
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest truncate" title={entry.name}>{entry.name}</span>
                              <span className="text-[10px] font-bold text-gray-400">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Line Chart - Fluxo de Caixa */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[220px] lg:min-h-0 lg:h-full flex flex-col">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  Fluxo de Caixa
                </h3>
                {cashFlowData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center opacity-50 flex-1">
                    <TrendingUp className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Nenhuma transação histórica</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cashFlowData} margin={{ top: 35, right: 45, left: 45, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                          <YAxis hide domain={['dataMin', 'dataMax']} padding={{ top: 20, bottom: 20 }} />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{payload[0].payload.name}</p>
                                    <p className="text-xs font-bold text-green-600">Entrada: {formatCurrency(payload[0].value)}</p>
                                    <p className="text-xs font-bold text-red-600">Saída: {formatCurrency(payload[1].value)}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="Entrada"
                            stroke="#22c55e"
                            strokeWidth={3}
                            dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6 }}
                            label={<CustomizedFlowLabel fill="#22c55e" position="top" />}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="Saída"
                            stroke="#ef4444"
                            strokeWidth={3}
                            dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6 }}
                            label={<CustomizedFlowLabel fill="#ef4444" position="bottom" />}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-6 pb-2 px-2 w-full shrink-0">
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                        <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">ENTRADA DE CAPITAL</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                        <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">SAÍDA DE CAPITAL</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {isSettingsOpen && (
        <ProjectSettingsModal project={project} onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Countdown Modal */}
      <AnimatePresence>
        {isCountdownModalOpen && (
          <CountdownModal project={project} onClose={() => setIsCountdownModalOpen(false)} />
        )}
      </AnimatePresence>

      {/* Audit Modal */}
      <AnimatePresence>
        {isAuditModalOpen && (
          <AuditModal project={project} onClose={() => setIsAuditModalOpen(false)} />
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
