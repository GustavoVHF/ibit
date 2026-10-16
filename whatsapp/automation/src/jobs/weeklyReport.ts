import { currentWeekRange, DAY, daysUntil, isoWeekKey, zonedParts } from '../dates.js';
import { claim, getNotification, markFailed, markSent, safeId } from '../dispatch.js';
import { evolution } from '../evolution.js';
import { plural } from '../format.js';
import {
  getBoardsAndTasks,
  getFinance,
  getGanttTasks,
  getKpis,
  getPeopleNames,
  getProject,
  type GanttInfo,
  type KpiInfo,
  type TaskInfo,
} from '../projectData.js';
import { listTargets, type WhatsAppTarget } from '../targets.js';
import { weeklyReportMessage, type Health, type WeeklyData } from '../templates.js';
import { logger } from '../logger.js';

/**
 * Resumo semanal: status geral, Kanban (por coluna), Gantt (por seção), KPIs,
 * prazos gerais (atrasados e próximos 7 dias, Kanban + Gantt), saldo e dias restantes.
 * Um envio por projeto por semana ISO (ID weekly_<projectId>_<AAAA-Wnn> em whatsappNotifications).
 * O envio guarda um snapshot das tarefas concluídas, usado na semana seguinte
 * para calcular "concluídas na semana" com precisão.
 */

export interface WeeklyOptions {
  dryRun?: boolean;
  /** Envia mesmo que o relatório da semana já tenha saído (não bloqueia o envio agendado). */
  force?: boolean;
  projectId?: string;
  now?: Date;
}

export interface WeeklyProjectResult {
  projectId: string;
  projectName?: string;
  groupId: string;
  weekKey: string;
  status: 'sent' | 'already_sent' | 'dry_run' | 'failed' | 'disabled';
  messageId?: string | null;
  message?: string;
  error?: string;
}

interface Snapshot {
  doneTaskIds: string[];
  kpiValues: Record<string, number>;
}

/** Kanban concluída na semana: entrou na coluna final desde o último resumo (ou, sem snapshot, atualizada nos últimos 7 dias). */
function completedThisWeek(done: TaskInfo[], prev: Snapshot | null, now: Date): TaskInfo[] {
  if (prev) {
    const before = new Set(prev.doneTaskIds);
    return done.filter((t) => !before.has(t.id));
  }
  const weekAgo = now.getTime() - 7 * DAY;
  return done.filter((t) => (t.updatedAt?.getTime() ?? 0) >= weekAgo);
}

function health(kanbanLate: number, ganttLate: number, kpis: KpiInfo[]): { health: Health; reasons: string[] } {
  const kpiLate = kpis.filter((k) => k.status === 'Atrasado').length;
  const kpiRisk = kpis.filter((k) => k.status === 'Em Risco').length;
  const reasons: string[] = [];
  if (kanbanLate) reasons.push(`${plural(kanbanLate, 'tarefa atrasada', 'tarefas atrasadas')} no Kanban`);
  if (ganttLate) reasons.push(`${plural(ganttLate, 'atividade atrasada', 'atividades atrasadas')} no Gantt`);
  if (kpiLate) reasons.push(plural(kpiLate, 'KPI atrasado', 'KPIs atrasados'));
  if (kpiRisk) reasons.push(plural(kpiRisk, 'KPI em risco', 'KPIs em risco'));

  let h: Health = 'ok';
  if (kpiLate > 0 || kanbanLate >= 3 || ganttLate >= 3) h = 'critical';
  else if (kpiRisk > 0 || kanbanLate > 0 || ganttLate > 0) h = 'attention';
  return { health: h, reasons };
}

async function runForTarget(target: WhatsAppTarget, opts: WeeklyOptions): Promise<WeeklyProjectResult> {
  const now = opts.now ?? new Date();
  const weekKey = isoWeekKey(now);
  const base = { projectId: target.projectId, groupId: target.groupId, weekKey };
  if (!target.weeklyReport) return { ...base, status: 'disabled' };

  const weeklyId = safeId('weekly', target.projectId, weekKey);
  const id = opts.force ? safeId('weekly', target.projectId, weekKey, 'manual', String(now.getTime())) : weeklyId;

  if (!opts.force) {
    const existing = await getNotification(weeklyId);
    if (existing?.status === 'sent') return { ...base, status: 'already_sent' };
  }

  const project = await getProject(target.projectId);
  if (!project) throw new Error(`Projeto ${target.projectId} não encontrado no Firestore`);

  const p = zonedParts(now);
  const [{ boards, tasks, doneBoardId }, gantt, kpis, finance, prevRecord] = await Promise.all([
    getBoardsAndTasks(project.id),
    getGanttTasks(project.id),
    getKpis(project.id),
    getFinance(project.id, { year: p.year, month: p.month }),
    getNotification(safeId('weekly', project.id, isoWeekKey(new Date(now.getTime() - 7 * DAY)))),
  ]);
  const prev = prevRecord?.status === 'sent' && prevRecord.snapshot ? (prevRecord.snapshot as unknown as Snapshot) : null;

  const done = tasks.filter((t) => t.done);
  const open = tasks.filter((t) => !t.done);
  const inWeek = (d: Date | null) => {
    if (!d) return false;
    const n = daysUntil(d, now);
    return n >= 0 && n <= 7;
  };
  const late = (d: Date | null) => !!d && daysUntil(d, now) < 0;

  const kanbanLate = open.filter((t) => late(t.dueDate));
  const ganttOpen = gantt.filter((g) => !g.done);
  const ganttLate = ganttOpen.filter((g) => late(g.end));
  const { health: h, reasons } = health(kanbanLate.length, ganttLate.length, kpis);

  const people = await getPeopleNames(project.id, [...project.members, ...tasks.flatMap((t) => t.assignees)]);
  const { start, end } = currentWeekRange(now);

  const data: WeeklyData = {
    project,
    weekStart: start,
    weekEnd: end,
    health: h,
    healthReasons: reasons,
    columns: boards.map((b) => ({ name: b.name, done: b.id === doneBoardId, count: tasks.filter((t) => t.boardId === b.id).length })),
    kanbanTotal: tasks.length,
    kanbanDone: done.length,
    completedThisWeek: completedThisWeek(done, prev, now).length,
    gantt,
    kpis,
    lateKanban: kanbanLate,
    lateGantt: ganttLate,
    soonKanban: open.filter((t) => inWeek(t.dueDate)),
    soonGantt: ganttOpen.filter((g: GanttInfo) => inWeek(g.end)),
    balance: finance.transactions ? finance.balance : null,
    people,
    now,
  };
  const message = weeklyReportMessage(data);

  if (opts.dryRun) return { ...base, projectName: project.name, status: 'dry_run', message };

  const claimed = await claim(id, { type: 'weekly_report', projectId: project.id, groupId: target.groupId, weekKey });
  if (!claimed) return { ...base, projectName: project.name, status: 'already_sent' };

  const snapshot: Snapshot = {
    doneTaskIds: done.map((t) => t.id),
    kpiValues: Object.fromEntries(kpis.map((k) => [k.id, k.currentValue])),
  };
  const summary = {
    health: h,
    tasksTotal: tasks.length,
    tasksDone: done.length,
    tasksOverdue: kanbanLate.length,
    ganttOverdue: ganttLate.length,
    completedThisWeek: data.completedThisWeek,
    balance: data.balance,
  };

  try {
    const messageId = await evolution.sendText(target.groupId, message);
    await markSent([id], messageId, { snapshot, summary, manual: !!opts.force });
    return { ...base, projectName: project.name, status: 'sent', messageId, message };
  } catch (err) {
    await markFailed([id], err);
    throw err;
  }
}

export async function runWeeklyReport(opts: WeeklyOptions = {}): Promise<WeeklyProjectResult[]> {
  const targets = (await listTargets()).filter((t) => !opts.projectId || t.projectId === opts.projectId);
  if (!targets.length) logger.warn('weekly-report: nenhum grupo vinculado. Use scripts/groups.ps1 para vincular.');

  const results: WeeklyProjectResult[] = [];
  for (const target of targets) {
    try {
      const r = await runForTarget(target, opts);
      results.push(r);
      logger.info(`weekly-report [${target.projectId}] ${r.status} (${r.weekKey})`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ projectId: target.projectId, groupId: target.groupId, weekKey: isoWeekKey(opts.now ?? new Date()), status: 'failed', error });
      logger.error(`weekly-report [${target.projectId}] falhou: ${error}`);
    }
  }
  return results;
}
