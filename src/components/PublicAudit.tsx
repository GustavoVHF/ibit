import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ListTodo, Calendar, Wallet, Loader2, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import ibitLogo from '../media/ibitlogo.svg';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useI18n } from '../i18n/LanguageContext';
import { getLocale, getMessages } from '../i18n';

interface PublicDashboardData {
  project: {
    id: string;
    name: string;
    shortId: string;
    photoURL: string | null;
    targetEventName: string | null;
    targetDate: any;
  };
  kpis: {
    todoCount: number;
    completedLast7Days: number;
    balance: number;
    countdown: number | null;
  };
  charts: {
    chartData: Array<{ name: string; value: number }>;
    cashFlowData: Array<{ name: string; Entrada: number; Saída: number }>;
  };
  members: Array<{
    uid: string;
    name: string;
    photoURL?: string;
  }>;
}

export default function PublicAudit() {
  const { t } = useI18n();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        console.log('[PublicAudit] Fetching data for token:', token);

        // Use Vercel API endpoint (uses firebase-admin to bypass security rules)
        const response = await fetch(`/api/public-dashboard?token=${token}`);

        if (!response.ok) {
          // Check if we're in development and API is not available
          if (response.status === 404 && window.location.hostname === 'localhost') {
            console.log('[PublicAudit] API not available in local development');
            setError(getMessages().projectSettings.prodOnly);
            setLoading(false);
            return;
          }

          const errorData = await response.json();
          console.log('[PublicAudit] API error:', errorData);
          setError(errorData.error || getMessages().projectSettings.invalidLink);
          setLoading(false);
          return;
        }

        const apiData = await response.json();
        console.log('[PublicAudit] Data received from API:', apiData);

        setData(apiData);
        setLoading(false);
      } catch (err) {
        console.error('[PublicAudit] Error fetching public data:', err);

        // Check if we're in development
        if (window.location.hostname === 'localhost') {
          setError(getMessages().projectSettings.prodOnly);
        } else {
          setError(getMessages().projectSettings.loadError);
        }
        setLoading(false);
      }
    };

    if (token) {
      fetchPublicData();
    }
  }, [token]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'BRL' }).format(value);
  };

  const CHART_COLORS = ['#ff7f00', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

  const CustomizedFlowLabel = (props: any) => {
    const { x, y, value, fill, position = 'top' } = props;
    if (!value && value !== 0) return null;
    const formatted = new Intl.NumberFormat(getLocale(), { 
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

  const CashFlowTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-lg text-left">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
             <p key={index} style={{ color: entry.color }} className="text-sm font-bold">
               {entry.name}: {formatCurrency(entry.value)}
             </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#ff7f00] animate-spin mb-4" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t.projectSettings.loadingDashboard}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-gray-900 mb-2">
            {t.projectSettings.accessDenied}
          </h1>
          <p className="text-sm text-gray-600">
            {error || t.projectSettings.invalidLink}
          </p>
        </div>
      </div>
    );
  }

  const { project, kpis, members } = data;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-8 shrink-0">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm">
              {project.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">🏎️</span>
              )}
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold uppercase tracking-wider text-gray-900">
                {project.name} - #{project.shortId}
              </h1>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                {t.projectSettings.publicReadOnly}
              </p>
            </div>
          </div>
          {/* Members */}
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {members.map((member) => (
                <div key={member.uid} className="relative inline-block" title={member.name}>
                  {member.photoURL ? (
                    <img
                      src={member.photoURL}
                      alt={member.name}
                      className="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shadow-sm">
                      {member.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
              {members.length} {t.common.membersCount(members.length)}
            </span>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* KPI 1: Tarefas a Fazer */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm hover:shadow-md transition-all h-full">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <ListTodo className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7f00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      {t.projectDashboard.todo}
                    </p>
                    <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">{kpis.todoCount}</p>
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
                      {t.projectDashboard.completed7}
                    </p>
                    <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">{kpis.completedLast7Days}</p>
                  </div>
                </div>
              </div>

              {/* KPI 3: Contagem Regressiva */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm hover:shadow-md transition-all h-full">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7f00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      {t.projectDashboard.countdown}
                    </p>
                    {kpis.countdown !== null ? (
                      <>
                        <p className="text-2xl sm:text-4xl font-bold tabular-nums text-[#ff7f00] leading-none">
                          {kpis.countdown} {t.projectDashboard.days(kpis.countdown)}
                        </p>
                        {project.targetEventName && (
                          <p className="text-[9px] text-gray-500 mt-0.5 truncate">{project.targetEventName}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-bold text-gray-400">{t.projectSettings.noEvent}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI 4: Saldo Atual */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 flex items-center justify-start min-h-[110px] sm:min-h-[140px] shadow-sm hover:shadow-md transition-all h-full">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className={clsx(
                    "w-11 h-11 sm:w-14 sm:h-14 rounded-xl border flex items-center justify-center shrink-0",
                    kpis.balance >= 0 ? "bg-orange-50 border-orange-100" : "bg-red-50 border-red-100"
                  )}>
                    <Wallet className={clsx("w-5 h-5 sm:w-7 sm:h-7", kpis.balance >= 0 ? "text-[#ff7f00]" : "text-red-600")} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 truncate">
                      {t.projectDashboard.balance}
                    </p>
                    <p className={clsx(
                      "font-bold tabular-nums leading-none truncate",
                      kpis.balance.toString().length > 10 ? "text-lg sm:text-2xl" : "text-xl sm:text-3xl",
                      kpis.balance >= 0 ? "text-[#ff7f00]" : "text-red-600"
                    )}>
                      {formatCurrency(kpis.balance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
          {/* Pie Chart - Despesas por Categoria */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[450px] flex flex-col col-span-1">
            <h3 className="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-indigo-500" />
              {t.projectDashboard.expensesByCategory}
            </h3>
            {data.charts.chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center opacity-50 flex-1">
                <PieChartIcon className="w-14 h-14 text-gray-200 mb-4" />
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t.projectDashboard.noExpenses}</p>
              </div>
            ) : (
                <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 min-h-0">
                  <div className="flex-1 w-full h-[250px] md:h-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.charts.chartData}
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {data.charts.chartData.map((entry, index) => (
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
                  <div className="flex flex-col w-full md:w-1/3 p-3 bg-gray-50 rounded-lg border border-gray-100 max-h-72 overflow-y-auto scrollbar-hide text-left mt-4 md:mt-0 shrink-0">
                    {data.charts.chartData.map((entry, index) => {
                      const totalChartValue = data.charts.chartData.reduce((acc, curr) => acc + curr.value, 0);
                      const pct = totalChartValue > 0 ? Math.round((entry.value / totalChartValue) * 100) : 0;
                      return (
                        <div
                          key={entry.name}
                          className="flex items-center gap-2 p-2 rounded text-left"
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest truncate" title={entry.name}>{entry.name}</span>
                            <span className="text-[11px] font-bold text-gray-400">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            )}
          </div>

          {/* Line Chart - Fluxo de Caixa */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[450px] flex flex-col col-span-1">
            <h3 className="font-bold text-gray-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              {t.projectDashboard.cashFlow}
            </h3>
            {data.charts.cashFlowData.length === 0 ? (
              <div className="flex flex-col items-center justify-center opacity-50 flex-1">
                <TrendingUp className="w-14 h-14 text-gray-200 mb-4" />
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t.projectDashboard.noTransactions}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.charts.cashFlowData} margin={{ top: 35, right: 45, left: 45, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={['dataMin', 'dataMax']} padding={{ top: 20, bottom: 20 }} />
                      <Tooltip content={<CashFlowTooltip />} isAnimationActive={false} />
                      
                      <Line
                        type="monotone"
                        dataKey="Entrada"
                        name={t.projectDashboard.income}
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
                        name={t.projectDashboard.outflow}
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
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t.projectDashboard.capitalIn}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t.projectDashboard.capitalOut}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-gray-200 bg-white py-10 w-full shrink-0">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">{t.projectSettings.poweredBy}</span>
            <img src={ibitLogo} alt={t.common.logoAlt} className="h-6 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all cursor-pointer" />
          </div>
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-2">
            Escuderia IBIT © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
