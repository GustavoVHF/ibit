import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from './config.js';
import { db, COLLECTIONS } from './firebase.js';
import { evolution, isBotMessage } from './evolution.js';
import { parseCommand, resolveCommand, runCommand } from './commands/index.js';
import { commandErrorMessage, unknownCommandMessage } from './templates.js';
import { listTargets, type WhatsAppTarget } from './targets.js';
import { logger } from './logger.js';

/**
 * Webhook da Evolution API (evento MESSAGES_UPSERT) → leitor de comandos.
 *
 * Onde responde:
 *  - Grupos (@g.us) vinculados a um projeto.
 *  - Privado (conversa direta com o seu número), conforme PRIVATE_COMMANDS:
 *    'members' = só quem participa de um grupo vinculado · 'all' = qualquer um · 'off' = nunca.
 *
 * Proteções contra loop e spam, nesta ordem:
 *  1. Header x-webhook-secret precisa bater.
 *  2. Ignora mensagens enviadas por esta automação (IDs guardados ao enviar).
 *  3. Só textos que começam com "/" + letras. Respostas do bot nunca começam com "/".
 *  4. Ignora mensagens antigas (histórico reenviado ao reconectar).
 *  5. No privado, ignora o que VOCÊ manda para outras pessoas (fromMe), exceto na conversa consigo mesmo.
 *  6. Mesmo comando na mesma conversa em COMMAND_COOLDOWN_SEC é ignorado.
 *  7. Cada mensagem é processada 1x (doc whatsappCommands/{messageId} criado de forma atômica).
 *
 * No grupo, mensagens suas (fromMe) são aceitas, pois o bot usa o seu número.
 */

interface IncomingMessage {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
    participant?: string;
    // Campos alternativos (número ↔ LID) enviados por versões novas do WhatsApp/Evolution
    remoteJidAlt?: string;
    senderPn?: string;
    senderLid?: string;
    participantAlt?: string;
  };
  pushName?: string;
  message?: Record<string, any>;
  messageTimestamp?: number | string | { low?: number };
}

function secretOk(req: Request): boolean {
  const got = Buffer.from(req.header('x-webhook-secret') ?? '');
  const want = Buffer.from(config.webhookSecret);
  return got.length === want.length && timingSafeEqual(got, want);
}

function extractText(msg: IncomingMessage): string | null {
  const m = msg.message ?? {};
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.ephemeralMessage?.message?.extendedTextMessage?.text ??
    m.ephemeralMessage?.message?.conversation ??
    null
  );
}

function timestampMs(msg: IncomingMessage): number | null {
  const t = msg.messageTimestamp;
  const n = typeof t === 'object' && t ? Number(t.low) : Number(t);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
}

// Cache curto dos grupos vinculados (evita ler o Firestore a cada mensagem do grupo).
let targetsCache: { at: number; list: WhatsAppTarget[] } | null = null;
async function targetForGroup(groupId: string): Promise<WhatsAppTarget | undefined> {
  if (!targetsCache || Date.now() - targetsCache.at > 60_000) targetsCache = { at: Date.now(), list: await listTargets() };
  return targetsCache.list.find((t) => t.groupId === groupId);
}
export function invalidateTargetsCache() {
  targetsCache = null;
  membersCache = null;
}

const lastRun = new Map<string, number>();
function inCooldown(key: string): boolean {
  const now = Date.now();
  const prev = lastRun.get(key);
  if (prev && now - prev < config.commandCooldownSec * 1000) return true;
  lastRun.set(key, now);
  if (lastRun.size > 500) lastRun.clear();
  return false;
}

/** Reserva a mensagem no Firestore. false = já processada (webhook repetido). */
async function reserve(messageId: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.commands).doc(messageId.replace(/\//g, '-')).create({ ...data, status: 'processing', createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch (e: any) {
    if (e?.code === 6 || /already exists/i.test(e?.message ?? '')) return false;
    throw e;
  }
}

async function finish(messageId: string, data: Record<string, unknown>) {
  await db.collection(COLLECTIONS.commands).doc(messageId.replace(/\//g, '-')).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// ---------------------------------------------------------------- privado

const PRIVATE_JID = /@(s\.whatsapp\.net|lid)$/;
const digits = (jid: string) => jid.split('@')[0].split(':')[0].replace(/\D/g, '');

/** Todos os JIDs que podem identificar quem mandou (número e/ou LID, conforme a versão do WhatsApp). */
function senderJids(msg: IncomingMessage): string[] {
  const k = msg.key ?? {};
  return [k.remoteJid, k.remoteJidAlt, k.senderPn, k.senderLid, k.participant, k.participantAlt].filter((x): x is string => !!x && PRIVATE_JID.test(x));
}

// Participantes dos grupos vinculados (cache de 10 min).
let membersCache: { at: number; byGroup: Map<string, Set<string>> } | null = null;
async function groupMembers(targets: WhatsAppTarget[]): Promise<Map<string, Set<string>>> {
  if (membersCache && Date.now() - membersCache.at < 10 * 60_000) return membersCache.byGroup;
  const byGroup = new Map<string, Set<string>>();
  for (const t of targets) {
    try {
      const jids = await evolution.groupParticipants(t.groupId);
      byGroup.set(t.groupId, new Set(jids.flatMap((j) => [j, digits(j)])));
    } catch (e) {
      logger.warn(`não consegui ler participantes de ${t.groupId}: ${(e as Error).message}`);
    }
  }
  membersCache = { at: Date.now(), byGroup };
  return byGroup;
}

let ownerCache: { at: number; jids: Set<string> } | null = null;
async function isOwnChat(jids: string[]): Promise<boolean> {
  if (!ownerCache || Date.now() - ownerCache.at > 60 * 60_000) {
    const owner = await evolution.ownerJid().catch(() => null);
    ownerCache = { at: Date.now(), jids: new Set(owner ? [owner, digits(owner)] : []) };
  }
  return jids.some((j) => ownerCache!.jids.has(j) || ownerCache!.jids.has(digits(j)));
}

/**
 * Decide qual projeto responde no privado.
 * 'members': precisa participar de um grupo vinculado → usa o projeto desse grupo.
 * Números liberados (PRIVATE_ALLOWED_NUMBERS) e modo 'all' usam PRIVATE_PROJECT_ID ou o 1º vinculado.
 */
async function allTargets(): Promise<WhatsAppTarget[]> {
  await targetForGroup(''); // garante o cache carregado
  return targetsCache?.list ?? [];
}

/** Projeto padrão do privado: PRIVATE_PROJECT_ID ou o primeiro grupo vinculado. */
async function defaultTarget(): Promise<WhatsAppTarget | undefined> {
  const targets = await allTargets();
  return targets.find((t) => t.projectId === config.privateProjectId) ?? targets[0];
}

async function privateTarget(jids: string[]): Promise<WhatsAppTarget | undefined> {
  if (config.privateCommands === 'off' || !jids.length) return undefined;
  const targets = await allTargets();
  if (!targets.length) return undefined;

  const members = await groupMembers(targets);
  const keys = jids.flatMap((j) => [j, digits(j)]);
  const inGroup = targets.find((t) => keys.some((k) => members.get(t.groupId)?.has(k)));
  if (inGroup) return inGroup;

  const allowed = config.privateCommands === 'all' || keys.some((k) => config.privateAllowedNumbers.includes(k));
  return allowed ? defaultTarget() : undefined;
}

// ---------------------------------------------------------------- processamento

export async function handleMessage(msg: IncomingMessage): Promise<void> {
  const id = msg.key?.id;
  const chatId = msg.key?.remoteJid;
  if (!id || !chatId) return;
  if (isBotMessage(id)) return;

  const isGroup = chatId.endsWith('@g.us');
  const isPrivate = PRIVATE_JID.test(chatId);
  if (!isGroup && !isPrivate) return; // status@broadcast, canais etc.

  const parsed = parseCommand(extractText(msg));
  if (!parsed) return;

  const ts = timestampMs(msg);
  if (ts && Date.now() - ts > config.commandMaxAgeSec * 1000) return;

  let target: WhatsAppTarget | undefined;
  if (isGroup) {
    target = await targetForGroup(chatId);
  } else {
    const jids = senderJids(msg);
    // No privado, mensagem "fromMe" é você falando com outra pessoa: nunca responder
    // (exceto na conversa consigo mesmo, útil para testar).
    if (msg.key?.fromMe && !(await isOwnChat(jids))) return;
    target = msg.key?.fromMe ? await defaultTarget() : await privateTarget(jids);
  }
  if (!target) return;

  const command = resolveCommand(parsed.name);
  // /mover e /criartarefa não têm cooldown: várias ações seguidas são normais (cada mensagem ainda é processada 1x).
  if (command !== 'mover' && command !== 'criartarefa' && inCooldown(`${chatId}:${command ?? parsed.name}`)) {
    logger.info(`comando ${parsed.raw} ignorado (cooldown) em ${chatId}`);
    return;
  }

  const sender = msg.key?.participant ?? (msg.key?.fromMe ? 'me' : chatId);
  const reserved = await reserve(id, {
    projectId: target.projectId,
    groupId: chatId,
    chat: isGroup ? 'group' : 'private',
    command: command ?? parsed.name,
    args: parsed.args,
    sender,
    senderName: msg.pushName ?? null,
  });
  if (!reserved) return;

  const quoted = { key: { id, remoteJid: chatId, fromMe: !!msg.key?.fromMe, participant: msg.key?.participant }, text: parsed.raw };
  const started = Date.now();
  try {
    const reply = command
      ? await runCommand(command, parsed.args, target.projectId, new Date(), { senderName: msg.pushName })
      : unknownCommandMessage(parsed.raw.split(/\s/)[0]);
    // No privado não precisa citar a mensagem (a conversa já é 1 a 1)
    const replyId = await evolution.sendText(chatId, reply, isGroup ? quoted : undefined);
    await finish(id, { status: 'replied', replyId, ms: Date.now() - started });
    logger.info(`comando ${parsed.raw} respondido em ${Date.now() - started}ms (${isGroup ? 'grupo' : 'privado'} · ${target.projectId})`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`comando ${parsed.raw} falhou: ${error}`);
    await finish(id, { status: 'failed', error: error.slice(0, 1000) }).catch(() => {});
    await evolution.sendText(chatId, commandErrorMessage(), isGroup ? quoted : undefined).catch(() => {});
  }
}

/** POST /webhook/evolution — responde 200 na hora e processa em segundo plano. */
export function webhookHandler(req: Request, res: Response) {
  if (!secretOk(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.status(200).json({ ok: true });
  if (!config.commandsEnabled) return;

  const body = req.body ?? {};
  const event = String(body.event ?? '').toLowerCase().replace(/_/g, '.');
  if (event !== 'messages.upsert') return;

  const items: IncomingMessage[] = Array.isArray(body.data) ? body.data : Array.isArray(body.data?.messages) ? body.data.messages : [body.data];
  for (const msg of items) {
    handleMessage(msg ?? {}).catch((e) => logger.error(`webhook: ${e instanceof Error ? e.message : e}`));
  }
}

/** Garante que a Evolution está mandando MESSAGES_UPSERT para a automação. */
export async function ensureWebhook(): Promise<boolean> {
  if (!config.commandsEnabled) return false;
  const current = await evolution.findWebhook().catch(() => null);
  const ok = current?.enabled && current.url === config.webhookUrl && current.events?.includes('MESSAGES_UPSERT');
  // Sempre regrava: garante o header de segredo mesmo se a URL já estiver certa.
  await evolution.setWebhook(config.webhookUrl, config.webhookSecret);
  logger.info(`Webhook ${ok ? 'confirmado' : 'configurado'}: ${config.webhookUrl} (MESSAGES_UPSERT)`);
  return true;
}
