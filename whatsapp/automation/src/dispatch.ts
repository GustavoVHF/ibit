import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, COLLECTIONS } from './firebase.js';
import { config } from './config.js';

/**
 * Controle de envio no Firestore (coleção whatsappNotifications).
 *
 * Cada aviso tem um ID determinístico (ex.: deadline_<taskId>_d3_<yyyy-mm-dd>).
 * Antes de enviar, o registro é "reservado" numa transação; depois vira 'sent' ou 'failed'.
 * Assim, nada é enviado duas vezes, mesmo com duas execuções simultâneas,
 * e falhas são re-tentadas até MAX_SEND_ATTEMPTS.
 */

export type NotificationType = 'deadline' | 'weekly_report' | 'test';
export type NotificationStatus = 'sending' | 'sent' | 'failed';

export interface NotificationRecord {
  type: NotificationType;
  projectId: string;
  groupId: string;
  status: NotificationStatus;
  attempts: number;
  taskId?: string;
  taskTitle?: string;
  bucket?: string;
  dueDate?: Timestamp;
  weekKey?: string;
  messageId?: string | null;
  error?: string | null;
  snapshot?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lockedAt?: Timestamp;
  sentAt?: Timestamp;
}

/** Reserva expirada após esse tempo (processo caiu no meio do envio). */
const LOCK_TTL_MS = 10 * 60 * 1000;

const col = () => db.collection(COLLECTIONS.notifications);

export function notificationRef(id: string) {
  return col().doc(id);
}

/**
 * Tenta reservar o envio. Retorna true se este processo deve enviar.
 * false = já enviado, em envio por outro processo, ou tentativas esgotadas.
 */
export async function claim(id: string, data: Partial<NotificationRecord> & Pick<NotificationRecord, 'type' | 'projectId' | 'groupId'>): Promise<boolean> {
  const ref = notificationRef(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    const prev = snap.exists ? (snap.data() as NotificationRecord) : null;

    if (prev) {
      if (prev.status === 'sent') return false;
      if (prev.status === 'sending' && prev.lockedAt && now.toMillis() - prev.lockedAt.toMillis() < LOCK_TTL_MS) return false;
      if (prev.status === 'failed' && (prev.attempts ?? 0) >= config.maxSendAttempts) return false;
    }

    tx.set(
      ref,
      {
        ...data,
        status: 'sending',
        attempts: (prev?.attempts ?? 0) + 1,
        lockedAt: now,
        updatedAt: now,
        ...(prev ? {} : { createdAt: now }),
      },
      { merge: true },
    );
    return true;
  });
}

export async function markSent(ids: string[], messageId: string | null, extra: Record<string, unknown> = {}) {
  const batch = db.batch();
  for (const id of ids) {
    batch.set(
      notificationRef(id),
      { status: 'sent', messageId, error: null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...extra },
      { merge: true },
    );
  }
  await batch.commit();
}

export async function markFailed(ids: string[], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const batch = db.batch();
  for (const id of ids) {
    batch.set(notificationRef(id), { status: 'failed', error: message.slice(0, 1500), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

export async function getNotification(id: string): Promise<NotificationRecord | null> {
  const snap = await notificationRef(id).get();
  return snap.exists ? (snap.data() as NotificationRecord) : null;
}

/** IDs de doc do Firestore não podem ter "/". */
export function safeId(...parts: string[]): string {
  return parts.join('_').replace(/[\/\s]+/g, '-');
}
