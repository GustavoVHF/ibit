/** Configuração da automação lida das variáveis de ambiente (ver whatsapp/.env.example). */
import { createHash } from 'node:crypto';

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = str(name).toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(v);
}

function required(name: string): string {
  const v = str(name);
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

function parseTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`WEEKLY_REPORT_TIME inválido: "${value}" (use HH:MM)`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`WEEKLY_REPORT_TIME inválido: "${value}"`);
  return { hour, minute };
}

const alertDays = str('DEADLINE_ALERT_DAYS', '3,1,0')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 0);

const weeklyDay = int('WEEKLY_REPORT_DAY', 5);
if (weeklyDay < 0 || weeklyDay > 6) throw new Error('WEEKLY_REPORT_DAY deve ser 0..6 (0=domingo)');

const automationApiKey = required('AUTOMATION_API_KEY');

export const config = {
  port: int('PORT', 3333),
  automationApiKey,

  /** Webhook Evolution → automação (mensagens recebidas nos grupos). */
  webhookUrl: str('WEBHOOK_URL', 'http://automation:3333/webhook/evolution'),
  /** Segredo enviado pela Evolution no header x-webhook-secret. Se ausente, derivado da AUTOMATION_API_KEY. */
  webhookSecret: str('WEBHOOK_SECRET') || createHash('sha256').update(`ibit-webhook:${automationApiKey}`).digest('hex'),
  commandsEnabled: bool('COMMANDS_ENABLED', true),
  /** Ignora comandos mais antigos que isso (ex.: histórico reenviado ao reconectar). */
  commandMaxAgeSec: int('COMMAND_MAX_AGE_SEC', 300),
  /** Mesmo comando no mesmo grupo dentro desse intervalo é ignorado (anti-spam). */
  commandCooldownSec: int('COMMAND_COOLDOWN_SEC', 10),
  /**
   * Comandos no privado (conversa direta com o seu número):
   *  'members' = só quem participa de um grupo vinculado (padrão) · 'all' = qualquer pessoa · 'off' = desligado
   */
  privateCommands: (['members', 'all', 'off'].includes(str('PRIVATE_COMMANDS', 'members').toLowerCase())
    ? str('PRIVATE_COMMANDS', 'members').toLowerCase()
    : 'members') as 'members' | 'all' | 'off',
  /** Números liberados no privado mesmo sem estar no grupo (só dígitos, com DDI). Ex.: 5533999999999,5511988887777 */
  privateAllowedNumbers: str('PRIVATE_ALLOWED_NUMBERS')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean),
  /** Projeto usado no privado para quem não está em nenhum grupo vinculado (padrão: o primeiro vinculado). */
  privateProjectId: str('PRIVATE_PROJECT_ID'),
  /** Permite /criartarefa (qualquer pessoa autorizada a usar comandos pode criar tarefas no Kanban). */
  commandCreateEnabled: bool('COMMAND_CREATE_ENABLED', true),
  /** Permite /mover (qualquer membro do grupo vinculado pode mudar tarefas de coluna). */
  commandMoveEnabled: bool('COMMAND_MOVE_ENABLED', true),
  /** Janela padrão do /prazos (dias). */
  commandDeadlineDays: int('COMMAND_DEADLINE_DAYS', 7),

  evolutionUrl: str('EVOLUTION_URL', 'http://localhost:8080').replace(/\/+$/, ''),
  evolutionApiKey: required('EVOLUTION_API_KEY'),
  evolutionInstance: str('EVOLUTION_INSTANCE', 'ibit'),

  firestoreDatabaseId: str('FIRESTORE_DATABASE_ID', '(default)'),
  appUrl: str('APP_URL', 'https://ibit.app').replace(/\/+$/, ''),
  timezone: str('TIMEZONE', 'America/Sao_Paulo'),

  defaultProjectId: str('DEFAULT_PROJECT_ID'),
  defaultGroupId: str('WHATSAPP_GROUP_ID'),

  deadlineCron: str('DEADLINE_CRON', '0 8 * * *'),
  /** Janelas ordenadas crescentes, sem duplicatas (ex.: [0, 1, 3]). */
  deadlineAlertDays: [...new Set(alertDays.length ? alertDays : [3, 1, 0])].sort((a, b) => a - b),
  deadlineAlertOverdue: bool('DEADLINE_ALERT_OVERDUE', true),
  overdueLookbackDays: int('OVERDUE_LOOKBACK_DAYS', 7),

  weeklyReportDay: weeklyDay,
  weeklyReportTime: parseTime(str('WEEKLY_REPORT_TIME', '17:00')),

  runCatchupOnStartup: bool('RUN_CATCHUP_ON_STARTUP', true),
  maxSendAttempts: Math.max(1, int('MAX_SEND_ATTEMPTS', 3)),
} as const;

export type Config = typeof config;
