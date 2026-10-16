import { config } from './config.js';

/** Helpers de data sempre no fuso configurado (TIMEZONE), independente do fuso do container. */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Converte Firestore Timestamp / Date / string / {_seconds} em Date. */
export function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=domingo
}

export function zonedParts(date: Date, tz = config.timezone): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: wd,
  };
}

/** Número do dia civil (dias desde 1970-01-01) no fuso configurado. */
export function civilDay(date: Date): number {
  const p = zonedParts(date);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

/** Dias corridos até a data (0 = hoje, negativo = atrasado). */
export function daysUntil(date: Date, now = new Date()): number {
  return civilDay(date) - civilDay(now);
}

/** "YYYY-MM-DD" no fuso configurado. */
export function ymd(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "26/09" */
export function ddmm(date: Date): string {
  const p = zonedParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
}

/** "26/09/2026" */
export function ddmmyyyy(date: Date): string {
  return `${ddmm(date)}/${zonedParts(date).year}`;
}

/** "sex 26/09" */
export function weekdayDdmm(date: Date): string {
  return `${WEEKDAYS[zonedParts(date).weekday]} ${ddmm(date)}`;
}

/** "14:05" */
export function hhmm(date: Date): string {
  const p = zonedParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const WEEKDAY_WORDS: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6,
};

/** Dia civil (no fuso configurado) como Date às 12:00 UTC: mesmo dia em qualquer leitura da plataforma. */
function civilNoon(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

/**
 * Lê uma data escrita no WhatsApp:
 *   "05/10" · "5/10/2026" · "05-10" · "2026-10-05" · "hoje" · "amanhã" · "sexta" (próxima) · "+3" / "3d" (daqui a N dias)
 * dd/mm sem ano: ano atual; se já passou há mais de 30 dias, vira o ano que vem.
 * Retorna null se não reconhecer.
 */
export function parseUserDate(input: string, now = new Date()): Date | null {
  const s = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/-feira$/, '');
  const today = zonedParts(now);
  const offset = (n: number) => {
    const base = Date.UTC(today.year, today.month - 1, today.day, 12);
    return new Date(base + n * DAY_MS);
  };

  if (s === 'hoje') return offset(0);
  if (s === 'amanha') return offset(1);
  if (s === 'depois de amanha') return offset(2);

  let m = /^\+?(\d{1,3})\s*(d|dias?)?$/.exec(s);
  if (m && (s.startsWith('+') || m[2])) return offset(Number(m[1]));

  if (s in WEEKDAY_WORDS) {
    const diff = (WEEKDAY_WORDS[s] - today.weekday + 7) % 7 || 7; // sempre a próxima (nunca hoje)
    return offset(diff);
  }

  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return civilNoon(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (m[3]) {
      const y = Number(m[3]);
      return civilNoon(y < 100 ? 2000 + y : y, month, day);
    }
    const d = civilNoon(today.year, month, day);
    if (d && d.getTime() < offset(-30).getTime()) return civilNoon(today.year + 1, month, day);
    return d;
  }
  return null;
}

/** Semana ISO (segunda a domingo) no fuso configurado, ex.: "2026-W39". */
export function isoWeekKey(date: Date): string {
  const p = zonedParts(date);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = d.getUTCDay() || 7; // 1..7 (segunda=1)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Segunda-feira 00:00 e domingo da semana corrente (datas civis como Date UTC-meia-noite para exibição). */
export function currentWeekRange(now = new Date()): { start: Date; end: Date } {
  const p = zonedParts(now);
  const offsetToMonday = (p.weekday + 6) % 7; // segunda=0
  const today = Date.UTC(p.year, p.month - 1, p.day, 12); // meio-dia evita virar o dia no fuso
  return {
    start: new Date(today - offsetToMonday * DAY_MS),
    end: new Date(today + (6 - offsetToMonday) * DAY_MS),
  };
}

export const DAY = DAY_MS;
