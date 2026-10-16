import cron from 'node-cron';
import { config } from './config.js';
import { zonedParts } from './dates.js';
import { evolution, type ConnectionState } from './evolution.js';
import { runDeadlineAlerts } from './jobs/deadlineAlerts.js';
import { runWeeklyReport } from './jobs/weeklyReport.js';
import { logger } from './logger.js';

/**
 * Agendamento (fuso TIMEZONE):
 *  - Alertas de prazo: DEADLINE_CRON (padrão todo dia 08:00)
 *  - Relatório semanal: WEEKLY_REPORT_DAY + WEEKLY_REPORT_TIME (padrão sexta 17:00)
 *
 * Catch-up: como a Evolution roda no PC local, ele pode estar desligado no horário.
 * Ao iniciar (e quando o WhatsApp reconecta) os jobs rodam de novo; o dedupe no Firestore
 * garante que nada repete. O catch-up só roda entre 07:00 e 22:00 para não mandar mensagem de madrugada.
 */

const CATCHUP_START_HOUR = 7;
const CATCHUP_END_HOUR = 22;
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const running = new Set<string>();

/** Evita duas execuções simultâneas do mesmo job neste processo. */
export async function exclusive<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (running.has(name)) {
    logger.warn(`${name}: já em execução, ignorando.`);
    return null;
  }
  running.add(name);
  try {
    return await fn();
  } finally {
    running.delete(name);
  }
}

export function weeklyCron(): string {
  const { hour, minute } = config.weeklyReportTime;
  return `${minute} ${hour} * * ${config.weeklyReportDay}`;
}

export function scheduleDescription() {
  const { hour, minute } = config.weeklyReportTime;
  return {
    timezone: config.timezone,
    deadlineAlerts: { cron: config.deadlineCron, windowsDays: config.deadlineAlertDays, overdue: config.deadlineAlertOverdue },
    weeklyReport: {
      cron: weeklyCron(),
      human: `${WEEKDAY_NAMES[config.weeklyReportDay]} às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    },
    catchupOnStartup: config.runCatchupOnStartup,
  };
}

/** Já passou o horário do relatório nesta semana (segunda→domingo)? */
function weeklyDueThisWeek(now = new Date()): boolean {
  const p = zonedParts(now);
  const todayIdx = (p.weekday + 6) % 7; // segunda=0
  const schedIdx = (config.weeklyReportDay + 6) % 7;
  if (todayIdx !== schedIdx) return todayIdx > schedIdx;
  const { hour, minute } = config.weeklyReportTime;
  return p.hour * 60 + p.minute >= hour * 60 + minute;
}

function inCatchupWindow(now = new Date()): boolean {
  const h = zonedParts(now).hour;
  return h >= CATCHUP_START_HOUR && h < CATCHUP_END_HOUR;
}

async function whatsappReady(): Promise<boolean> {
  try {
    return (await evolution.connectionState()) === 'open';
  } catch (e) {
    logger.warn(`Evolution API indisponível: ${(e as Error).message}`);
    return false;
  }
}

async function scheduledDeadlines() {
  if (!(await whatsappReady())) return logger.warn('deadline-alerts: WhatsApp desconectado, pulando (roda no catch-up ao reconectar).');
  await exclusive('deadline-alerts', () => runDeadlineAlerts());
}

async function scheduledWeekly() {
  if (!(await whatsappReady())) return logger.warn('weekly-report: WhatsApp desconectado, pulando (roda no catch-up ao reconectar).');
  await exclusive('weekly-report', () => runWeeklyReport());
}

export async function catchUp(reason: string) {
  if (!config.runCatchupOnStartup) return;
  if (!inCatchupWindow()) return logger.info(`catch-up (${reason}): fora da janela ${CATCHUP_START_HOUR}h–${CATCHUP_END_HOUR}h, aguardando agendamento.`);
  if (!(await whatsappReady())) return logger.info(`catch-up (${reason}): WhatsApp ainda não conectado.`);

  logger.info(`catch-up (${reason}): verificando envios pendentes…`);
  await exclusive('deadline-alerts', () => runDeadlineAlerts());
  if (weeklyDueThisWeek()) await exclusive('weekly-report', () => runWeeklyReport());
}

export function startScheduler() {
  if (!cron.validate(config.deadlineCron)) throw new Error(`DEADLINE_CRON inválido: "${config.deadlineCron}"`);

  cron.schedule(config.deadlineCron, scheduledDeadlines, { timezone: config.timezone, name: 'deadline-alerts', noOverlap: true });
  cron.schedule(weeklyCron(), scheduledWeekly, { timezone: config.timezone, name: 'weekly-report', noOverlap: true });

  const s = scheduleDescription();
  logger.info(`Agendado: alertas de prazo "${s.deadlineAlerts.cron}" · relatório semanal ${s.weeklyReport.human} (${s.timezone})`);

  // Monitora a conexão: ao ficar "open" (boot ou após ler o QR), roda o catch-up.
  let last: ConnectionState | 'init' = 'init';
  const check = async () => {
    let state: ConnectionState = 'unknown';
    try {
      state = await evolution.connectionState();
    } catch {
      state = 'unknown';
    }
    if (state !== last) {
      logger.info(`WhatsApp: ${last} → ${state}`);
      if (state === 'open') await catchUp(last === 'init' ? 'startup' : 'reconexão').catch((e) => logger.error(`catch-up falhou: ${e.message}`));
      last = state;
    }
  };
  setTimeout(check, 15_000);
  setInterval(check, 5 * 60_000);
}
