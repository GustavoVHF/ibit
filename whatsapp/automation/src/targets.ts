import { FieldValue } from 'firebase-admin/firestore';
import { db, COLLECTIONS } from './firebase.js';
import { config } from './config.js';

/**
 * Vínculo projeto IBIT → grupo do WhatsApp.
 * Fonte principal: Firestore `whatsappIntegrations/{projectId}`.
 * Fallback: DEFAULT_PROJECT_ID + WHATSAPP_GROUP_ID do .env.
 */
export interface WhatsAppTarget {
  projectId: string;
  groupId: string;
  groupName?: string;
  enabled: boolean;
  deadlineAlerts: boolean;
  weeklyReport: boolean;
  source: 'firestore' | 'env';
}

export async function listTargets(): Promise<WhatsAppTarget[]> {
  const snap = await db.collection(COLLECTIONS.integrations).get();
  const targets: WhatsAppTarget[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      projectId: data.projectId ?? d.id,
      groupId: data.groupId,
      groupName: data.groupName,
      enabled: data.enabled !== false,
      deadlineAlerts: data.deadlineAlerts !== false,
      weeklyReport: data.weeklyReport !== false,
      source: 'firestore' as const,
    };
  });

  if (config.defaultProjectId && config.defaultGroupId && !targets.some((t) => t.projectId === config.defaultProjectId)) {
    targets.push({
      projectId: config.defaultProjectId,
      groupId: config.defaultGroupId,
      enabled: true,
      deadlineAlerts: true,
      weeklyReport: true,
      source: 'env',
    });
  }

  return targets.filter((t) => t.enabled && t.groupId);
}

export async function saveTarget(input: {
  projectId: string;
  groupId: string;
  groupName?: string;
  deadlineAlerts?: boolean;
  weeklyReport?: boolean;
  enabled?: boolean;
}) {
  const ref = db.collection(COLLECTIONS.integrations).doc(input.projectId);
  const exists = (await ref.get()).exists;
  await ref.set(
    {
      projectId: input.projectId,
      groupId: input.groupId,
      groupName: input.groupName ?? null,
      enabled: input.enabled ?? true,
      deadlineAlerts: input.deadlineAlerts ?? true,
      weeklyReport: input.weeklyReport ?? true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
}

export async function disableTarget(projectId: string) {
  await db.collection(COLLECTIONS.integrations).doc(projectId).set({ enabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
