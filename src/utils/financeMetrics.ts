import { Transaction } from '../types';

export type TransactionFlow = 'entrada' | 'saidaInterna' | 'saidaExterna';
export type CashFlowGranularity = 'dia' | 'semana' | 'mes';

export interface CashFlowRow {
  name: string;
  key: string;
  Entrada: number;
  'Saída Interna': number;
  'Saída Externa': number;
}

export interface OutflowTotals {
  interna: number;
  externa: number;
  diferenca: number; // externa - interna
}

const MONTH_NAMES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const pad = (n: number) => n.toString().padStart(2, '0');

const toDate = (t: Transaction): Date => (t.date?.toDate ? t.date.toDate() : new Date());

// Missing isExternal counts as interno, matching how the balance is computed.
export function classifyTransaction(t: Transaction): TransactionFlow {
  if (t.type === 'income') return 'entrada';
  return t.isExternal === true ? 'saidaExterna' : 'saidaInterna';
}

function bucketOf(date: Date, granularity: CashFlowGranularity): { key: string; name: string } {
  if (granularity === 'mes') {
    const m = date.getMonth();
    const y = date.getFullYear();
    return { key: `${y}-${pad(m)}`, name: `${MONTH_NAMES[m]}/${y.toString().slice(-2)}` };
  }
  if (granularity === 'dia') {
    return {
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      name: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
    };
  }
  // Week bucket keyed by the week's Monday.
  const monday = new Date(date);
  const dow = (monday.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(monday.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  return {
    key: `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`,
    name: `Sem ${pad(monday.getDate())}/${pad(monday.getMonth() + 1)}`,
  };
}

// Cumulative Entrada / Saída Interna / Saída Externa series, bucketed by day, week or month.
export function buildCashFlowSeries(transactions: Transaction[], granularity: CashFlowGranularity): CashFlowRow[] {
  const sorted = [...transactions].sort((a, b) => toDate(a).getTime() - toDate(b).getTime());

  const buckets: { name: string; key: string; entrada: number; interna: number; externa: number }[] = [];
  sorted.forEach((t) => {
    const { key, name } = bucketOf(toDate(t), granularity);
    let row = buckets.find((b) => b.key === key);
    if (!row) {
      row = { name, key, entrada: 0, interna: 0, externa: 0 };
      buckets.push(row);
    }
    const flow = classifyTransaction(t);
    if (flow === 'entrada') row.entrada += t.amount;
    else if (flow === 'saidaExterna') row.externa += t.amount;
    else row.interna += t.amount;
  });

  let accEntrada = 0;
  let accInterna = 0;
  let accExterna = 0;
  return buckets.map((row) => {
    accEntrada += row.entrada;
    accInterna += row.interna;
    accExterna += row.externa;
    return {
      name: row.name,
      key: row.key,
      Entrada: accEntrada,
      'Saída Interna': accInterna,
      'Saída Externa': accExterna,
    };
  });
}

// Internal vs external outflow totals. 'mes' = same month and year as `now`.
export function computeOutflowTotals(transactions: Transaction[], period: 'mes' | 'total', now: Date = new Date()): OutflowTotals {
  let interna = 0;
  let externa = 0;
  transactions.forEach((t) => {
    const flow = classifyTransaction(t);
    if (flow === 'entrada') return;
    if (period === 'mes') {
      const d = toDate(t);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
    }
    if (flow === 'saidaExterna') externa += t.amount;
    else interna += t.amount;
  });
  return { interna, externa, diferenca: externa - interna };
}
