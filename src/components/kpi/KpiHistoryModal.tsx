import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ProjectKPI } from '../../types';
import {
  computeProgress,
  formatTarget,
  formatCurrent,
  toNumber,
  toJsDate,
} from './kpiHelpers';

interface KpiHistoryModalProps {
  kpi: ProjectKPI;
  onClose: () => void;
}

interface SeriesPoint {
  date: Date;
  value: number;
  note?: string | null;
}

/**
 * Per-KPI drill-down showing the evolution of its current value over time
 * against the target line. Legacy-safe: KPIs without a `history` array get a
 * single synthetic starting point and never crash.
 */
export default function KpiHistoryModal({ kpi, onClose }: KpiHistoryModalProps) {
  const target = toNumber(kpi.targetValue);
  const unit = kpi.targetUnit ? ` ${kpi.targetUnit}` : '';

  const series = useMemo<SeriesPoint[]>(() => {
    const points: SeriesPoint[] = [];

    if (Array.isArray(kpi.history) && kpi.history.length > 0) {
      kpi.history.forEach((h) => {
        const date = toJsDate(h.date);
        if (date) points.push({ date, value: toNumber(h.value), note: h.note });
      });
      points.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    // Legacy / empty history: synthesize a single starting point.
    if (points.length === 0) {
      const start = toJsDate(kpi.startDate ?? kpi.createdAt) ?? new Date();
      points.push({ date: start, value: toNumber(kpi.currentValue) });
    }

    // Always reflect the live current value as the latest point.
    const current = toNumber(kpi.currentValue);
    if (points[points.length - 1].value !== current) {
      points.push({ date: new Date(), value: current });
    }

    return points;
  }, [kpi]);

  const chartData = useMemo(
    () =>
      series.map((p) => ({
        name: p.date.toLocaleDateString('pt-BR'),
        valor: p.value,
        meta: target,
        note: p.note,
      })),
    [series, target]
  );

  const last = series[series.length - 1]?.value ?? 0;
  const previous = series.length > 1 ? series[series.length - 2].value : null;
  const delta = previous === null ? null : last - previous;
  const pctChange =
    previous === null || previous === 0
      ? null
      : Math.round(((last - previous) / Math.abs(previous)) * 100);
  const attainment = computeProgress(kpi);

  const trendIcon =
    delta === null || delta === 0 ? (
      <Minus className="w-4 h-4 text-gray-400" />
    ) : delta > 0 ? (
      <TrendingUp className="w-4 h-4 text-green-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-500" />
    );

  const HistoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
          <p className="text-xs font-bold text-gray-900">{label}</p>
          <p className="text-xs text-[#ff7f00] font-semibold">
            Valor: {d.valor}
            {unit}
          </p>
          <p className="text-[11px] text-gray-400 font-semibold">
            Meta: {target}
            {unit}
          </p>
          {d.note && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[200px]">{d.note}</p>}
        </div>
      );
    }
    return null;
  };

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[900] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <LineChartIcon className="w-6 h-6 text-[#ff7f00] shrink-0" />
              <div className="min-w-0">
                <h3 className="text-lg font-bold uppercase tracking-wider text-gray-900 truncate" title={kpi.name}>
                  Evolução do KPI
                </h3>
                <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mt-0.5 truncate" title={kpi.name}>
                  {kpi.name}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors shrink-0">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-5">
            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">
                  Valor Atual
                </span>
                <div className="text-xl font-bold text-gray-900 truncate">{formatCurrent(kpi)}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">
                  Meta
                </span>
                <div className="text-xl font-bold text-gray-900 truncate">{formatTarget(kpi)}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">
                  Atingimento
                </span>
                <div
                  className={`text-xl font-bold ${
                    attainment >= 70 ? 'text-green-600' : attainment >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}
                >
                  {attainment}%
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">
                  Variação
                </span>
                <div className="flex items-center gap-1.5">
                  {trendIcon}
                  <span className="text-xl font-bold text-gray-900">
                    {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                  </span>
                  {pctChange !== null && (
                    <span className="text-[11px] font-bold text-gray-400">
                      ({pctChange > 0 ? '+' : ''}{pctChange}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Gráfico */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-0.5">
                Histórico de Valores
              </h4>
              <p className="text-[11px] text-gray-400 font-medium mb-3">
                Evolução do valor atual em relação à meta
              </p>
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip content={<HistoryTooltip />} />
                    <ReferenceLine
                      y={target}
                      stroke="#9ca3af"
                      strokeDasharray="5 4"
                      label={{ value: 'Meta', position: 'right', fontSize: 10, fill: '#9ca3af', fontWeight: 700 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      name="Valor"
                      stroke="#ff7f00"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#ff7f00', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Lista de atualizações */}
            {series.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3">
                  Atualizações Registradas
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-hide">
                  {[...series].reverse().map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-gray-900">
                          {p.value}
                          {unit}
                        </span>
                        {p.note && (
                          <span className="text-[11px] text-gray-400 font-medium ml-2 truncate">· {p.note}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 font-semibold shrink-0">
                        {p.date.toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
