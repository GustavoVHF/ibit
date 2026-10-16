import { config } from '../config.js';
import { daysUntil, ddmm, parseUserDate, zonedParts } from '../dates.js';
import {
  getBoardsAndTasks,
  getCalendarEvents,
  getFinance,
  getGanttTasks,
  getKpis,
  getMemberNames,
  getPeopleNames,
  getProject,
  moveTasks,
  createTask,
  type BoardInfo,
  type GanttInfo,
  type TaskInfo,
} from '../projectData.js';
import {
  calendarMessage,
  createTaskErrorMessage,
  createTaskResultMessage,
  deadlinesMessage,
  financeMessage,
  ganttSectionMessage,
  ganttSectionsMessage,
  helpMessage,
  kanbanMessage,
  kpiPanelMessage,
  moveErrorMessage,
  moveResultMessage,
  unknownCommandMessage,
} from '../templates.js';

/**
 * Comandos do grupo. Cada um busca os dados atuais no Firebase e devolve o texto da resposta.
 *   /kpis [setor ou nome] · /tarefas [pessoa ou coluna] · /mover <nº...> <coluna>
 *   /gantt <seção> · /prazos [dias] · /financeiro · /ajuda
 */

export interface CommandContext {
  /** Nome de quem mandou (pushName do WhatsApp), para o histórico de mudanças. */
  senderName?: string;
  /** Prévia: calcula a resposta sem gravar nada (usado em /commands/preview e no CLI). */
  dryRun?: boolean;
}

export interface ParsedCommand {
  name: string; // sem a barra, minúsculo e sem acento
  args: string;
  raw: string;
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Só aceita mensagens que começam com "/" seguido de letras. Qualquer outra coisa retorna null. */
export function parseCommand(text: string | null | undefined): ParsedCommand | null {
  if (!text) return null;
  const trimmed = text.trim();
  const m = /^\/([a-zA-ZÀ-ÿ]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!m) return null;
  // 400 caracteres: o /criartarefa leva título + campos na mesma mensagem
  return { name: normalize(m[1]), args: (m[2] ?? '').trim().slice(0, 400), raw: trimmed.slice(0, 80) };
}

const ALIASES: Record<string, string> = {
  kpis: 'kpis',
  kpi: 'kpis',
  tarefas: 'tarefas',
  tarefa: 'tarefas',
  kanban: 'tarefas',
  criartarefa: 'criartarefa',
  criar: 'criartarefa',
  novatarefa: 'criartarefa',
  nova: 'criartarefa',
  mover: 'mover',
  mova: 'mover',
  mv: 'mover',
  gantt: 'gantt',
  cronograma: 'gantt',
  prazos: 'prazos',
  prazo: 'prazos',
  calendario: 'calendario',
  agenda: 'calendario',
  cal: 'calendario',
  financeiro: 'financeiro',
  financas: 'financeiro',
  finance: 'financeiro',
  ajuda: 'ajuda',
  help: 'ajuda',
  comandos: 'ajuda',
};

export function resolveCommand(name: string): string | null {
  return ALIASES[name] ?? null;
}

/** Sinônimos PT ↔ EN para achar a seção do Gantt (o time usa nomes em inglês nas seções). */
const SECTION_SYNONYMS: Record<string, string[]> = {
  engenharia: ['engineering'],
  marketing: ['marketing'],
  'projeto social': ['social project', 'social'],
  social: ['social project'],
  gestao: ['project management', 'management'],
  'gestao de projetos': ['project management'],
  empresa: ['enterprise'],
  empreendimento: ['enterprise'],
  conclusao: ['completion'],
  design: ['design'],
  financeiro: ['finance', 'financial'],
};

/** Encontra a seção pedida: igual > sinônimo > "contém". Retorna o nome da seção como está no Gantt. */
export function matchSection(query: string, sections: string[]): string | null {
  const q = normalize(query);
  if (!q) return null;
  if (['sem secao', 'sem seção', 'nenhuma', 'outros'].includes(q)) return sections.includes('') ? '' : null;
  const norm = sections.map((s) => ({ s, n: normalize(s) }));
  const exact = norm.find((x) => x.n === q);
  if (exact) return exact.s;
  const syn = (SECTION_SYNONYMS[q] ?? []).map(normalize);
  const bySyn = norm.find((x) => syn.includes(x.n));
  if (bySyn) return bySyn.s;
  const partial = norm.filter((x) => x.n && (x.n.includes(q) || q.includes(x.n) || syn.some((y) => x.n.includes(y))));
  return partial.length === 1 ? partial[0].s : null;
}

function sectionsOf(tasks: GanttInfo[]) {
  const counts = new Map<string, number>();
  for (const g of tasks) counts.set(g.section, (counts.get(g.section) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name, 'pt-BR')));
}

/** Acha a coluna pelo nome: igual > começa com > contém ("fazer" → A FAZER). */
export function matchColumn(query: string, boards: BoardInfo[]): BoardInfo | null {
  const q = normalize(query).replace(/^(para|pra|p\/|em)\s+/, '');
  if (!q) return null;
  const norm = boards.map((b) => ({ b, n: normalize(b.name) }));
  const hit =
    norm.find((x) => x.n === q) ??
    norm.find((x) => x.n.startsWith(q)) ??
    norm.filter((x) => x.n.includes(q)).at(0) ??
    norm.find((x) => x.n.replace(/\s+/g, '') === q.replace(/\s+/g, ''));
  return hit?.b ?? null;
}

/**
 * Separa "/mover 3 5 feito" / "/mover imprimir pistas feito" em tarefas + coluna.
 * A coluna é o final do texto (1 a 3 palavras) que bater com uma coluna existente.
 */
function parseMove(args: string, boards: BoardInfo[]): { refs: string[]; text: string; column: BoardInfo | null } {
  const words = args.split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const column = matchColumn(words.slice(-n).join(' '), boards);
    if (column) {
      const rest = words.slice(0, -n);
      const refs = rest.filter((w) => /^#?\d+[,;]?$/.test(w)).map((w) => w.replace(/\D/g, ''));
      return { refs, text: refs.length === rest.length ? '' : rest.join(' '), column };
    }
  }
  return { refs: [], text: '', column: null };
}

async function runMove(args: string, projectId: string, ctx: CommandContext): Promise<string> {
  if (!config.commandMoveEnabled) return moveErrorMessage('disabled');
  if (!args) return moveErrorMessage('usage');

  const { boards, tasks } = await getBoardsAndTasks(projectId);
  const { refs, text, column } = parseMove(args, boards);
  if (!column) return moveErrorMessage('column', boards.map((b) => b.name).join(', '));

  let selected: TaskInfo[] = [];
  if (refs.length) {
    const missing = refs.filter((r) => !tasks.some((t) => t.number === Number(r)));
    if (missing.length) return moveErrorMessage('task', missing.join(', '));
    selected = [...new Set(refs.map(Number))].map((n) => tasks.find((t) => t.number === n)!);
  } else if (text) {
    const q = normalize(text);
    const hits = tasks.filter((t) => normalize(t.title).includes(q));
    if (!hits.length) return moveErrorMessage('task', `"${text}"`);
    if (hits.length > 1) return moveErrorMessage('ambiguous', text);
    selected = hits;
  } else {
    return moveErrorMessage('usage');
  }

  const skipped = selected.filter((t) => t.boardId === column.id);
  const toMove = selected.filter((t) => t.boardId !== column.id);
  if (toMove.length && !ctx.dryRun) await moveTasks(projectId, toMove, column, tasks, `${ctx.senderName || 'Membro'} (WhatsApp)`);
  return moveResultMessage(toMove, column.name, skipped) + (ctx.dryRun ? ' _(prévia, nada foi movido)_' : '');
}

// ---------------------------------------------------------------- /criartarefa

const FIELD_KEYS: Array<{ field: 'start' | 'due' | 'column' | 'people'; words: string[] }> = [
  { field: 'start', words: ['inicio', 'comeca', 'começa', 'de'] },
  { field: 'due', words: ['entrega', 'prazo', 'ate', 'fim', 'vence', 'termino'] },
  { field: 'column', words: ['coluna', 'col', 'em'] },
  { field: 'people', words: ['responsaveis', 'responsavel', 'resp', 'para', 'pra', 'com'] },
];

/** "entrega: 05/10" / "entrega 05/10" → { field: 'due', value: '05/10' }. Sem palavra-chave → field null. */
function splitField(part: string): { field: 'start' | 'due' | 'column' | 'people' | null; value: string } {
  const n = normalize(part);
  for (const { field, words } of FIELD_KEYS) {
    for (const w of words) {
      const m = new RegExp(`^${normalize(w)}\\s*[:=]?\\s+(.+)$|^${normalize(w)}\\s*[:=]\\s*(.+)$`).exec(n);
      if (m) return { field, value: part.slice(part.length - (m[1] ?? m[2]).length).trim() };
    }
  }
  return { field: null, value: part.trim() };
}

/** Resolve nomes ("heitor, maria" / "heitor e ana") para UIDs dos membros. */
function resolvePeople(text: string, people: Map<string, string>): { uids: string[]; missing: string[]; ambiguous: string[] } {
  const uids: string[] = [];
  const missing: string[] = [];
  const ambiguous: string[] = [];
  const tokens = text.split(/\s*(?:,|\/|\be\b|\+)\s*/i).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const q = normalize(tok.replace(/^@/, ''));
    const entries = [...people.entries()].map(([uid, name]) => ({ uid, n: normalize(name) }));
    const exactFirst = entries.filter((e) => e.n.split(' ')[0] === q || e.n === q);
    const partial = entries.filter((e) => e.n.includes(q));
    const hits = exactFirst.length ? exactFirst : partial;
    if (hits.length === 1) {
      if (!uids.includes(hits[0].uid)) uids.push(hits[0].uid);
    } else if (hits.length > 1) ambiguous.push(tok);
    else missing.push(tok);
  }
  return { uids, missing, ambiguous };
}

async function runCreateTask(args: string, projectId: string, now: Date, ctx: CommandContext): Promise<string> {
  if (!config.commandCreateEnabled) return createTaskErrorMessage('disabled');
  const parts = args.split(/\s*[;|\n]\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return createTaskErrorMessage('usage');

  const project = await getProject(projectId);
  if (!project) throw new Error(`Projeto ${projectId} não encontrado`);
  const { boards, tasks } = await getBoardsAndTasks(projectId);
  if (!boards.length) return createTaskErrorMessage('noBoards');
  const people = await getMemberNames(project.members);

  const title = parts[0].replace(/^(titulo|título)\s*[:=]?\s*/i, '').trim();
  if (!title) return createTaskErrorMessage('usage');
  if (title.length >= 200) return createTaskErrorMessage('title');

  let start: Date | null = null;
  let due: Date | null = null;
  let column: BoardInfo | null = null;
  let assignees: string[] = [];
  const bareDates: Date[] = [];

  for (const raw of parts.slice(1)) {
    const { field, value } = splitField(raw);
    if (field === 'start' || field === 'due') {
      const d = parseUserDate(value, now);
      if (!d) return createTaskErrorMessage('date', value);
      if (field === 'start') start = d;
      else due = d;
    } else if (field === 'column') {
      column = matchColumn(value, boards);
      if (!column) return createTaskErrorMessage('column', boards.map((b) => b.name).join(', '));
    } else if (field === 'people') {
      const r = resolvePeople(value, people);
      if (r.ambiguous.length) return createTaskErrorMessage('ambiguousPerson', r.ambiguous.join(', '));
      if (r.missing.length) return createTaskErrorMessage('person', r.missing.join(', '));
      assignees = [...new Set([...assignees, ...r.uids])];
    } else {
      // Sem palavra-chave: tenta data → coluna → pessoa, nessa ordem
      const d = parseUserDate(value, now);
      if (d) {
        bareDates.push(d);
        continue;
      }
      if (/^\d{1,4}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(value)) return createTaskErrorMessage('date', value);
      const col = matchColumn(value, boards);
      if (col) {
        column = col;
        continue;
      }
      const r = resolvePeople(value, people);
      if (r.uids.length && !r.missing.length && !r.ambiguous.length) {
        assignees = [...new Set([...assignees, ...r.uids])];
        continue;
      }
      return createTaskErrorMessage('unknown', value);
    }
  }

  // Datas sem palavra-chave: 1 data = entrega · 2 datas = início e entrega
  if (bareDates.length > 2) return createTaskErrorMessage('unknown', 'mais de duas datas');
  if (bareDates.length === 2) {
    start ??= bareDates[0];
    due ??= bareDates[1];
  } else if (bareDates.length === 1) {
    if (!due) due = bareDates[0];
    else start ??= bareDates[0];
  }

  start ??= parseUserDate('hoje', now)!;
  if (due && daysUntil(due, start) < 0) return createTaskErrorMessage('order', `início ${ddmm(start)}, entrega ${ddmm(due)}`);
  column ??= boards[0];

  if (ctx.dryRun) {
    return createTaskResultMessage({ number: null, title, column: column.name, start, due, assignees, people }) + ' _(prévia, nada foi criado)_';
  }

  const id = await createTask(project, { title, board: column, startDate: start, dueDate: due, assignees }, tasks, `${ctx.senderName || 'Membro'} (WhatsApp)`);
  const after = await getBoardsAndTasks(projectId);
  const number = after.tasks.find((t) => t.id === id)?.number ?? null;
  return createTaskResultMessage({ number, title, column: column.name, start, due, assignees, people });
}

export async function runCommand(command: string, args: string, projectId: string, now = new Date(), ctx: CommandContext = {}): Promise<string> {
  if (command === 'ajuda') return helpMessage(config.commandDeadlineDays);

  const project = await getProject(projectId);
  if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

  switch (command) {
    case 'kpis': {
      const all = await getKpis(project.id);
      const f = args ? normalize(args) : '';
      const kpis = f ? all.filter((k) => normalize(k.sector).includes(f) || normalize(k.name).includes(f)) : all;
      return kpiPanelMessage(project, kpis, args || undefined);
    }

    case 'tarefas': {
      // Somente Kanban, dividido pelas colunas do projeto
      const { boards, tasks, doneBoardId } = await getBoardsAndTasks(project.id);
      const people = await getMemberNames([...project.members, ...tasks.flatMap((t) => t.assignees)]);
      let columns = boards.map((b) => ({ id: b.id, name: b.name, done: b.id === doneBoardId, tasks: tasks.filter((t) => t.boardId === b.id) }));
      let fullColumn = false;
      if (args) {
        const column = matchColumn(args, boards);
        if (column) {
          // /tarefas feito → só essa coluna, completa
          columns = columns.filter((c) => c.id === column.id);
          fullColumn = true;
        } else {
          // /tarefas heitor → tarefas dessa pessoa em todas as colunas
          const f = normalize(args);
          const uids = [...people.entries()].filter(([, n]) => normalize(n).includes(f)).map(([u]) => u);
          columns = columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.assignees.some((a) => uids.includes(a))) }));
        }
      }
      return kanbanMessage(project, columns, people, now, { filter: args || undefined, fullColumn });
    }

    case 'mover':
      return runMove(args, project.id, ctx);

    case 'criartarefa':
      return runCreateTask(args, project.id, now, ctx);

    case 'gantt': {
      const tasks = await getGanttTasks(project.id);
      const sections = sectionsOf(tasks);
      if (!args) return ganttSectionsMessage(project, sections);
      const section = matchSection(args, sections.map((s) => s.name));
      if (section === null) return ganttSectionsMessage(project, sections, args);
      const items = tasks.filter((g) => g.section === section);
      const people = await getPeopleNames(project.id, items.flatMap((g) => g.assignees));
      return ganttSectionMessage(project, section, items, people, now);
    }

    case 'prazos': {
      const n = Number.parseInt(args, 10);
      const windowDays = Number.isFinite(n) && n > 0 && n <= 90 ? n : config.commandDeadlineDays;
      const [{ tasks }, gantt] = await Promise.all([getBoardsAndTasks(project.id), getGanttTasks(project.id)]);
      const people = await getMemberNames([...project.members, ...tasks.flatMap((t) => t.assignees)]);
      return deadlinesMessage(project, tasks.filter((t) => !t.done), gantt.filter((g) => !g.done), people, now, windowDays);
    }

    case 'calendario': {
      const events = await getCalendarEvents(project.id);
      const people = await getMemberNames([...project.members, ...events.flatMap((e) => e.assignees)]);
      return calendarMessage(project, events, people, now, { before: 7, after: 14 });
    }

    case 'financeiro': {
      const p = zonedParts(now);
      const finance = await getFinance(project.id, { year: p.year, month: p.month });
      return financeMessage(project, finance, now);
    }

    default:
      return unknownCommandMessage(`/${command}`);
  }
}
