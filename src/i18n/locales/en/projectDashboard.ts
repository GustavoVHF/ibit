import type { Messages } from '../pt-BR';

export const projectDashboard: Messages['projectDashboard'] = {
  noCategory: 'Uncategorized',
  exitTvMode: 'Exit TV Mode',
  title: 'Dashboard',
  tvMode: 'TV Mode',
  auditAccess: 'Audit Access',
  todo: 'Tasks to do',
  completed7: 'Completed (7 days)',
  countdown: 'Countdown',
  days: (n: number) => (n === 1 ? 'Day' : 'Days'),
  configureEvent: 'Set Up Event',
  balance: 'Current Balance',
  expensesByCategory: 'Expenses by Category',
  noExpenses: 'No expenses recorded',
  cashFlow: 'Cash Flow',
  noTransactions: 'No transaction history',
  income: 'Income',
  outflow: 'Outflow',
  capitalIn: 'CAPITAL INFLOW',
  capitalOut: 'CAPITAL OUTFLOW',
};
