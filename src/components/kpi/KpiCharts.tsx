import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ProjectKPI } from '../../types';
import { KPI_SECTORS, KPI_SECTOR_COLORS, computeProgress, toJsDate, toNumber } from './kpiHelpers';

interface KpiChartsProps {
  kpis: ProjectKPI[];
}

const SectorTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs font-bold text-gray-900">{d.sector}</p>
        <p className="text-xs text-gray-500 font-semibold">Atingimento médio: {d.attainment}%</p>
        <p className="text-[10px] text-gray-400">{d.count} KPI(s)</p>
      </div>
    );
  }
  return null;
};

const EvolutionTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs font-bold text-gray-900">{label}</p>
        <p className="text-xs text-[#ff7f00] font-semibold">Atingimento médio: {payload[0].value}%</p>
      </div>
    );
  }
  return null;
};

export default function KpiCharts({ kpis }: KpiChartsProps) {
  const sectorData = useMemo(() => {
    return KPI_SECTORS.map((sector) => {
      const items = kpis.filter((k) => k.sector === sector);
      const attainment = items.length === 0
        ? 0
        : Math.round(items.reduce((sum, k) => sum + computeProgress(k), 0) / items.length);
      return { sector, attainment, count: items.length, color: KPI_SECTOR_COLORS[sector] };
    }).filter((d) => d.count > 0);
  }, [kpis]);

  const evolutionData = useMemo(() => {
    // Build a trailing-6-month timeline. For each month, reconstruct the value
    // each KPI actually had by the end of that month from its recorded history
    // and average the resulting attainment. Legacy-safe: KPIs without history
    // use their current value as a flat line.
    const now = new Date();
    const months: { label: string; monthEnd: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        monthEnd: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      });
    }

    // Pre-sort each KPI's history ascending once.
    const kpiSeries = kpis.map((k) => {
      const history = Array.isArray(k.history) ? k.history : [];
      const points = history
        .map((h) => ({ date: toJsDate(h.date), value: toNumber(h.value) }))
        .filter((p): p is { date: Date; value: number } => p.date !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      return { kpi: k, points };
    });

    return months.map(({ label, monthEnd }) => {
      const values = kpiSeries.map(({ kpi, points }) => {
        // Value the KPI had at the end of this month.
        let reconstructed: number;
        const lastBefore = [...points].reverse().find((p) => p.date <= monthEnd);
        if (lastBefore) {
          reconstructed = lastBefore.value;
        } else if (points.length > 0) {
          // Month predates the first recorded point → use the earliest value.
          reconstructed = points[0].value;
        } else {
          // No history at all → flat current value.
          reconstructed = toNumber(kpi.currentValue);
        }
        return { kpi, reconstructed };
      });

      if (values.length === 0) return { name: label.toUpperCase(), attainment: 0 };

      const attainment = Math.round(
        values.reduce(
          (sum, { kpi, reconstructed }) =>
            sum +
            computeProgress({
              targetComparator: kpi.targetComparator,
              targetValue: kpi.targetValue,
              currentValue: reconstructed,
            }),
          0
        ) / values.length
      );
      return { name: label.toUpperCase(), attainment };
    });
  }, [kpis]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Atingimento por Setor */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-0.5">
          Atingimento por Setor
        </h3>
        <p className="text-[11px] text-gray-400 font-medium mb-3">Comparativo de metas atingidas por departamento</p>
        {sectorData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-gray-400 font-medium">
            Nenhum KPI cadastrado ainda.
          </div>
        ) : (
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="sector"
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip content={<SectorTooltip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="attainment" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {sectorData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Evolução */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-0.5">
          Evolução do Cumprimento
        </h3>
        <p className="text-[11px] text-gray-400 font-medium mb-3">Linha do tempo do avanço médio das metas</p>
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip content={<EvolutionTooltip />} />
              <Line
                type="monotone"
                dataKey="attainment"
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
    </div>
  );
}
