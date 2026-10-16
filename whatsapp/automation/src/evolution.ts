import { config } from './config.js';

/** Cliente mínimo da Evolution API v2 (https://doc.evolution-api.com). */

export interface WhatsAppGroup {
  id: string; // JID do grupo, ex.: 120363000000000000@g.us
  subject: string;
  size?: number;
  owner?: string;
  creation?: number;
  desc?: string;
}

export type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown';

export class EvolutionError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(`${config.evolutionUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'response' in data ? JSON.stringify((data as any).response) : text;
    throw new EvolutionError(`Evolution API ${method} ${path} → ${res.status}: ${msg}`, res.status, data);
  }
  return data as T;
}

const inst = () => encodeURIComponent(config.evolutionInstance);

export const evolution = {
  async instanceExists(): Promise<boolean> {
    const list = await request<any[]>('GET', `/instance/fetchInstances?instanceName=${inst()}`).catch((e) => {
      if (e instanceof EvolutionError && e.status === 404) return [];
      throw e;
    });
    return Array.isArray(list) && list.some((i) => (i?.name ?? i?.instance?.instanceName) === config.evolutionInstance);
  },

  /** Cria a instância se ainda não existir. Retorna true se criou agora. */
  async ensureInstance(): Promise<boolean> {
    if (await this.instanceExists()) return false;
    await request('POST', '/instance/create', {
      instanceName: config.evolutionInstance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
    });
    return true;
  },

  async connectionState(): Promise<ConnectionState> {
    try {
      const r = await request<any>('GET', `/instance/connectionState/${inst()}`);
      return (r?.instance?.state ?? r?.state ?? 'unknown') as ConnectionState;
    } catch (e) {
      if (e instanceof EvolutionError && e.status === 404) return 'unknown';
      throw e;
    }
  },

  /** Pede QR code / pairing code para conectar o WhatsApp. */
  async connect(phoneNumber?: string): Promise<{ base64?: string; code?: string; pairingCode?: string }> {
    const q = phoneNumber ? `?number=${encodeURIComponent(phoneNumber)}` : '';
    return request('GET', `/instance/connect/${inst()}${q}`);
  },

  async logout(): Promise<void> {
    await request('DELETE', `/instance/logout/${inst()}`);
  },

  async fetchGroups(): Promise<WhatsAppGroup[]> {
    // Com muitos grupos a primeira chamada pode demorar.
    const r = await request<any[]>('GET', `/group/fetchAllGroups/${inst()}?getParticipants=false`, undefined, 120_000);
    return (Array.isArray(r) ? r : [])
      .map((g) => ({
        id: String(g.id),
        subject: String(g.subject ?? ''),
        size: typeof g.size === 'number' ? g.size : undefined,
        owner: g.owner ?? g.subjectOwner,
        creation: g.creation,
        desc: g.desc,
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
  },

  async findGroup(groupJid: string): Promise<WhatsAppGroup | null> {
    try {
      const g = await request<any>('GET', `/group/findGroupInfos/${inst()}?groupJid=${encodeURIComponent(groupJid)}`);
      if (!g?.id) return null;
      return { id: g.id, subject: g.subject ?? '', size: g.size, owner: g.owner ?? g.subjectOwner };
    } catch (e) {
      if (e instanceof EvolutionError && (e.status === 400 || e.status === 404)) return null;
      throw e;
    }
  },

  /**
   * Envia texto. `number` aceita JID de grupo (@g.us) ou telefone. Retorna o ID da mensagem.
   * `quoted` responde "em cima" da mensagem original (usado nas respostas de comandos).
   */
  async sendText(number: string, text: string, quoted?: QuotedMessage): Promise<string | null> {
    const body: Record<string, unknown> = { number, text, delay: 1200, linkPreview: false };
    if (quoted) body.quoted = { key: quoted.key, message: { conversation: quoted.text } };
    const r = await request<any>('POST', `/message/sendText/${inst()}`, body);
    const id: string | null = r?.key?.id ?? null;
    if (id) rememberBotMessage(id);
    return id;
  },

  /** Participantes do grupo: cada um com JID @lid e/ou número @s.whatsapp.net. */
  async groupParticipants(groupJid: string): Promise<string[]> {
    const r = await request<any>('GET', `/group/participants/${inst()}?groupJid=${encodeURIComponent(groupJid)}`);
    const list: any[] = Array.isArray(r?.participants) ? r.participants : [];
    return list.flatMap((p) => [p?.id, p?.phoneNumber, p?.jid, p?.lid].filter((x): x is string => typeof x === 'string'));
  },

  /** JID do número conectado (ex.: 5533...@s.whatsapp.net). */
  async ownerJid(): Promise<string | null> {
    const list = await request<any[]>('GET', `/instance/fetchInstances?instanceName=${inst()}`);
    const me = Array.isArray(list) ? list.find((i) => (i?.name ?? i?.instance?.instanceName) === config.evolutionInstance) : null;
    return me?.ownerJid ?? me?.instance?.owner ?? null;
  },

  async findWebhook(): Promise<{ enabled?: boolean; url?: string; events?: string[] } | null> {
    const r = await request<any>('GET', `/webhook/find/${inst()}`);
    return r && typeof r === 'object' ? r : null;
  },

  /** Configura o webhook da instância para mandar mensagens recebidas à automação. */
  async setWebhook(url: string, secret: string): Promise<void> {
    await request('POST', `/webhook/set/${inst()}`, {
      webhook: {
        enabled: true,
        url,
        headers: { 'x-webhook-secret': secret },
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT'],
      },
    });
  },
};

export interface QuotedMessage {
  key: { id: string; remoteJid: string; fromMe: boolean; participant?: string };
  text: string;
}

// ---- IDs das mensagens enviadas pelo bot (anti-loop) ----
const BOT_IDS_MAX = 2000;
const botMessageIds = new Set<string>();

function rememberBotMessage(id: string) {
  botMessageIds.add(id);
  if (botMessageIds.size > BOT_IDS_MAX) {
    const oldest = botMessageIds.values().next().value;
    if (oldest) botMessageIds.delete(oldest);
  }
}

/** true se a mensagem foi enviada por esta automação. */
export function isBotMessage(id: string | undefined | null): boolean {
  return !!id && botMessageIds.has(id);
}

export function isGroupJid(jid: string): boolean {
  return /^[\d-]+@g\.us$/.test(jid);
}
