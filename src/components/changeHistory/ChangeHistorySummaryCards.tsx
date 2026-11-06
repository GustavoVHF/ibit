import React from 'react';
import clsx from 'clsx';
import { CalendarClock, CircleDollarSign, History, Hourglass } from 'lucide-react';
import { ChangeHistoryTotals, formatSignedCurrency, formatSignedDays, impactTone } from './changeHistoryHelpers';
import { useI18n } from '../../i18n/LanguageContext';

interface ChangeHistorySummaryCardsProps {
  totals: ChangeHistoryTotals;
}

export default function ChangeHistorySummaryCards({ totals }: ChangeHistorySummaryCardsProps) {
  const { t } = useI18n();
  const cards = [
    {
      id: 'total',
      label: t.changes.cardTotal,
      icon: History,
      iconTone: 'text-[#ff7f00]',
      iconBg: 'bg-orange-50 border-orange-100',
      value: String(totals.total),
      valueTone: 'text-gray-900',
      hint: t.changes.cardTotalHint,
    },
    {
      id: 'pending',
      label: t.changes.cardPending,
      icon: Hourglass,
      iconTone: 'text-yellow-600',
      iconBg: 'bg-yellow-50 border-yellow-100',
      value: String(totals.pending),
      valueTone: totals.pending > 0 ? 'text-yellow-600' : 'text-gray-900',
      hint: t.changes.cardPendingHint,
    },
    {
      id: 'schedule-impact',
      label: t.changes.cardSchedule,
      icon: CalendarClock,
      iconTone: 'text-indigo-600',
      iconBg: 'bg-indigo-50 border-indigo-100',
      value: formatSignedDays(totals.approvedDays),
      valueTone: impactTone(totals.approvedDays),
      hint: t.changes.cardScheduleHint,
      hintTone: impactTone(totals.approvedDays),
    },
    {
      id: 'budget-impact',
      label: t.changes.cardBudget,
      icon: CircleDollarSign,
      iconTone: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-100',
      value: formatSignedCurrency(totals.approvedAmount),
      valueTone: impactTone(totals.approvedAmount),
      hint: t.changes.cardBudgetHint,
      hintTone: impactTone(totals.approvedAmount),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => (
        <div key={card.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', card.iconBg)}>
              <card.icon className={clsx('w-4 h-4', card.iconTone)} />
            </div>
            <span className="font-bold text-gray-400 uppercase tracking-[0.15em] text-[10px] leading-tight">
              {card.label}
            </span>
          </div>
          <span className={clsx('text-2xl sm:text-3xl font-bold tracking-tight tabular-nums', card.valueTone)}>
            {card.value}
          </span>
          <span
            className={clsx(
              'text-[10px] font-bold uppercase tracking-wider',
              card.hintTone || 'text-gray-400'
            )}
          >
            {card.hint}
          </span>
        </div>
      ))}
    </div>
  );
}
