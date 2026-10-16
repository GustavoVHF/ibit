import { KpiSector, KpiStatus, KpiComparator, ProjectKPI } from '../../types';

export const KPI_SECTORS: KpiSector[] = [
  'Engenharia',
  'Marketing',
  'Financeiro',
  'Gestão de Projetos',
  'Design',
  'Projeto Social',
];

export const KPI_STATUSES: KpiStatus[] = [
  'Concluído',
  'Em Andamento',
  'Em Risco',
  'Atrasado',
];

export const KPI_STATUS_STYLES: Record<KpiStatus, { badge: string; dot: string; bar: string }> = {
  'Concluído': { badge: 'bg-green-50 text-green-600 border-green-200', dot: 'bg-green-500', bar: 'bg-green-500' },
  'Em Andamento': { badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', bar: 'bg-yellow-500' },
  'Em Risco': { badge: 'bg-orange-50 text-orange-600 border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500' },
  'Atrasado': { badge: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500', bar: 'bg-red-500' },
};

export const KPI_SECTOR_COLORS: Record<KpiSector, string> = {
  'Engenharia': '#ff7f00',
  'Marketing': '#3b82f6',
  'Financeiro': '#10b981',
  'Gestão de Projetos': '#8b5cf6',
  'Design': '#ec4899',
  'Projeto Social': '#14b8a6',
};

export const COMPARATOR_LABEL: Record<KpiComparator, string> = {
  '>=': '≥',
  '<=': '≤',
  '=': '=',
};

/** Coerces any value (number, numeric string with comma/period, undefined, NaN) to a finite number, defaulting to 0. */
export function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Formats the target as displayed text, e.g. "≥ 85%" or "≤ 3 revisões". */
export function formatTarget(kpi: Pick<ProjectKPI, 'targetComparator' | 'targetValue' | 'targetUnit'>): string {
  const unit = kpi.targetUnit ? ` ${kpi.targetUnit}` : '';
  return `${COMPARATOR_LABEL[kpi.targetComparator]} ${kpi.targetValue}${unit}`;
}

/** Formats the current value with its unit. */
export function formatCurrent(kpi: Pick<ProjectKPI, 'currentValue' | 'targetUnit'>): string {
  const unit = kpi.targetUnit ? ` ${kpi.targetUnit}` : '';
  return `${kpi.currentValue}${unit}`;
}

/**
 * Computes attainment progress (0-100) based on the comparator direction.
 * '>=' -> higher current is better (current / target).
 * '<=' -> lower current is better (target / current), capped at 100.
 * '='  -> closer to target is better.
 */
export function computeProgress(kpi: Pick<ProjectKPI, 'targetComparator' | 'targetValue' | 'currentValue'>): number {
  const targetComparator = kpi.targetComparator;
  const targetValue = toNumber(kpi.targetValue);
  const currentValue = toNumber(kpi.currentValue);
  if (targetValue === 0) return currentValue === 0 ? 100 : 0;

  let ratio: number;
  if (targetComparator === '>=') {
    ratio = currentValue / targetValue;
  } else if (targetComparator === '<=') {
    ratio = currentValue === 0 ? 1 : targetValue / currentValue;
  } else {
    const diff = Math.abs(targetValue - currentValue);
    ratio = 1 - diff / Math.max(Math.abs(targetValue), 1);
  }
  const result = Math.round(ratio * 100);
  return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : 0;
}

/** Whether the KPI currently meets its target, independent of the stored status field. */
export function isTargetMet(kpi: Pick<ProjectKPI, 'targetComparator' | 'targetValue' | 'currentValue'>): boolean {
  const targetComparator = kpi.targetComparator;
  const targetValue = toNumber(kpi.targetValue);
  const currentValue = toNumber(kpi.currentValue);
  if (targetComparator === '>=') return currentValue >= targetValue;
  if (targetComparator === '<=') return currentValue <= targetValue;
  return currentValue === targetValue;
}

export function formatDate(timestamp: any): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

export function toJsDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return isNaN(date.getTime()) ? null : date;
}

/** Days remaining until deadline (negative if overdue). */
export function daysUntil(timestamp: any): number | null {
  const date = toJsDate(timestamp);
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
