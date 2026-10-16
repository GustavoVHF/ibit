import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config } from './config.js';

/**
 * Inicializa o Firebase Admin.
 * Credencial: arquivo em GOOGLE_APPLICATION_CREDENTIALS (padrão no Docker)
 * ou JSON inline em FIREBASE_SERVICE_ACCOUNT.
 */
function init() {
  if (getApps().length) return getApps()[0];

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    return initializeApp({ credential: cert(JSON.parse(inline)) });
  }

  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    return initializeApp({ credential: cert(json), projectId: json.project_id });
  }

  return initializeApp({ credential: applicationDefault() });
}

const app = init();

export const db: Firestore = getFirestore(app, config.firestoreDatabaseId);

/** Coleções usadas pela automação (acesso só via Admin SDK). */
export const COLLECTIONS = {
  /** Vínculo projeto → grupo do WhatsApp. Doc ID = projectId. */
  integrations: 'whatsappIntegrations',
  /** Log/status de cada envio (dedupe). Doc ID determinístico. */
  notifications: 'whatsappNotifications',
  /** Log dos comandos recebidos nos grupos (dedupe por ID da mensagem). */
  commands: 'whatsappCommands',
} as const;
