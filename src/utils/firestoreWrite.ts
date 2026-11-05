/**
 * Helpers para escritas no Firestore sem travar modais.
 *
 * O Firestore aplica a escrita no cache local na hora (e todo onSnapshot já
 * mostra o dado novo), mas a Promise de addDoc/updateDoc/setDoc/deleteDoc/
 * batch.commit só resolve quando o servidor confirma. Com a conexão lenta,
 * travada ou offline essa confirmação demora ou nunca chega, e o modal fica
 * "Salvando…" para sempre apesar de o dado já aparecer salvo.
 *
 * Este módulo não importa o Firebase de propósito, para poder ser testado com tsx.
 */

/** Tempo de espera pela confirmação do servidor antes de considerar a escrita "na fila". */
export const WRITE_GRACE_MS = 3000;
/** Tempo máximo para leituras/chamadas de rede dentro de fluxos de salvamento. */
export const READ_TIMEOUT_MS = 10000;

const DEFAULT_TIMEOUT_MESSAGE = 'Tempo esgotado. Verifique sua conexão e tente novamente.';

export class FirestoreTimeoutError extends Error {
  constructor(message: string = DEFAULT_TIMEOUT_MESSAGE) {
    super(message);
    this.name = 'FirestoreTimeoutError';
  }
}

/** Mensagem curta em pt-BR para mostrar ao usuário. */
export function friendlyWriteError(err: unknown): string {
  if (err instanceof FirestoreTimeoutError) return err.message;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (/permission/i.test(message) || /permission/i.test(code)) return 'Sem permissão para salvar.';
  return 'Erro ao salvar. Tente novamente.';
}

/** Aviso padrão quando uma escrita já "na fila" é rejeitada depois pelo servidor. */
export function reportLateWriteError(label: string, err: unknown): void {
  console.error(`[Firestore] Falha tardia ao sincronizar ${label}:`, err);
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`Não foi possível sincronizar ${label}: ${friendlyWriteError(err)} A alteração foi desfeita.`);
  }
}

export type CommitResult = 'committed' | 'queued';

export interface CommitWriteOptions {
  /** Nome do que está sendo salvo, ex.: 'a tarefa'. Usado no aviso de falha tardia. */
  label: string;
  graceMs?: number;
  /** Chamado no máximo uma vez se a escrita falhar depois do período de espera. */
  onLateError?: (err: unknown) => void;
}

/**
 * Aguarda a confirmação do servidor por até `graceMs`.
 * - Confirmou antes: 'committed'.
 * - Falhou antes: relança o erro (o modal continua aberto e mostra o erro).
 * - O tempo acabou: 'queued' — a escrita já está aplicada localmente e será
 *   sincronizada; uma falha posterior vai para `onLateError`.
 */
export function commitWrite(write: Promise<unknown>, opts: CommitWriteOptions): Promise<CommitResult> {
  const graceMs = opts.graceMs ?? WRITE_GRACE_MS;
  return new Promise<CommitResult>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      let lateHandled = false;
      write.catch((err) => {
        if (lateHandled) return;
        lateHandled = true;
        if (opts.onLateError) opts.onLateError(err);
        else reportLateWriteError(opts.label, err);
      });
      resolve('queued');
    }, graceMs);

    write.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve('committed');
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Rejeita com FirestoreTimeoutError se `p` não terminar em `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number = READ_TIMEOUT_MS, message: string = DEFAULT_TIMEOUT_MESSAGE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FirestoreTimeoutError(message)), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
