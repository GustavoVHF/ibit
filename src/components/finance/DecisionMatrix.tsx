import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scale, Trash2, Trophy, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, OperationType } from '../../utils/errorHandlers';
import { DecisionMatrix as DecisionMatrixDoc } from '../../types';
import { optionLabel } from './decisionMatrixHelpers';
import DecisionMatrixEditor from './DecisionMatrixEditor';

interface DecisionMatrixProps {
  projectId: string;
  newRequestKey: number;
}

const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const millis = (ts: any): number => (ts?.toMillis ? ts.toMillis() : Date.now()); // pendente (serverTimestamp) = agora

export default function DecisionMatrix({ projectId, newRequestKey }: DecisionMatrixProps) {
  const [matrices, setMatrices] = useState<DecisionMatrixDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DecisionMatrixDoc | null>(null);
  const [toDelete, setToDelete] = useState<DecisionMatrixDoc | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const lastRequestKey = useRef(newRequestKey);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, 'decisionMatrices'), where('projectId', '==', projectId));
    return onSnapshot(
      q,
      (snapshot) => {
        setMatrices(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as DecisionMatrixDoc)));
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'decisionMatrices');
        } catch {
          // handleFirestoreError sempre relança; o erro é exibido inline.
        }
        setLoadError(
          /permission/i.test(error.message)
            ? 'Sem permissão para ler as matrizes. Verifique se as regras do Firestore foram publicadas.'
            : 'Erro ao carregar as matrizes de decisão.'
        );
        setLoading(false);
      }
    );
  }, [projectId]);

  // Botão "NOVA COMPARAÇÃO" do cabeçalho incrementa newRequestKey.
  useEffect(() => {
    if (newRequestKey === lastRequestKey.current) return;
    lastRequestKey.current = newRequestKey;
    setEditing(null);
    setEditorOpen(true);
  }, [newRequestKey]);

  const sorted = useMemo(
    () => [...matrices].sort((a, b) => millis(b.createdAt) - millis(a.createdAt)),
    [matrices]
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setDeleteError(null);
    try {
      await deleteDoc(doc(db, 'decisionMatrices', target.id));
      setToDelete(null);
    } catch (e) {
      try {
        handleFirestoreError(e, OperationType.DELETE, 'decisionMatrices');
      } catch {
        // exibido inline
      }
      setDeleteError('Erro ao excluir a comparação.');
    }
  };

  const openEditor = (m: DecisionMatrixDoc | null) => {
    setEditing(m);
    setEditorOpen(true);
  };

  return (
    <>
      {loadError && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm font-bold text-red-700">{loadError}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-50 min-h-[400px]">
          <Scale className="w-16 h-16 text-[#ff7f00] mb-4 stroke-1" />
          <h3 className="text-lg font-bold text-gray-900 uppercase tracking-widest mb-2">Nenhuma comparação</h3>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Compare 2 produtos com a matriz de decisão ponderada
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((m) => {
            const winner = m.result?.winnerIndex;
            const date = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('pt-BR') : '—';
            return (
              <div
                key={m.id}
                onClick={() => openEditor(m)}
                className="bg-white p-6 rounded-xl border border-gray-200 flex flex-col group relative cursor-pointer hover:border-[#ff7f00] hover:shadow-md transition-all h-full"
              >
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(null);
                      setToDelete(m);
                    }}
                    className="text-gray-400 hover:text-red-500"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center border border-orange-100 shrink-0">
                    <Scale className="w-5 h-5 text-[#ff7f00]" />
                  </div>
                  <div className="flex flex-col min-w-0 pr-8">
                    <span className="font-bold text-gray-400 uppercase tracking-[0.2em] text-[10px]">Matriz de decisão</span>
                    <span className="text-sm font-bold text-gray-900 truncate">{m.title}</span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{date}</span>
                  </div>
                </div>

                <div className="space-y-2 mt-auto">
                  {(m.options || []).map((o, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
                        winner === i ? 'border-[#ff7f00] bg-orange-50' : 'border-gray-100 bg-gray-50'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{o.name || optionLabel(i)}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{o.storeName}</p>
                      </div>
                      <span className={clsx('text-sm font-bold tabular-nums shrink-0', winner === i ? 'text-[#ff7f00]' : 'text-gray-700')}>
                        {m.result?.totals?.[i] != null ? fmt2(m.result.totals[i]) : '—'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  {m.result ? (
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border',
                        winner != null ? 'bg-orange-50 text-[#ff7f00] border-orange-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      )}
                    >
                      <Trophy className="w-3 h-3" />
                      {winner != null ? `Vencedor: ${m.options?.[winner]?.name || optionLabel(winner)}` : 'Empate'}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editorOpen && (
          <DecisionMatrixEditor
            key={editing?.id ?? 'new'}
            projectId={projectId}
            initial={editing}
            onClose={() => {
              setEditorOpen(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-gray-200 w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
            >
              <div className="p-6">
                <h3 className="text-lg font-bold uppercase tracking-widest text-gray-900 mb-2">Excluir comparação?</h3>
                <p className="text-sm text-gray-500">
                  A comparação <b className="text-gray-900">{toDelete.title}</b> será removida permanentemente.
                </p>
                {deleteError && <p className="text-xs font-bold text-red-600 mt-3">{deleteError}</p>}
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setToDelete(null)}
                  className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-red-700 active:scale-95 transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
