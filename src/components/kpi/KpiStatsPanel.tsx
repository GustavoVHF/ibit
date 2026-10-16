import React, { useMemo } from 'react';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ProjectKPI } from '../../types';
import { computeProgress, isTargetMet, toNumber, toJsDate } from './kpiHelpers';

interface KpiStatsPanelProps {
  kpis: ProjectKPI[];
}

const STALE_DAYS = 30;

/** Latest meaningful activity date for a KPI: updatedAt, else last history date, else createdAt. */
function lastActivity(kpi: ProjectKPI): Date | null {
  const updated = toJsDate(kpi.updatedAt);
  if (updated) return updated;
  if (Array.isArray(kpi.history) && kpi.history.length > 0) {
    const dates = kpi.history
      .map((h) => toJsDate(h.date))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());
    if (dates[0]) return dates[0];
  }
  return toJsDate(kpi.createdAt);
}

/** Trend from the last two recorded history points. */
function trendOf(kpi: ProjectKPI): 'up' | 'down' | 'flat' | 'none' {
  const history = Array.isArray(kpi.history) ? kpi.history : [];
  if (history.length < 2) return 'none';
  const sorted = history
    .map((h) => ({ date: toJsDate(h.date), value: toNumber(h.value) }))
    .filter((p): p is { date: Date; value: number } => p.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < 2) return 'none';
  const last = sorted[sorted.length - 1].value;
  const prev = sorted[sorted.length - 2].value;
  if (last > prev) return 'up';
  if (last < prev) return 'down';
  return 'flat';
}

export default function KpiStatsPanel({ kpis }: KpiStatsPanelProps) {
  const stats = useMemo(() => {
    const total = kpis.length;
    const withProgress = kpis.map((k) => ({ kpi: k, progress: computeProgress(k) }));

    const onTrack = withProgress.filter((x) => x.progress >= 70).length;
    const atRisk = withProgress.filter((x) => x.progress >= 40 && x.progress < 70).length;
    const offTrack = withProgress.filter((x) => x.progress < 40).length;

    const avg =
      total === 0 ? 0 : Math.round(withProgress.reduce((s, x) => s + x.progress, 0) / total);

    const sorted = [...withProgress].sort((a, b) => b.progress - a.progress);
    const best = sorted[0] ?? null;
    const worst = sorted.length > 0 ? sorted[sorted.length - 1] : null;

    const metCount = kpis.filter((k) => isTargetMet(k)).length;

    const now = Date.now();
    const stale = kpis.filter((k) => {
      const d = lastActivity(k);
      if (!d) return false;
      return (now - d.getTime()) / (1000 * 60 * 60 * 24) > STALE_DAYS;
    }).length;

    const trendUp = kpis.filter((k) => trendOf(k) === 'up').length;
    const trendDown = kpis.filter((k) => trendOf(k) === 'down').length;
    const trendFlat = kpis.filter((k) => {
      const t = trendOf(k);
      return t === 'flat';
    }).length;

    return {
      total,
      onTrack,
      atRisk,
      offTrack,
      avg,
      best,
      worst,
      metCount,
      stale,
      trendUp,
      trendDown,
      trendFlat,
    };
  }, [kpis]);

  if (stats.total === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-0.5">
        Estatísticas Detalhadas
      </h3>
      <p className="text-[11px] text-gray-400 font-medium mb-3">
        Panorama de desempenho e saúde dos indicadores
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Saúde: No Alvo / Em Atenção / Fora do Alvo */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-[0.1em] mb-1">
            <CheckCircle2 className="w-3 h-3" /> No Alvo
          </span>
          <div className="text-2xl font-bold text-green-600">{stats.onTrack}</div>
          <p className="text-[10px] text-gray-400 font-semibold">≥ 70%</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 uppercase tracking-[0.1em] mb-1">
            <AlertTriangle className="w-3 h-3" /> Em Atenção
          </span>
          <div className="text-2xl font-bold text-yellow-600">{stats.atRisk}</div>
          <p className="text-[10px] text-gray-400 font-semibold">40% – 69%</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase tracking-[0.1em] mb-1">
            <AlertTriangle className="w-3 h-3" /> Fora do Alvo
          </span>
          <div className="text-2xl font-bold text-red-600">{stats.offTrack}</div>
          <p className="text-[10px] text-gray-400 font-semibold">&lt; 40%</p>
        </div>

        {/* Metas atingidas */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">
            <Target className="w-3 h-3 text-[#ff7f00]" /> Metas Atingidas
          </span>
          <div className="text-2xl font-bold text-gray-900">
            {stats.metCount}
            <span className="text-sm text-gray-400 font-bold">/{stats.total}</span>
          </div>
        </div>

        {/* Atingimento médio */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">
            <Target className="w-3 h-3 text-[#ff7f00]" /> Atingimento Médio
          </span>
          <div
            className={`text-2xl font-bold ${
              stats.avg >= 70 ? 'text-green-600' : stats.avg >= 40 ? 'text-yellow-600' : 'text-red-600'
            }`}
          >
            {stats.avg}%
          </div>
        </div>

        {/* Desatualizados */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">
            <Clock className="w-3 h-3 text-[#ff7f00]" /> Desatualizados
          </span>
          <div className={`text-2xl font-bold ${stats.stale > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.stale}
          </div>
          <p className="text-[10px] text-gray-400 font-semibold">&gt; {STALE_DAYS} dias</p>
        </div>

        {/* Melhor desempenho */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 col-span-2 sm:col-span-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">
            <Award className="w-3 h-3 text-green-600" /> Melhor Desempenho
          </span>
          {stats.best ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 truncate" title={stats.best.kpi.name}>
                {stats.best.kpi.name}
              </span>
              <span className="text-sm font-bold text-green-600 shrink-0">{stats.best.progress}%</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400 font-medium">Sem dados</span>
          )}
        </div>

        {/* Pior desempenho */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 col-span-2 sm:col-span-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">
            <AlertTriangle className="w-3 h-3 text-red-500" /> Pior Desempenho
          </span>
          {stats.worst ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-900 truncate" title={stats.worst.kpi.name}>
                {stats.worst.kpi.name}
              </span>
              <span className="text-sm font-bold text-red-500 shrink-0">{stats.worst.progress}%</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400 font-medium">Sem dados</span>
          )}
        </div>

        {/* Tendência (com base no histórico) */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 col-span-2 sm:col-span-6">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2 block">
            Tendência (últimas atualizações)
          </span>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-lg font-bold text-gray-900">{stats.trendUp}</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Em alta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-lg font-bold text-gray-900">{stats.trendDown}</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Em queda</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Minus className="w-4 h-4 text-gray-400" />
              <span className="text-lg font-bold text-gray-900">{stats.trendFlat}</span>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Estável</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
