import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import clsx from 'clsx';
import { Transaction } from '../../types';
import { computeOutflowTotals } from '../../utils/financeMetrics';
import { getLocale } from '../../i18n';
import { useI18n } from '../../i18n/LanguageContext';

interface OutflowComparisonCardProps {
  transactions: Transaction[];
  className?: string;
}

type Period = 'mes' | 'total';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'BRL' }).format(val);

export default function OutflowComparisonCard({ transactions, className }: OutflowComparisonCardProps) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>('mes');
  const { interna, externa, diferenca } = useMemo(
    () => computeOutflowTotals(transactions, period),
    [transactions, period]
  );

  const totalSaida = interna + externa;
  const internaPct = totalSaida > 0 ? (interna / totalSaida) * 100 : 0;
  const externaPct = totalSaida > 0 ? (externa / totalSaida) * 100 : 0;

  const diffSign = diferenca > 0 ? '+' : diferenca < 0 ? '−' : '';
  const diffColor = diferenca > 0 ? 'text-purple-600' : diferenca < 0 ? 'text-[#ff7f00]' : 'text-gray-400';
  const diffText =
    diferenca > 0
      ? t.finance.externalExceeds(formatCurrency(diferenca))
      : diferenca < 0
        ? t.finance.internalExceeds(formatCurrency(Math.abs(diferenca)))
        : t.finance.outflowsEqual;

  return (
    <div className={clsx('bg-white border border-gray-200 rounded-xl p-6 w-full', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h3 className="font-bold text-gray-400 uppercase tracking-widest text-sm flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-purple-500" />
          {t.finance.outflowTitle}
        </h3>
        <div className="flex bg-gray-100 p-1 rounded-lg self-start sm:self-auto">
          {([
            { id: 'mes', label: t.finance.currentMonth },
            { id: 'total', label: t.finance.total },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md font-bold text-xs uppercase tracking-widest transition-all',
                period === opt.id ? 'bg-white text-[#ff7f00] shadow-sm' : 'text-gray-500 hover:text-gray-900'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{t.finance.internalOutflow}</span>
          <span className="text-2xl font-bold text-red-600 tracking-tight tabular-nums">{formatCurrency(interna)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{t.finance.externalOutflow}</span>
          <span className="text-2xl font-bold text-purple-600 tracking-tight tabular-nums">{formatCurrency(externa)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{t.finance.difference}</span>
          <span className={clsx('text-2xl font-bold tracking-tight tabular-nums', diffColor)}>
            {diffSign}{formatCurrency(Math.abs(diferenca))}
          </span>
          <span className="text-[10px] font-bold text-gray-400 mt-1">{diffText}</span>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
          <div className="bg-red-500 h-full" style={{ width: `${internaPct}%` }} />
          <div className="bg-purple-500 h-full" style={{ width: `${externaPct}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          <span>{t.finance.internalPct(internaPct.toFixed(1))}</span>
          <span>{t.finance.externalPct(externaPct.toFixed(1))}</span>
        </div>
      </div>
    </div>
  );
}
