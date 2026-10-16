import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { evolution, isGroupJid } from './evolution.js';
import { runDeadlineAlerts } from './jobs/deadlineAlerts.js';
import { runWeeklyReport } from './jobs/weeklyReport.js';
import { listProjects, getProject } from './projectData.js';
import { disableTarget, listTargets, saveTarget } from './targets.js';
import { exclusive, scheduleDescription } from './scheduler.js';
import { ensureWebhook, invalidateTargetsCache, webhookHandler } from './webhook.js';
import { parseCommand, resolveCommand, runCommand } from './commands/index.js';
import { unknownCommandMessage } from './templates.js';
import { db, COLLECTIONS } from './firebase.js';
import { logger } from './logger.js';

/**
 * API local da automação (porta 3333, exposta só em 127.0.0.1).
 * Autenticação: header `x-api-key: <AUTOMATION_API_KEY>` ou `?key=<AUTOMATION_API_KEY>`.
 */

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function auth(req: Request, res: Response, next: NextFunction) {
  const key = (req.header('x-api-key') ?? (typeof req.query.key === 'string' ? req.query.key : '')).trim();
  if (!key || !safeEqual(key, config.automationApiKey)) {
    res.status(401).json({ error: 'Não autorizado. Envie o header x-api-key.' });
    return;
  }
  next();
}

const flag = (v: unknown) => typeof v === 'string' && ['1', 'true', 'yes', 'sim'].includes(v.toLowerCase());
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Encapsula handlers async com tratamento de erro padrão. */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`${req.method} ${req.path}: ${message}`);
    if (!res.headersSent) res.status(500).json({ error: message });
  }
};

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', h(async (_req, res) => {
    const whatsapp = await evolution.connectionState().catch(() => 'unreachable');
    res.json({ ok: true, whatsapp, instance: config.evolutionInstance });
  }));

  // Webhook da Evolution: autenticado pelo header x-webhook-secret (não usa x-api-key).
  app.post('/webhook/evolution', webhookHandler);

  app.use(auth);

  // ---------- WhatsApp / conexão ----------

  app.get('/whatsapp/status', h(async (_req, res) => {
    res.json({ instance: config.evolutionInstance, state: await evolution.connectionState() });
  }));

  /** Página com o QR code para conectar seu número (atualiza sozinha). */
  app.get('/whatsapp/qr', h(async (_req, res) => {
    await evolution.ensureInstance();
    const state = await evolution.connectionState();
    let body: string;
    if (state === 'open') {
      body = `<h1>✅ WhatsApp conectado</h1><p>Instância <b>${escapeHtml(config.evolutionInstance)}</b> pronta. Pode fechar esta página.</p>`;
    } else {
      const qr = await evolution.connect();
      const img = qr.base64 ? `<img src="${escapeHtml(qr.base64)}" alt="QR code do WhatsApp" width="320" height="320">` : '<p>Gerando QR code…</p>';
      body = `<h1>Conecte o WhatsApp</h1>
        <ol><li>Abra o WhatsApp no celular</li><li>Toque em <b>Configurações → Dispositivos conectados → Conectar dispositivo</b></li><li>Aponte a câmera para o QR code</li></ol>
        ${img}<p><small>Estado: ${escapeHtml(state)} · a página atualiza a cada 20s</small></p>`;
    }
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="20">
      <title>IBIT · WhatsApp</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1a1a1a}h1{color:#ff7f00}img{border:8px solid #fff;box-shadow:0 2px 12px #0002}</style>
      </head><body>${body}</body></html>`);
  }));

  /** Alternativa ao QR: código de pareamento pelo número (ex.: 5511999999999). */
  app.post('/whatsapp/connect', h(async (req, res) => {
    await evolution.ensureInstance();
    const phone = str(req.body?.phoneNumber)?.replace(/\D/g, '');
    const r = await evolution.connect(phone);
    res.json({ pairingCode: r.pairingCode ?? null, hasQr: !!r.base64 });
  }));

  app.post('/whatsapp/logout', h(async (_req, res) => {
    await evolution.logout();
    res.json({ ok: true });
  }));

  // ---------- Grupos ----------

  /** Lista os grupos do seu WhatsApp com o ID (JID) de cada um. ?search=texto filtra pelo nome. */
  app.get('/whatsapp/groups', h(async (req, res) => {
    const search = str(req.query.search)?.toLowerCase();
    const groups = (await evolution.fetchGroups()).filter((g) => !search || g.subject.toLowerCase().includes(search));
    res.json({ count: groups.length, groups: groups.map((g) => ({ id: g.id, name: g.subject, participants: g.size ?? null })) });
  }));

  /** Vincula um grupo a um projeto IBIT (salva em whatsappIntegrations/{projectId}). */
  app.post('/whatsapp/groups/select', h(async (req, res) => {
    const projectId = str(req.body?.projectId);
    const groupId = str(req.body?.groupId);
    if (!projectId || !groupId) return res.status(400).json({ error: 'Informe projectId e groupId.' });
    if (!isGroupJid(groupId)) return res.status(400).json({ error: 'groupId deve terminar com @g.us' });

    const project = await getProject(projectId);
    if (!project) return res.status(404).json({ error: `Projeto ${projectId} não encontrado.` });
    const group = await evolution.findGroup(groupId);
    if (!group) return res.status(404).json({ error: 'Grupo não encontrado neste WhatsApp. Seu número participa dele?' });

    await saveTarget({
      projectId,
      groupId,
      groupName: group.subject,
      deadlineAlerts: req.body?.deadlineAlerts,
      weeklyReport: req.body?.weeklyReport,
    });
    invalidateTargetsCache();

    let testMessageId: string | null = null;
    if (req.body?.sendTest) {
      testMessageId = await evolution.sendText(
        groupId,
        `🤖 *IBIT conectado*\nEste grupo vai receber os alertas de prazo e o relatório semanal do projeto *${project.name}*.`,
      );
    }
    res.json({ ok: true, projectId, projectName: project.name, groupId, groupName: group.subject, testMessageId });
  }));

  app.get('/whatsapp/targets', h(async (_req, res) => {
    res.json({ targets: await listTargets() });
  }));

  app.delete('/whatsapp/targets/:projectId', h(async (req, res) => {
    await disableTarget(String(req.params.projectId));
    invalidateTargetsCache();
    res.json({ ok: true });
  }));

  // ---------- Webhook / comandos ----------

  app.get('/whatsapp/webhook', h(async (_req, res) => {
    const current = await evolution.findWebhook();
    res.json({
      expectedUrl: config.webhookUrl,
      commandsEnabled: config.commandsEnabled,
      configured: !!(current?.enabled && current.url === config.webhookUrl && current.events?.includes('MESSAGES_UPSERT')),
      current: current ? { enabled: current.enabled, url: current.url, events: current.events } : null,
    });
  }));

  app.post('/whatsapp/webhook/setup', h(async (_req, res) => {
    res.json({ ok: await ensureWebhook() });
  }));

  /** Prévia da resposta de um comando, sem enviar. Body: { text: "/kpis", projectId? } */
  app.post('/commands/preview', h(async (req, res) => {
    const parsed = parseCommand(str(req.body?.text));
    if (!parsed) return res.status(400).json({ error: 'text deve começar com "/", ex.: /kpis' });
    const projectId = str(req.body?.projectId) ?? (await listTargets())[0]?.projectId;
    if (!projectId) return res.status(400).json({ error: 'Nenhum grupo vinculado. Informe projectId.' });
    const command = resolveCommand(parsed.name);
    const message = command ? await runCommand(command, parsed.args, projectId, new Date(), { dryRun: true }) : unknownCommandMessage(`/${parsed.name}`);
    res.json({ command: command ?? null, projectId, message });
  }));

  /** Últimos envios automáticos e comandos respondidos. */
  app.get('/jobs/history', h(async (_req, res) => {
    const [notifs, cmds] = await Promise.all([
      db.collection(COLLECTIONS.notifications).orderBy('updatedAt', 'desc').limit(15).get(),
      db.collection(COLLECTIONS.commands).orderBy('createdAt', 'desc').limit(10).get(),
    ]);
    const iso = (v: any) => (v?.toDate ? v.toDate().toISOString() : null);
    res.json({
      notifications: notifs.docs.map((d) => {
        const x = d.data();
        return { id: d.id, type: x.type, status: x.status, taskTitle: x.taskTitle ?? null, weekKey: x.weekKey ?? null, sentAt: iso(x.sentAt), updatedAt: iso(x.updatedAt), error: x.error ?? null };
      }),
      commands: cmds.docs.map((d) => {
        const x = d.data();
        return { command: x.command, args: x.args, status: x.status, senderName: x.senderName, createdAt: iso(x.createdAt), error: x.error ?? null };
      }),
    });
  }));

  app.post('/whatsapp/test', h(async (req, res) => {
    const text = str(req.body?.text) ?? '🤖 Teste da automação IBIT.';
    let groupId = str(req.body?.groupId);
    if (!groupId) {
      const targets = await listTargets();
      const projectId = str(req.body?.projectId);
      groupId = (projectId ? targets.find((t) => t.projectId === projectId) : targets[0])?.groupId;
    }
    if (!groupId) return res.status(400).json({ error: 'Nenhum grupo vinculado. Informe groupId.' });
    res.json({ ok: true, groupId, messageId: await evolution.sendText(groupId, text) });
  }));

  // ---------- Projetos ----------

  app.get('/projects', h(async (_req, res) => {
    res.json({ projects: await listProjects() });
  }));

  // ---------- Jobs ----------

  app.get('/jobs/schedule', h(async (_req, res) => {
    res.json(scheduleDescription());
  }));

  /** ?dryRun=1 mostra a mensagem sem enviar nem gravar. ?projectId= limita a um projeto. */
  app.post('/jobs/deadline-alerts/run', h(async (req, res) => {
    const results = await exclusive('deadline-alerts', () =>
      runDeadlineAlerts({ dryRun: flag(req.query.dryRun), projectId: str(req.query.projectId) }),
    );
    if (!results) return res.status(409).json({ error: 'Job já em execução.' });
    res.json({ results });
  }));

  /** ?dryRun=1 prévia · ?force=1 envia de novo mesmo se já saiu nesta semana. */
  app.post('/jobs/weekly-report/run', h(async (req, res) => {
    const results = await exclusive('weekly-report', () =>
      runWeeklyReport({ dryRun: flag(req.query.dryRun), force: flag(req.query.force), projectId: str(req.query.projectId) }),
    );
    if (!results) return res.status(409).json({ error: 'Job já em execução.' });
    res.json({ results });
  }));

  return app;
}
