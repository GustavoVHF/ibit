import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ChangeSource } from '../types';

export const CHANGE_HISTORY_COLLECTION = 'changeHistory';

interface LogAutomaticChangeInput {
  projectId?: string;
  source: ChangeSource;
  title: string;
  description?: string;
  actorUid?: string;
  actorName?: string;
  impactDays?: number;
  impactAmount?: number;
}

/**
 * Registra no Histórico de Mudanças uma alteração feita em outra ferramenta.
 *
 * Propositalmente "fire and forget": se o registro falhar (permissão, rede),
 * o erro é apenas logado no console e a operação original da ferramenta segue
 * normalmente — o histórico nunca deve bloquear o trabalho do time.
 *
 * Não espera a confirmação do servidor: a escrita é iniciada (já fica no cache
 * local) e a função retorna na hora, para que o modal que a chamou possa fechar.
 */
export async function logAutomaticChange({
  projectId,
  source,
  title,
  description,
  actorUid,
  actorName,
  impactDays,
  impactAmount,
}: LogAutomaticChangeInput): Promise<void> {
  if (!projectId || !actorUid) return;

  const warn = (error: unknown) => {
    console.warn('[Histórico de Mudanças] Não foi possível registrar a alteração automática:', error);
  };

  try {
    addDoc(collection(db, CHANGE_HISTORY_COLLECTION), {
      projectId,
      origin: 'auto',
      source,
      title,
      description: description || '',
      requestedBy: actorUid,
      requestedByName: actorName || 'Usuário',
      impactDays: impactDays || 0,
      impactAmount: impactAmount || 0,
      status: 'Registrado',
      createdAt: serverTimestamp(),
    }).catch(warn);
  } catch (error) {
    // addDoc pode lançar de forma síncrona (ex.: dado inválido).
    warn(error);
  }
}

/** Diferença em dias entre duas datas (positivo = adiou, negativo = antecipou). */
export function diffInDays(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Retorna uma nova data deslocada sem alterar a instância recebida. */
export function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** Converte Timestamp do Firestore, Date ou string em Date (ou null). */
export function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value.toDate) {
    const d = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (value.seconds) return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
