import { Timestamp } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { daysUntil, ymd } from '../dates.js';
import { claim, getNotification, markFailed, markSent, safeId } from '../dispatch.js';
import { evolution } from '../evolution.js';
import { getBoardsAndTasks, getMemberNames, getProject, type TaskInfo } from '../projectData.js';
import { deadlineAlertMessage } from '../templates.js';
import { listTargets, type WhatsAppTarget } from '../targets.js';
import { logger } from '../logger.js';

/**
 * Alertas de prazo.
 * Para cada projeto vinculado a um grupo: pega tarefas NÃO concluídas com prazo próximo,
 * agrupa numa única mensagem e envia no grupo. Cada tarefa/janela é registrada em
 * whatsappNotifications para nunca repetir o mesmo aviso.
 *
 * Janelas (DEADLINE_ALERT_DAYS=3,1,0):
 *   faltam 2–3 dias → "d3" · falta 1 dia → "d1" · vence hoje → "d0" · atrasada → "overdue".
 * Se o PC ficou desligado, a janela ainda é enviada na próxima execução (não depende do dia exato).
 * Se o prazo da tarefa mudar, o ID muda e os avisos voltam a valer para a nova data.
 */

export interface JobOptions {
  dryRun?: boolean;
  projectId?: string;
  now?: Date;
}

interface Candidate {
  task: TaskInfo;
  days: number;
  bucket: string;
  notificationId: string;
}

export interface DeadlineProjectResult {
  projectId: string;
  projectName?: string;
  groupId: string;
  candidates: number;
  sent: number;
  skipped: number;
  status: 'sent' | 'nothing_to_send' | 'dry_run' | 'failed' | 'disabled';
  messageId?: string | null;
  message?: string;
  error?: string;
}

export function bucketFor(days: number): string | null {
  if (days < 0) {
    return config.deadlineAlertOverdue && -days <= config.overdueLookbackDays ? 'overdue' : null;
  }
  const window = config.deadlineAlertDays.find((t) => days <= t);
  return window === undefined ? null : `d${window}`;
}

async function runForTarget(target: WhatsAppTarget, opts: JobOptions): Promise<DeadlineProjectResult> {
  const base = { projectId: target.projectId, groupId: target.groupId };
  if (!target.deadlineAlerts) return { ...base, candidates: 0, sent: 0, skipped: 0, status: 'disabled' };

  const project = await getProject(target.projectId);
  if (!project) throw new Error(`Projeto ${target.projectId} não encontrado no Firestore`);

  const now = opts.now ?? new Date();
  const { tasks } = await getBoardsAndTasks(project.id);

  const candidates: Candidate[] = [];
  for (const task of tasks) {
    if (task.done || !task.dueDate) continue;
    const days = daysUntil(task.dueDate, now);
    const bucket = bucketFor(days);
    if (!bucket) continue;
    candidates.push({ task, days, bucket, notificationId: safeId('deadline', task.id, bucket, ymd(task.dueDate)) });
  }

  // Filtra o que já foi enviado. Em envio real, reserva de forma atômica.
  const toSend: Candidate[] = [];
  for (const c of candidates) {
    if (opts.dryRun) {
      const prev = await getNotification(c.notificationId);
      if (prev?.status !== 'sent') toSend.push(c);
      continue;
    }
    const ok = await claim(c.notificationId, {
      type: 'deadline',
      projectId: project.id,
      groupId: target.groupId,
      taskId: c.task.id,
      taskTitle: c.task.title,
      bucket: c.bucket,
      dueDate: Timestamp.fromDate(c.task.dueDate!),
    });
    if (ok) toSend.push(c);
  }

  const result: DeadlineProjectResult = {
    ...base,
    projectName: project.name,
    candidates: candidates.length,
    sent: 0,
    skipped: candidates.length - toSend.length,
    status: 'nothing_to_send',
  };
  if (!toSend.length) return result;

  const memberNames = await getMemberNames([...project.members, ...toSend.flatMap((c) => c.task.assignees)]);
  const message = deadlineAlertMessage(project, toSend, memberNames, now);

  if (opts.dryRun) return { ...result, status: 'dry_run', message, sent: toSend.length };

  const ids = toSend.map((c) => c.notificationId);
  try {
    const messageId = await evolution.sendText(target.groupId, message);
    await markSent(ids, messageId);
    return { ...result, status: 'sent', sent: toSend.length, messageId, message };
  } catch (err) {
    await markFailed(ids, err);
    throw err;
  }
}

export async function runDeadlineAlerts(opts: JobOptions = {}): Promise<DeadlineProjectResult[]> {
  const targets = (await listTargets()).filter((t) => !opts.projectId || t.projectId === opts.projectId);
  if (!targets.length) logger.warn('deadline-alerts: nenhum grupo vinculado. Use scripts/groups.ps1 para vincular.');

  const results: DeadlineProjectResult[] = [];
  for (const target of targets) {
    try {
      const r = await runForTarget(target, opts);
      results.push(r);
      logger.info(`deadline-alerts [${target.projectId}] ${r.status} · enviados=${r.sent} ignorados=${r.skipped}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ projectId: target.projectId, groupId: target.groupId, candidates: 0, sent: 0, skipped: 0, status: 'failed', error });
      logger.error(`deadline-alerts [${target.projectId}] falhou: ${error}`);
    }
  }
  return results;
}
