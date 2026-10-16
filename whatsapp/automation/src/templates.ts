/**
 * Modelos de todas as mensagens enviadas no WhatsApp.
 *
 * Padrão visual (manter igual em todas):
 *
 *   *⏰ Título · Projeto*            ← cabeçalho: 1 emoji
 *   _linha de contexto_              ← período, totais, filtro
 *
 *   *🔴 Seção (n)*                   ← seção em negrito; emoji só quando indica situação
 *   - item — prazo · responsável     ← itens em lista, sem emoji
 *
 *   📋 *BLOCO*                       ← (só no /prazos) bloco com subseções
 *   🔴 Subseção (n)
 *   - item
 *
 *   Link: https://...                ← rodapé com 1 link
 *
 * Emojis de situação: 🔴 atrasado · 🟡 perto do prazo · 🟢/✅ ok/concluído · ▶️ em andamento · ⏳ a iniciar
 * Regras: blocos separados por linha em branco, seções vazias somem, listas longas terminam em "e mais N".
 */
import { config } from './config.js';
import { ddmm, ddmmyyyy, daysUntil, weekdayDdmm, zonedParts } from './dates.js';
import { clean, names, plural } from './format.js';
import { kpiProgress, type CalendarEvent, type FinanceSummary, type GanttInfo, type KpiInfo, type TaskInfo } from './projectData.js';

// ---------------------------------------------------------------- blocos base

type Block = string | string[] | null | undefined | false;

/** Junta blocos com uma linha em branco entre eles, ignorando vazios. */
function compose(...blocks: Block[]): string {
  return blocks
    .map((b) => (Array.isArray(b) ? b.filter(Boolean).join('\n') : b))
    .filter((b): b is string => !!b && b.trim().length > 0)
    .join('\n\n');
}

function header(emoji: string, title: string, projectName: string, subtitle?: string): string[] {
  return [`*${emoji} ${title} · ${clean(projectName, 60)}*`, subtitle ? `_${subtitle}_` : ''];
}

function list(items: string[], max: number): string[] {
  const shown = items.slice(0, max).map((i) => `- ${i}`);
  if (items.length > max) shown.push(`_e mais ${items.length - max}_`);
  return shown;
}

/** Seção principal: *🔴 Título (n)* + itens. Some se não houver itens. */
function section(title: string, items: string[], max = 10, emoji = ''): string[] | null {
  if (!items.length) return null;
  return [`*${emoji ? `${emoji} ` : ''}${title} (${items.length})*`, ...list(items, max)];
}

/** Subseção dentro de um bloco (/prazos): 🔴 Título (n) + itens, sem negrito. */
function subsection(emoji: string, title: string, items: string[], max = 8): string[] {
  if (!items.length) return [];
  return [`${emoji} ${title} (${items.length})`, ...list(items, max)];
}

const link = (label: string, path: string) => `${label}: ${config.appUrl}${path}`;

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const num = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "venceu 25/09" · "hoje" · "amanhã" · "ter 29/09" · "sem prazo" */
export function dueText(due: Date | null, now: Date): string {
  if (!due) return 'sem prazo';
  const d = daysUntil(due, now);
  if (d < 0) return `venceu ${ddmm(due)}`;
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  return weekdayDdmm(due);
}

function taskItem(t: TaskInfo, now: Date, people?: Map<string, string>): string {
  const who = people ? ` · ${names(t.assignees, people)}` : '';
  return `${clean(t.title, 70)} — ${dueText(t.dueDate, now)}${who}`;
}

const byDue = (a: TaskInfo, b: TaskInfo) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
const byEnd = (a: GanttInfo, b: GanttInfo) => (a.end?.getTime() ?? Infinity) - (b.end?.getTime() ?? Infinity);

// ---------------------------------------------------------------- KPIs (helpers)

const KPI_GROUPS: Array<{ status: string; label: string; emoji: string }> = [
  { status: 'Atrasado', label: 'Atrasados', emoji: '🔴' },
  { status: 'Em Risco', label: 'Em risco', emoji: '🟡' },
  { status: 'Em Andamento', label: 'Em andamento', emoji: '▶️' },
  { status: 'Concluído', label: 'Concluídos', emoji: '✅' },
];
const KPI_ORDER = KPI_GROUPS.map((g) => g.status);
const COMPARATOR: Record<string, string> = { '>=': '≥', '<=': '≤', '=': '=' };

function kpiValue(k: KpiInfo): string {
  const unit = k.targetUnit ? ` ${clean(k.targetUnit, 20).toLowerCase()}` : '';
  return `${num(k.currentValue)} de ${COMPARATOR[k.targetComparator] ?? ''}${num(k.targetValue)}${unit}`;
}

function kpiSummary(kpis: KpiInfo[]) {
  const done = kpis.filter((k) => k.status === 'Concluído').length;
  const avg = kpis.length ? Math.round(kpis.reduce((s, k) => s + kpiProgress(k), 0) / kpis.length) : 0;
  return { done, avg };
}

// ================================================================ AUTOMÁTICAS

// ---------------------------------------------------------------- Alerta de prazos (diário)

export interface DeadlineItem {
  task: TaskInfo;
  days: number;
  bucket: string; // 'overdue' | 'd0' | 'd1' | 'dN'
}

function bucketTitle(bucket: string): { title: string; emoji: string } {
  if (bucket === 'overdue') return { title: 'Atrasadas', emoji: '🔴' };
  const n = Number(bucket.slice(1));
  if (n === 0) return { title: 'Vencem hoje', emoji: '🟡' };
  if (n === 1) return { title: 'Vencem amanhã', emoji: '🟡' };
  return { title: `Vencem em até ${n} dias`, emoji: '' };
}

const bucketOrder = (b: string) => (b === 'overdue' ? -1 : Number(b.slice(1)));

export function deadlineAlertMessage(project: { id: string; name: string }, items: DeadlineItem[], people: Map<string, string>, now: Date): string {
  const buckets = [...new Set(items.map((i) => i.bucket))].sort((a, b) => bucketOrder(a) - bucketOrder(b));
  const sections = buckets.map((b) => {
    const { title, emoji } = bucketTitle(b);
    const rows = items
      .filter((i) => i.bucket === b)
      .sort((x, y) => byDue(x.task, y.task))
      .map((i) => taskItem(i.task, now, people));
    return section(title, rows, 15, emoji);
  });
  return compose(
    header('⏰', 'Prazos do Kanban', project.name, plural(items.length, 'tarefa precisa de atenção', 'tarefas precisam de atenção')),
    ...sections,
    link('Abrir Kanban', `/project/${project.id}/kanban`),
  );
}

// ---------------------------------------------------------------- Resumo semanal

export type Health = 'ok' | 'attention' | 'critical';

export interface WeeklyData {
  project: { id: string; name: string; targetEventName?: string; targetDate: Date | null };
  weekStart: Date;
  weekEnd: Date;
  health: Health;
  healthReasons: string[];
  /** Colunas do Kanban na ordem do quadro, com a contagem de tarefas. */
  columns: Array<{ name: string; done: boolean; count: number }>;
  kanbanTotal: number;
  kanbanDone: number;
  completedThisWeek: number;
  gantt: GanttInfo[];
  kpis: KpiInfo[];
  lateKanban: TaskInfo[];
  lateGantt: GanttInfo[];
  soonKanban: TaskInfo[];
  soonGantt: GanttInfo[];
  /** null = projeto sem transações (bloco some). */
  balance: number | null;
  people: Map<string, string>;
  now: Date;
}

const HEALTH_TEXT: Record<Health, string> = { ok: '🟢 No prazo', attention: '🟡 Atenção', critical: '🔴 Crítico' };
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Item de prazo geral: "_Kanban_ título — venceu 14/09 · Heitor" / "_Gantt_ título — sex 02/10 · ENGINEERING". */
type DeadlineRow = { date: Date; text: string };
function kanbanRow(t: TaskInfo, now: Date, people: Map<string, string>): DeadlineRow {
  const who = t.assignees.length ? ` · ${names(t.assignees, people)}` : '';
  return { date: t.dueDate!, text: `_Kanban_ ${clean(t.title, 60)} — ${dueText(t.dueDate, now)}${who}` };
}
function ganttRow(g: GanttInfo, now: Date): DeadlineRow {
  return { date: g.end!, text: `_Gantt_ ${clean(g.title, 60)} — ${dueText(g.end, now)}${g.section ? ` · ${clean(g.section, 25)}` : ''}` };
}
const rows = (r: DeadlineRow[]) => r.sort((a, b) => a.date.getTime() - b.date.getTime()).map((x) => x.text);

/**
 * Resumo semanal. Ordem fixa dos blocos:
 *   status → 📋 Kanban → 🗓️ Gantt → 📈 KPIs → ⏰ Prazos (atrasados/próximos, geral) → 💰 saldo + 🏁 dias restantes → link
 */
export function weeklyReportMessage(d: WeeklyData): string {
  const status = [`*Status:* ${HEALTH_TEXT[d.health]}`, d.healthReasons.length ? `_${d.healthReasons.join(' · ')}_` : '_Nada atrasado._'];

  // 📋 Kanban: contagem por coluna + concluídas na semana + progresso
  const kanban = d.kanbanTotal
    ? [
        '*📋 KANBAN*',
        `- ${d.columns.map((c) => `${clean(c.name, 20)}: *${c.count}*`).join(' · ')}`,
        `- Concluídas na semana: *${d.completedThisWeek}*`,
        `- Progresso: *${d.kanbanDone} de ${d.kanbanTotal}* (${pctOf(d.kanbanDone, d.kanbanTotal)}%)`,
      ]
    : null;

  // 🗓️ Gantt: total + uma linha por seção
  let gantt: string[] | null = null;
  if (d.gantt.length) {
    const done = d.gantt.filter((g) => g.done).length;
    const bySection = new Map<string, GanttInfo[]>();
    for (const g of d.gantt) bySection.set(g.section, [...(bySection.get(g.section) ?? []), g]);
    const sections = [...bySection.entries()]
      .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, 'pt-BR')))
      .map(([name, items]) => {
        const avg = Math.round(items.reduce((s, g) => s + g.progress, 0) / items.length);
        const lateN = items.filter((g) => d.lateGantt.includes(g)).length;
        return `- ${clean(name || 'Sem seção', 30)}: ${items.filter((g) => g.done).length}/${items.length} · ${avg}%${lateN ? ` · ${plural(lateN, 'atrasada', 'atrasadas')}` : ''}`;
      });
    gantt = ['*🗓️ GANTT*', `_${done} de ${d.gantt.length} atividades concluídas (${pctOf(done, d.gantt.length)}%)_`, ...sections];
  }

  // 📈 KPIs: resumo + os que precisam de atenção
  let kpis: string[] | null = null;
  if (d.kpis.length) {
    const { done, avg } = kpiSummary(d.kpis);
    const open = d.kpis
      .filter((k) => k.status !== 'Concluído')
      .sort((a, b) => KPI_ORDER.indexOf(a.status) - KPI_ORDER.indexOf(b.status) || kpiProgress(a) - kpiProgress(b))
      .map((k) => `${clean(k.name, 55)} — ${kpiProgress(k)}% · ${k.status.toLowerCase()}`);
    kpis = ['*📈 KPIs*', `_${done} de ${d.kpis.length} concluídos · média ${avg}% da meta_`, ...list(open, 4)];
  }

  // ⏰ Prazos gerais (Kanban + Gantt juntos, por data)
  const late = rows([...d.lateKanban.map((t) => kanbanRow(t, d.now, d.people)), ...d.lateGantt.map((g) => ganttRow(g, d.now))]);
  const soon = rows([...d.soonKanban.map((t) => kanbanRow(t, d.now, d.people)), ...d.soonGantt.map((g) => ganttRow(g, d.now))]);
  const deadlines =
    late.length || soon.length
      ? ['*⏰ PRAZOS*', ...subsection('🔴', 'Atrasados', late, 6), ...subsection('🟡', 'Próximos 7 dias', soon, 6)]
      : ['*⏰ PRAZOS*', 'Nada atrasado ou vencendo. ✅'];

  // 💰 saldo + 🏁 dias restantes
  const footer: string[] = [];
  if (d.balance !== null) footer.push(`*💰 Saldo:* ${brl(d.balance)}`);
  if (d.project.targetDate) {
    const days = daysUntil(d.project.targetDate, d.now);
    const event = d.project.targetEventName ? clean(d.project.targetEventName, 40) : 'Evento';
    if (days >= 0) footer.push(`*🏁 ${event}:* faltam ${plural(days, 'dia', 'dias')} (${ddmmyyyy(d.project.targetDate)})`);
  }

  return compose(
    header('📊', 'Resumo semanal', d.project.name, `Semana de ${ddmm(d.weekStart)} a ${ddmm(d.weekEnd)}`),
    status,
    kanban,
    gantt,
    kpis,
    deadlines,
    footer,
    link('Ver painel', `/project/${d.project.id}`),
  );
}

// ================================================================ COMANDOS

// ---------------------------------------------------------------- /kpis

export function kpiPanelMessage(project: { id: string; name: string }, kpis: KpiInfo[], filter?: string): string {
  if (!kpis.length) {
    return compose(
      header('📈', 'KPIs', project.name),
      filter ? `Nenhum KPI encontrado para "${clean(filter, 40)}".` : 'Nenhum KPI cadastrado ainda.',
      link('Ver KPIs', `/project/${project.id}/kpis`),
    );
  }
  const { done, avg } = kpiSummary(kpis);
  const groups = KPI_GROUPS.map(({ status, label, emoji }) => {
    const items = kpis.filter((k) => k.status === status).sort((a, b) => kpiProgress(a) - kpiProgress(b));
    if (status === 'Concluído') return section(label, items.map((k) => clean(k.name, 60)), 8, emoji);
    return section(
      label,
      items.map((k) => `*${clean(k.name, 60)}*\n  ${kpiProgress(k)}% · ${kpiValue(k)}${k.deadline ? ` · prazo ${ddmm(k.deadline)}` : ''}`),
      8,
      emoji,
    );
  });
  const others = kpis.filter((k) => !KPI_ORDER.includes(k.status));
  return compose(
    header('📈', 'KPIs', project.name, `${done} de ${kpis.length} concluídos · média ${avg}% da meta${filter ? ` · filtro: ${clean(filter, 30)}` : ''}`),
    ...groups,
    section('Outros', others.map((k) => `${clean(k.name, 60)} — ${kpiProgress(k)}%`)),
    link('Ver KPIs', `/project/${project.id}/kpis`),
  );
}

// ---------------------------------------------------------------- /tarefas (Kanban por coluna)

export interface KanbanColumn {
  id: string;
  name: string;
  done: boolean;
  tasks: TaskInfo[];
}

/** Lista numerada: "3. Título — prazo · responsável". Máx. N itens + "e mais". */
function numbered(tasks: TaskInfo[], render: (t: TaskInfo) => string, max: number): string[] {
  const rows = tasks.slice(0, max).map((t) => `${t.number}. ${render(t)}`);
  if (tasks.length > max) rows.push(`_e mais ${tasks.length - max}_`);
  return rows;
}

/**
 * Kanban dividido pelas colunas do projeto, na ordem do quadro.
 * Na coluna de concluídas não aparece "venceu": a tarefa acabou, o prazo não importa mais.
 * `fullColumn` = mostrar todas as tarefas (quando o filtro é o nome de uma coluna).
 */
export function kanbanMessage(
  project: { id: string; name: string },
  columns: KanbanColumn[],
  people: Map<string, string>,
  now: Date,
  opts: { filter?: string; fullColumn?: boolean } = {},
): string {
  const kanban = link('Abrir Kanban', `/project/${project.id}/kanban`);
  const all = columns.flatMap((c) => c.tasks);
  if (!all.length) {
    return compose(
      header('📋', 'Kanban', project.name),
      opts.filter ? `Nenhuma tarefa encontrada para "${clean(opts.filter, 40)}".` : 'Nenhuma tarefa no Kanban.',
      kanban,
    );
  }

  const open = columns.filter((c) => !c.done).flatMap((c) => c.tasks);
  const overdue = open.filter((t) => t.dueDate && daysUntil(t.dueDate, now) < 0).length;
  const doneCount = columns.filter((c) => c.done).reduce((s, c) => s + c.tasks.length, 0);
  const subtitle = opts.fullColumn
    ? plural(all.length, 'tarefa', 'tarefas')
    : [`${open.length} em aberto`, overdue ? `${overdue} atrasadas` : '', `${doneCount} feitas`, opts.filter ? `filtro: ${clean(opts.filter, 30)}` : '']
        .filter(Boolean)
        .join(' · ');

  // Sem responsável não aparece nada, para não poluir cada linha
  const who = (t: TaskInfo) => (t.assignees.length ? ` · ${names(t.assignees, people)}` : '');
  const blocks = columns.map((c) => {
    if (!c.tasks.length) return null;
    if (c.done) {
      // Concluídas sem prazo. Visão geral: só as 5 mais recentes. Coluna completa: ordem do quadro.
      const recent = opts.fullColumn ? c.tasks : [...c.tasks].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      const max = opts.fullColumn ? 30 : 5;
      return [
        `*✅ ${clean(c.name, 40)} (${c.tasks.length})*`,
        !opts.fullColumn && c.tasks.length > max ? '_mais recentes:_' : '',
        ...numbered(recent, (t) => `${clean(t.title, 70)}${who(t)}`, max),
      ];
    }
    const max = opts.fullColumn ? 30 : 10;
    return [`*${clean(c.name, 40)} (${c.tasks.length})*`, ...numbered(c.tasks, (t) => `${clean(t.title, 70)} — ${dueText(t.dueDate, now)}${who(t)}`, max)];
  });

  return compose(header('📋', 'Kanban', project.name, subtitle), ...blocks, '_Mover: /mover 3 feito_', kanban);
}

/** Resposta do /criartarefa: 2 linhas (confirmação + detalhes). */
export function createTaskResultMessage(t: {
  number: number | null;
  title: string;
  column: string;
  start: Date;
  due: Date | null;
  assignees: string[];
  people: Map<string, string>;
}): string {
  const details = [
    `início ${ddmm(t.start)}`,
    t.due ? `entrega ${weekdayDdmm(t.due)}` : 'sem entrega',
    t.assignees.length ? names(t.assignees, t.people) : 'sem responsável',
  ].join(' · ');
  const num = t.number ? `#${t.number} ` : '';
  return `✅ Tarefa ${num}criada em *${clean(t.column, 40).toUpperCase()}*: ${clean(t.title, 80)}\n_${details}_`;
}

export function createTaskErrorMessage(
  reason: 'usage' | 'title' | 'date' | 'order' | 'column' | 'person' | 'ambiguousPerson' | 'unknown' | 'noBoards' | 'disabled',
  detail = '',
): string {
  switch (reason) {
    case 'usage':
      return [
        'Use: */criartarefa título; entrega; coluna; responsável*',
        '_Ex.: /criartarefa Imprimir peças; 05/10; fazendo; heitor_',
        '_Só o título é obrigatório. Início padrão: hoje. Coluna padrão: a primeira._',
      ].join('\n');
    case 'title':
      return 'Título muito longo (máx. 199 caracteres).';
    case 'date':
      return `Não entendi a data "${clean(detail, 30)}". Use 05/10, 05/10/2026, hoje, amanhã, sexta ou +3.`;
    case 'order':
      return `A entrega é antes do início (${detail}).`;
    case 'column':
      return `Coluna não encontrada. Colunas: ${detail}.`;
    case 'person':
      return `Não achei no projeto: ${clean(detail, 60)}.`;
    case 'ambiguousPerson':
      return `Mais de uma pessoa com "${clean(detail, 40)}". Use o nome e sobrenome.`;
    case 'unknown':
      return `Não entendi "${clean(detail, 40)}". Separe os campos com ; — ex.: */criartarefa Título; 05/10; fazendo; heitor*`;
    case 'noBoards':
      return 'O Kanban não tem colunas ainda. Crie uma coluna na plataforma primeiro.';
    case 'disabled':
      return 'Criar tarefas pelo WhatsApp está desativado.';
  }
}

/** Resposta curta do /mover: uma linha só. */
export function moveResultMessage(moved: TaskInfo[], targetName: string, skipped: TaskInfo[]): string {
  const col = `*${clean(targetName, 40).toUpperCase()}*`;
  const parts: string[] = [];
  if (moved.length === 1) parts.push(`✅ ${clean(moved[0].title, 60)} → ${col}`);
  else if (moved.length > 1) parts.push(`✅ ${moved.length} tarefas → ${col}: ${moved.map((t) => `${t.number}`).join(', ')}`);
  if (skipped.length) parts.push(`${skipped.map((t) => t.number).join(', ')} já ${skipped.length === 1 ? 'estava' : 'estavam'} em ${col}`);
  return parts.join(' · ');
}

export function moveErrorMessage(reason: 'usage' | 'column' | 'task' | 'ambiguous' | 'disabled', detail = ''): string {
  switch (reason) {
    case 'usage':
      return 'Use: */mover 3 feito* (número da tarefa no /tarefas + coluna).';
    case 'column':
      return `Coluna não encontrada. Colunas: ${detail}.`;
    case 'task':
      return `Não achei a tarefa ${detail}. Veja os números em */tarefas*.`;
    case 'ambiguous':
      return `Mais de uma tarefa com "${clean(detail, 30)}". Use o número: */tarefas*.`;
    case 'disabled':
      return 'Mover tarefas pelo WhatsApp está desativado.';
  }
}

// ---------------------------------------------------------------- /gantt <seção>

function ganttPeriod(g: GanttInfo): string {
  if (g.start && g.end) return ddmm(g.start) === ddmm(g.end) ? `em ${ddmm(g.start)}` : `${ddmm(g.start)} a ${ddmm(g.end)}`;
  return g.end ? `até ${ddmm(g.end)}` : 'sem datas';
}

export function ganttSectionsMessage(project: { id: string; name: string }, sections: Array<{ name: string; count: number }>, notFound?: string): string {
  if (!sections.length) {
    return compose(header('🗓️', 'Gantt', project.name), 'Nenhuma atividade cadastrada no Gantt.', link('Ver Gantt', `/project/${project.id}/gantt`));
  }
  const example = [...sections].filter((s) => s.name).sort((a, b) => b.count - a.count)[0]?.name.toLowerCase() ?? 'engenharia';
  return compose(
    header('🗓️', 'Gantt', project.name, notFound ? `Não encontrei a seção "${clean(notFound, 40)}".` : 'Informe a seção que deseja ver.'),
    section('Seções', sections.map((s) => `${s.name || 'Sem seção'} — ${plural(s.count, 'atividade', 'atividades')}`), 15),
    `Exemplo: */gantt ${example}*`,
  );
}

export function ganttSectionMessage(project: { id: string; name: string }, sectionName: string, items: GanttInfo[], people: Map<string, string>, now: Date): string {
  const day = (d: Date | null) => (d ? daysUntil(d, now) : null);
  const done = items.filter((g) => g.done);
  const open = items.filter((g) => !g.done);
  const late = open.filter((g) => (day(g.end) ?? 1) < 0).sort(byEnd);
  const running = open.filter((g) => !late.includes(g) && (day(g.start) ?? 0) <= 0).sort(byEnd);
  const upcoming = open.filter((g) => !late.includes(g) && !running.includes(g)).sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

  const who = (g: GanttInfo) => (g.assignees.length ? ` · ${names(g.assignees, people)}` : '');
  const avg = items.length ? Math.round(items.reduce((s, g) => s + g.progress, 0) / items.length) : 0;

  return compose(
    header('🗓️', `Gantt ${sectionName || 'Sem seção'}`, project.name, `${plural(items.length, 'atividade', 'atividades')} · ${done.length} concluídas · média ${avg}%`),
    section('Atrasadas', late.map((g) => `${clean(g.title, 70)} — venceu ${ddmm(g.end!)} · ${g.progress}%${who(g)}`), 10, '🔴'),
    section('Em andamento', running.map((g) => `${clean(g.title, 70)} — até ${g.end ? ddmm(g.end) : '-'} · ${g.progress}%${who(g)}`), 10, '▶️'),
    section('A iniciar', upcoming.map((g) => `${clean(g.title, 70)} — ${ganttPeriod(g)}${who(g)}`), 8, '⏳'),
    section('Concluídas', done.map((g) => clean(g.title, 70)), 6, '✅'),
    link('Ver Gantt', `/project/${project.id}/gantt`),
  );
}

// ---------------------------------------------------------------- /prazos (Kanban + Gantt)

export function deadlinesMessage(
  project: { id: string; name: string },
  kanbanPending: TaskInfo[],
  ganttOpen: GanttInfo[],
  people: Map<string, string>,
  now: Date,
  windowDays: number,
): string {
  const inWindow = (d: number) => d >= 0 && d <= windowDays;

  const kTasks = kanbanPending.filter((t) => t.dueDate).map((t) => ({ t, d: daysUntil(t.dueDate!, now) }));
  const kLate = kTasks.filter((x) => x.d < 0).map((x) => x.t).sort(byDue);
  const kSoon = kTasks.filter((x) => inWindow(x.d)).map((x) => x.t).sort(byDue);

  const gTasks = ganttOpen.filter((g) => g.end).map((g) => ({ g, d: daysUntil(g.end!, now) }));
  const gLate = gTasks.filter((x) => x.d < 0).map((x) => x.g).sort(byEnd);
  const gSoon = gTasks.filter((x) => inWindow(x.d)).map((x) => x.g).sort(byEnd);

  const ganttItem = (g: GanttInfo) => `${clean(g.title, 60)} — ${dueText(g.end, now)} · ${g.progress}%${g.section ? ` · ${clean(g.section, 25)}` : ''}`;

  const block = (emoji: string, title: string, late: string[], soon: string[]) => [
    `${emoji} *${title}*`,
    ...(late.length || soon.length
      ? [...subsection('🔴', 'Atrasadas', late), ...subsection('🟡', `Próximos ${windowDays} dias`, soon)]
      : ['Nada atrasado ou vencendo. ✅']),
  ];

  return compose(
    header('⏰', 'Prazos', project.name, `Atrasados e próximos ${windowDays} dias`),
    block('📋', 'KANBAN', kLate.map((t) => taskItem(t, now, people)), kSoon.map((t) => taskItem(t, now, people))),
    block('🗓️', 'GANTT', gLate.map(ganttItem), gSoon.map(ganttItem)),
    link('Abrir Kanban', `/project/${project.id}/kanban`),
  );
}

// ---------------------------------------------------------------- /calendario

/**
 * Calendário do projeto: 7 dias atrás até 14 dias à frente, agrupado por dia.
 * Blocos: *Últimos 7 dias* · *Hoje* · *Próximas 2 semanas*. Dias sem evento não aparecem.
 */
export function calendarMessage(
  project: { id: string; name: string },
  events: CalendarEvent[],
  people: Map<string, string>,
  now: Date,
  range: { before: number; after: number },
): string {
  const inRange = events.filter((e) => {
    const d = daysUntil(e.date, now);
    return d >= -range.before && d <= range.after;
  });
  const from = new Date(now.getTime() - range.before * 86_400_000);
  const to = new Date(now.getTime() + range.after * 86_400_000);
  const pageLink = link('Ver calendário', `/project/${project.id}/calendar`);
  const subtitle = `${ddmm(from)} a ${ddmm(to)} · ${plural(inRange.length, 'evento', 'eventos')}`;

  if (!inRange.length) return compose(header('📅', 'Calendário', project.name, subtitle), 'Nenhum evento no período.', pageLink);

  const item = (e: CalendarEvent) => {
    if (e.kind === 'document') {
      // Nome do documento sem emoji no começo (ex.: "🎥CALENDÁRIO DE PUBLICAÇÃO")
      const origin = clean(e.origin || 'documento', 30).replace(/^[^\p{L}\p{N}]+/u, '');
      return `- ${clean(e.title, 70)} · _${origin}_`;
    }
    const who = e.assignees.length ? ` · ${names(e.assignees, people)}` : '';
    return `- ${e.done ? '✅ ' : ''}${clean(e.title, 70)}${who}`;
  };

  /** Agrupa por dia: linha do dia em itálico + itens. Máx. de itens por bloco para não virar um livro. */
  const byDay = (list: CalendarEvent[], maxItems: number): string[] => {
    const out: string[] = [];
    let shown = 0;
    let lastDay = '';
    for (const e of list) {
      if (shown >= maxItems) break;
      const day = weekdayDdmm(e.date);
      if (day !== lastDay) {
        out.push(`_${day}_`);
        lastDay = day;
      }
      out.push(item(e));
      shown++;
    }
    if (list.length > shown) out.push(`_e mais ${list.length - shown}_`);
    return out;
  };

  const past = inRange.filter((e) => daysUntil(e.date, now) < 0);
  const today = inRange.filter((e) => daysUntil(e.date, now) === 0);
  const next = inRange.filter((e) => daysUntil(e.date, now) > 0);

  return compose(
    header('📅', 'Calendário', project.name, subtitle),
    past.length ? [`*Últimos ${range.before} dias (${past.length})*`, ...byDay(past, 10)] : null,
    today.length ? [`*Hoje (${today.length})*`, ...today.map(item)] : null,
    next.length ? [`*Próximas ${Math.round(range.after / 7)} semanas (${next.length})*`, ...byDay(next, 20)] : null,
    pageLink,
  );
}

// ---------------------------------------------------------------- /financeiro

export function financeMessage(project: { id: string; name: string }, f: FinanceSummary, now: Date): string {
  const p = zonedParts(now);
  const month = `${MONTHS[p.month - 1]} de ${p.year}`;
  const pageLink = link('Ver financeiro', `/project/${project.id}/finance`);
  if (!f.transactions) return compose(header('💰', 'Financeiro', project.name), 'Nenhuma transação registrada ainda.', pageLink);

  const sectors = f.expenseBySector.map((s) => `${clean(s.name, 40)} — ${brl(s.value)} (${f.totalExpense ? Math.round((s.value / f.totalExpense) * 100) : 0}%)`);

  return compose(
    header('💰', 'Financeiro', project.name, `Atualizado em ${ddmm(now)}`),
    `*Saldo atual:* ${brl(f.balance)}`,
    [`*Mês de ${month}*`, `- Entradas: ${brl(f.monthIncome)}`, `- Despesas: ${brl(f.monthExpense)}`],
    f.expenseBySector.length ? [`*Gasto por setor* · total ${brl(f.totalExpense)}`, ...list(sectors, 10)] : null,
    pageLink,
  );
}

// ---------------------------------------------------------------- /ajuda e erros

export function helpMessage(windowDays: number): string {
  return compose(
    ['*🤖 Comandos do IBIT*', '_Envie no grupo:_'],
    [
      '*/kpis* — painel de KPIs',
      '*/tarefas* — Kanban dividido por coluna',
      '*/criartarefa título; entrega; coluna; responsável* — cria tarefa',
      '*/mover nº coluna* — muda tarefa de coluna',
      '*/gantt seção* — atividades do Gantt de uma área',
      `*/prazos* — atrasados e próximos ${windowDays} dias (Kanban e Gantt)`,
      '*/calendario* — semana passada e próximas 2 semanas',
      '*/financeiro* — saldo, mês atual e gasto por setor',
      '*/ajuda* — esta lista',
    ],
    ['*Exemplos*', '- /criartarefa Imprimir peças; 05/10; fazendo; heitor', '- /criartarefa Revisar texto; inicio 01/10; entrega sexta', '- /tarefas heitor', '- /mover 3 feito', '- /mover 2 5 fazendo', '- /gantt engenharia', '- /prazos 14'],
    '_Funciona no grupo e no privado. Automático: alerta de prazos todo dia e resumo toda semana no grupo._',
  );
}

export function unknownCommandMessage(cmd: string): string {
  return `Não conheço o comando *${clean(cmd, 30)}*. Envie */ajuda* para ver a lista.`;
}

export function commandErrorMessage(): string {
  return 'Não consegui buscar os dados agora. Tente de novo em alguns minutos.';
}
