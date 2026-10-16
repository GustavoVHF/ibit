import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { toDate, zonedParts } from './dates.js';

/** Leitura dos dados de um projeto IBIT no Firestore (mesmas coleções da plataforma). */

export interface ProjectInfo {
  id: string;
  name: string;
  ownerId: string;
  shortId?: string;
  members: string[];
  targetEventName?: string;
  targetDate: Date | null;
}

export interface BoardInfo {
  id: string;
  name: string;
  order: number;
}

export interface TaskInfo {
  id: string;
  /** Número de exibição no /tarefas e usado no /mover. */
  number: number;
  title: string;
  boardId: string;
  boardName: string;
  order: number;
  assignees: string[];
  dueDate: Date | null;
  updatedAt: Date | null;
  createdAt: Date | null;
  done: boolean;
}

export interface KpiInfo {
  id: string;
  name: string;
  sector: string;
  targetComparator: '>=' | '<=' | '=';
  targetValue: number;
  targetUnit?: string;
  currentValue: number;
  deadline: Date | null;
  status: 'Concluído' | 'Em Andamento' | 'Em Risco' | 'Atrasado' | string;
  responsible?: string;
}

type RawDoc = { id: string } & Record<string, any>;

async function byProject(collection: string, projectId: string): Promise<RawDoc[]> {
  const snap = await db.collection(collection).where('projectId', '==', projectId).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function getProject(projectId: string): Promise<ProjectInfo | null> {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, any>;
  return {
    id: snap.id,
    name: d.name ?? 'Projeto',
    ownerId: String(d.ownerId ?? ''),
    shortId: d.shortId,
    members: Array.isArray(d.members) ? d.members : [],
    targetEventName: d.targetEventName,
    targetDate: toDate(d.targetDate),
  };
}

export async function listProjects(): Promise<Array<{ id: string; name: string; shortId?: string; members: number }>> {
  const snap = await db.collection('projects').get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { id: d.id, name: x.name ?? '', shortId: x.shortId, members: Array.isArray(x.members) ? x.members.length : 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Mapa uid → nome dos membros (consulta em lotes de 30, limite do operador "in"). */
export async function getMemberNames(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(uids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await db.collection('users').where(FieldPath.documentId(), 'in', chunk).get();
    snap.docs.forEach((d) => names.set(d.id, (d.data().name as string) || (d.data().email as string) || 'Membro'));
  }
  return names;
}

const DONE_COLUMN = /\b(feito|feitos|conclu[ií]d[oa]s?|done|finalizad[oa]s?|entregue)\b/i;

/**
 * Colunas + tarefas. A coluna define a situação da tarefa:
 *  - "concluída" = coluna cujo nome é FEITO/CONCLUÍDO/DONE; sem nome assim, a última por `order`
 *    (mesma regra do ProjectDashboard). Com 1 coluna só, nada está concluído.
 *  - Tarefa concluída nunca conta como atrasada, mesmo com prazo vencido.
 * `number` = número fixo de exibição (ordem das colunas → ordem no quadro), usado no /mover.
 */
export async function getBoardsAndTasks(projectId: string): Promise<{ boards: BoardInfo[]; tasks: TaskInfo[]; doneBoardId: string | null }> {
  const [boardsRaw, tasksRaw] = await Promise.all([byProject('boards', projectId), byProject('tasks', projectId)]);
  const boards: BoardInfo[] = boardsRaw
    .map((b) => ({ id: b.id, name: String(b.name ?? ''), order: Number(b.order ?? 0) }))
    .sort((a, b) => a.order - b.order);
  const byName = boards.filter((b) => DONE_COLUMN.test(b.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  const doneBoardId = boards.length < 2 ? null : (byName[byName.length - 1] ?? boards[boards.length - 1]).id;
  const boardIndex = new Map(boards.map((b, i) => [b.id, i]));
  const boardName = new Map(boards.map((b) => [b.id, b.name]));

  const tasks: TaskInfo[] = tasksRaw
    .map((t) => {
      const assignees: string[] = Array.isArray(t.assignedTo) ? t.assignedTo : t.assignedTo ? [t.assignedTo] : [];
      return {
        id: t.id,
        number: 0,
        title: String(t.title ?? 'Sem título'),
        boardId: t.boardId,
        boardName: boardName.get(t.boardId) ?? '',
        order: Number(t.order ?? 0),
        assignees: assignees.filter(Boolean),
        dueDate: toDate(t.dueDate),
        updatedAt: toDate(t.updatedAt),
        createdAt: toDate(t.createdAt),
        done: doneBoardId !== null && t.boardId === doneBoardId,
      };
    })
    .sort(
      (a, b) =>
        (boardIndex.get(a.boardId) ?? 999) - (boardIndex.get(b.boardId) ?? 999) ||
        a.order - b.order ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id),
    );
  tasks.forEach((t, i) => (t.number = i + 1));

  return { boards, tasks, doneBoardId };
}

/**
 * Cria tarefa no Kanban com os mesmos campos da plataforma (ProjectBoard + TaskDetailsModal),
 * válidos pela regra isValidTask do firestore.rules. Vai para o fim da coluna.
 * ownerId = dono do projeto (o WhatsApp não sabe qual usuário da plataforma mandou).
 * Registra no Histórico de Mudanças.
 */
export async function createTask(
  project: ProjectInfo,
  input: { title: string; board: BoardInfo; startDate: Date; dueDate: Date | null; assignees: string[] },
  allTasks: TaskInfo[],
  actorName: string,
): Promise<string> {
  const order = allTasks.filter((t) => t.boardId === input.board.id).length;
  const ref = db.collection('tasks').doc();
  const batch = db.batch();
  batch.set(ref, {
    projectId: project.id,
    boardId: input.board.id,
    title: input.title,
    order,
    assignedTo: input.assignees,
    startDate: input.startDate,
    dueDate: input.dueDate,
    ownerId: project.ownerId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('changeHistory').doc(), {
    projectId: project.id,
    origin: 'auto',
    source: 'Kanban',
    title: `Nova tarefa: ${input.title}`,
    description: `Criada em "${input.board.name}" pelo WhatsApp`,
    requestedBy: 'whatsapp-bot',
    requestedByName: actorName,
    impactDays: 0,
    impactAmount: 0,
    status: 'Registrado',
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

/**
 * Move tarefas para outra coluna, como o arrastar do Kanban: boardId + order (vai para o fim da coluna)
 * + updatedAt, e registra no Histórico de Mudanças (source "Kanban").
 */
export async function moveTasks(
  projectId: string,
  tasks: TaskInfo[],
  target: BoardInfo,
  allTasks: TaskInfo[],
  actorName: string,
): Promise<void> {
  const batch = db.batch();
  let nextOrder = Math.max(-1, ...allTasks.filter((t) => t.boardId === target.id).map((t) => t.order)) + 1;
  for (const t of tasks) {
    batch.update(db.collection('tasks').doc(t.id), { boardId: target.id, order: nextOrder++, updatedAt: FieldValue.serverTimestamp() });
    batch.set(db.collection('changeHistory').doc(), {
      projectId,
      origin: 'auto',
      source: 'Kanban',
      title: `Tarefa "${t.title}" mudou de status`,
      description: `Movida de "${t.boardName || 'coluna anterior'}" para "${target.name}" pelo WhatsApp`,
      requestedBy: 'whatsapp-bot',
      requestedByName: actorName,
      impactDays: 0,
      impactAmount: 0,
      status: 'Registrado',
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function getKpis(projectId: string): Promise<KpiInfo[]> {
  const raw = await byProject('projectKPIs', projectId);
  return raw.map((k) => ({
    id: k.id,
    name: String(k.name ?? 'KPI'),
    sector: String(k.sector ?? ''),
    targetComparator: (k.targetComparator ?? '>=') as KpiInfo['targetComparator'],
    targetValue: Number(k.targetValue ?? 0),
    targetUnit: k.targetUnit,
    currentValue: Number(k.currentValue ?? 0),
    deadline: toDate(k.deadline),
    status: String(k.status ?? 'Em Andamento'),
    responsible: k.responsible,
  }));
}

// ---------------------------------------------------------------- Gantt

export interface GanttInfo {
  id: string;
  title: string;
  /** Seção normalizada igual à tela do Gantt: trim + maiúsculas. '' = sem seção. */
  section: string;
  category?: string;
  assignees: string[]; // UIDs de membros ou IDs de projectStakeholders
  start: Date | null;
  end: Date | null;
  progress: number;
  done: boolean;
}

/**
 * O Gantt salva datas como "AAAA-MM-DD" à meia-noite UTC e a tela lê a data em UTC.
 * Converte para 12:00 UTC do mesmo dia, para não "voltar um dia" no fuso de Brasília.
 */
function ganttDay(value: any): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

export async function getGanttTasks(projectId: string): Promise<GanttInfo[]> {
  const raw = await byProject('ganttTasks', projectId);
  return raw
    .map((g) => {
      const progress = Math.max(0, Math.min(100, Number(g.progress ?? 0)));
      return {
        id: g.id,
        title: String(g.title ?? 'Sem título'),
        section: String(g.section ?? '').trim().toUpperCase(),
        category: g.category,
        assignees: Array.isArray(g.assignedTo) ? g.assignedTo.filter(Boolean) : [],
        start: ganttDay(g.startDate),
        end: ganttDay(g.endDate),
        progress,
        // O campo status nem sempre é atualizado na tela; o progresso é a fonte confiável.
        done: progress >= 100 || g.status === 'completed',
        order: Number(g.order ?? 0),
      };
    })
    .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) || a.order - b.order)
    .map(({ order: _order, ...g }) => g);
}

/** Nomes de membros (users) e stakeholders externos, usados como responsáveis no Gantt. */
export async function getPeopleNames(projectId: string, uids: string[]): Promise<Map<string, string>> {
  const [members, stakeholders] = await Promise.all([getMemberNames(uids), byProject('projectStakeholders', projectId)]);
  for (const s of stakeholders) {
    if (s.name && !members.has(s.id)) members.set(s.id, String(s.name));
  }
  return members;
}

// ---------------------------------------------------------------- Calendário

export interface CalendarEvent {
  date: Date;
  title: string;
  kind: 'task' | 'document';
  /** Tarefa do Kanban já na coluna de concluídas. */
  done: boolean;
  assignees: string[];
  /** Coluna (tarefa) ou título do documento (evento de documento). */
  origin: string;
}

/**
 * Mesmas fontes da tela Calendário (Calendar.tsx):
 *  - tarefas do Kanban com dueDate
 *  - eventos sincronizados de documentos (assetDocuments.syncEvents: { title, date: "AAAA-MM-DD" })
 */
export async function getCalendarEvents(projectId: string): Promise<CalendarEvent[]> {
  const [{ tasks }, docs] = await Promise.all([getBoardsAndTasks(projectId), byProject('assetDocuments', projectId)]);
  const events: CalendarEvent[] = tasks
    .filter((t) => t.dueDate)
    .map((t) => ({ date: t.dueDate!, title: t.title, kind: 'task' as const, done: t.done, assignees: t.assignees, origin: t.boardName }));

  for (const d of docs) {
    if (!Array.isArray(d.syncEvents)) continue;
    for (const e of d.syncEvents) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e?.date ?? ''));
      if (!m) continue;
      events.push({
        // Meio-dia UTC = mesmo dia em Brasília (a tela usa T12:00 pelo mesmo motivo)
        date: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)),
        title: String(e.title || d.title || 'Evento'),
        kind: 'document',
        done: false,
        assignees: [],
        origin: String(d.title ?? ''),
      });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- Financeiro

export interface FinanceSummary {
  balance: number;
  monthIncome: number;
  monthExpense: number;
  /** Despesas por categoria (setor), total desde o início, maior primeiro. */
  expenseBySector: Array<{ name: string; value: number }>;
  totalExpense: number;
  transactions: number;
}

/**
 * Mesmos cálculos da tela Financeiro (ProjectFinance.tsx):
 * saldo ignora recursos externos; entradas/despesas do mês e gasto por categoria incluem todos.
 */
export async function getFinance(projectId: string, monthOf: { year: number; month: number }): Promise<FinanceSummary> {
  const raw = await byProject('transactions', projectId);
  let balance = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  const bySector = new Map<string, number>();

  for (const t of raw) {
    const amount = Number(t.amount ?? 0);
    const date = toDate(t.date);
    const parts = date ? zonedParts(date) : null;
    const inMonth = !!parts && parts.year === monthOf.year && parts.month === monthOf.month;
    if (t.type === 'income') {
      if (!t.isExternal) balance += amount;
      if (inMonth) monthIncome += amount;
    } else if (t.type === 'expense') {
      if (!t.isExternal) balance -= amount;
      if (inMonth) monthExpense += amount;
      const sector = String(t.category ?? '').trim() || 'Sem categoria';
      bySector.set(sector, (bySector.get(sector) ?? 0) + amount);
    }
  }

  const expenseBySector = [...bySector.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  return {
    balance,
    monthIncome,
    monthExpense,
    expenseBySector,
    totalExpense: expenseBySector.reduce((s, x) => s + x.value, 0),
    transactions: raw.length,
  };
}

/** Mesmo cálculo de kpiHelpers.computeProgress da plataforma. */
export function kpiProgress(k: Pick<KpiInfo, 'targetComparator' | 'targetValue' | 'currentValue'>): number {
  const { targetComparator, targetValue, currentValue } = k;
  if (targetValue === 0) return currentValue === 0 ? 100 : 0;
  let ratio: number;
  if (targetComparator === '>=') ratio = currentValue / targetValue;
  else if (targetComparator === '<=') ratio = currentValue === 0 ? 1 : targetValue / currentValue;
  else ratio = 1 - Math.abs(targetValue - currentValue) / Math.max(Math.abs(targetValue), 1);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
