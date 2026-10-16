import React from 'react';
import { ProjectKPI } from '../../types';
import { computeProgress, daysUntil, formatDate } from './kpiHelpers';

interface KpiSummaryCardsProps {
  kpis: ProjectKPI[];
}

export default function KpiSummaryCards({ kpis }: KpiSummaryCardsProps) {
  const total = kpis.length;

  const attainmentValues = kpis.map(computeProgress).filter(Number.isFinite);
  const overallAttainment = attainmentValues.length === 0
    ? 0
    : Math.round(attainmentValues.reduce((sum, v) => sum + v, 0) / attainmentValues.length);

  const atRiskCount = kpis.filter(k => k.status === 'Em Risco' || k.status === 'Atrasado').length;

  const upcoming = kpis
    .filter(k => k.status !== 'Concluído')
    .map(k => ({ kpi: k, days: daysUntil(k.deadline) }))
    .filter(x => x.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number))[0];

  const cards = [
    {
      label: 'Total de KPIs',
      value: total,
      accent: 'text-gray-900',
    },
    {
      label: 'Taxa de Atingimento',
      value: `${overallAttainment}%`,
      accent: overallAttainment >= 70 ? 'text-green-600' : overallAttainment >= 40 ? 'text-yellow-600' : 'text-red-600',
    },
    {
      label: 'Em Risco / Atrasados',
      value: atRiskCount,
      accent: atRiskCount > 0 ? 'text-red-600' : 'text-gray-900',
    },
    {
      label: 'Próximo Vencimento',
      value: upcoming ? formatDate(upcoming.kpi.deadline) : '-',
      sublabel: upcoming ? upcoming.kpi.name : 'Nenhum prazo pendente',
      accent: 'text-gray-900',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-1.5">
            {card.label}
          </span>
          <div className={`text-2xl font-bold ${card.accent} truncate`} title={String(card.value)}>
            {card.value}
          </div>
          {card.sublabel && (
            <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate" title={card.sublabel}>
              {card.sublabel}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
