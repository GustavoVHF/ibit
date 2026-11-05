import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';
import { doc, addDoc, updateDoc, collection, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { ProjectKPI, UserProfile, KpiSector, KpiStatus, KpiComparator } from '../../types';
import { logFirestoreError, OperationType } from '../../utils/errorHandlers';
import { commitWrite, friendlyWriteError } from '../../utils/firestoreWrite';
import { KPI_SECTORS, KPI_STATUSES } from './kpiHelpers';

interface KpiFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  ownerId: string;
  item: ProjectKPI | null;
  projectMembers: UserProfile[];
  defaultSector?: KpiSector;
}

export default function KpiFormModal({
  isOpen,
  onClose,
  projectId,
  ownerId,
  item,
  projectMembers,
  defaultSector,
}: KpiFormModalProps) {
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(item?.name || '');
  const [sector, setSector] = useState<KpiSector>(item?.sector || defaultSector || 'Engenharia');
  const [description, setDescription] = useState(item?.description || '');
  const [targetComparator, setTargetComparator] = useState<KpiComparator>(item?.targetComparator || '>=');
  const [targetValue, setTargetValue] = useState(item?.targetValue !== undefined ? String(item.targetValue) : '');
  const [targetUnit, setTargetUnit] = useState(item?.targetUnit || '%');
  const [currentValue, setCurrentValue] = useState(item?.currentValue !== undefined ? String(item.currentValue) : '0');
  const [startDate, setStartDate] = useState(
    item?.startDate?.toDate ? item.startDate.toDate().toISOString().split('T')[0] : ''
  );
  const [deadline, setDeadline] = useState(
    item?.deadline?.toDate ? item.deadline.toDate().toISOString().split('T')[0] : ''
  );
  const [responsible, setResponsible] = useState(item?.responsible || '');
  const [status, setStatus] = useState<KpiStatus>(item?.status || 'Em Andamento');
  const [targetError, setTargetError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetValue.trim() || !deadline) return;

    const parsedTarget = parseFloat(targetValue.replace(',', '.'));
    if (Number.isNaN(parsedTarget)) {
      setTargetError('Informe um valor numérico válido para a meta.');
      return;
    }
    setTargetError('');

    const parsedCurrent = parseFloat(currentValue.replace(',', '.')) || 0;
    setLoading(true);

    try {
      const payload: any = {
        projectId,
        name: name.trim(),
        sector,
        description: description.trim(),
        targetComparator,
        targetValue: parsedTarget,
        targetUnit: targetUnit.trim(),
        currentValue: parsedCurrent,
        deadline: new Date(deadline),
        responsible: responsible || null,
        status,
        updatedAt: serverTimestamp(),
      };

      if (startDate) {
        payload.startDate = new Date(startDate);
      }

      if (item) {
        // Append a history point only when the current value actually changed,
        // mirroring the quick-update write convention. Guard against legacy
        // KPIs with an undefined currentValue so we don't log a phantom 0 point.
        if (item.currentValue !== undefined && parsedCurrent !== item.currentValue) {
          payload.history = arrayUnion({ date: new Date(), value: parsedCurrent, note: null });
        }
        await commitWrite(updateDoc(doc(db, 'projectKPIs', item.id), payload), { label: 'o KPI' });
      } else {
        await commitWrite(addDoc(collection(db, 'projectKPIs'), {
          ...payload,
          ownerId,
          history: [],
          createdAt: serverTimestamp(),
        }), { label: 'o KPI' });
      }
      onClose();
    } catch (error) {
      logFirestoreError(error, item ? OperationType.UPDATE : OperationType.CREATE, 'projectKPIs');
      alert(friendlyWriteError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl rounded-2xl flex flex-col"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">
              {item ? 'Editar KPI' : 'Novo KPI'}
            </h2>
            <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mt-0.5">
              Metas e Indicadores de Desempenho
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <form id="kpi-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Coluna Esquerda */}
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  NOME DO KPI *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  placeholder="Ex: Prototype test approval rate"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  SETOR *
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value as KpiSector)}
                  className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                >
                  {KPI_SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  DESCRIÇÃO
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-gray-300 px-4 py-2.5 text-gray-900 focus:outline-none focus:border-[#ff7f00] resize-none rounded-lg shadow-sm text-sm"
                  placeholder="Contexto do indicador, como é medido, por que importa..."
                />
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                  RESPONSÁVEL
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 max-h-40 overflow-y-auto shadow-inner">
                  {projectMembers.map((member) => (
                    <div
                      key={member.uid}
                      onClick={() => setResponsible(responsible === member.uid ? '' : member.uid)}
                      className={clsx(
                        'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all',
                        responsible === member.uid ? 'bg-orange-50 border border-orange-200 shadow-sm' : 'hover:bg-white border border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-white">
                          {member.photoURL ? (
                            <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400 bg-gray-50">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className={clsx('text-xs font-bold', responsible === member.uid ? 'text-[#ff7f00]' : 'text-gray-600')}>
                          {member.name}
                        </span>
                      </div>
                      <div className={clsx(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0',
                        responsible === member.uid ? 'bg-[#ff7f00] border-[#ff7f00]' : 'bg-white border-gray-300'
                      )}>
                        {responsible === member.uid && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                      </div>
                    </div>
                  ))}
                  {projectMembers.length === 0 && (
                    <span className="text-xs text-gray-400">Nenhum membro do projeto disponível.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Coluna Direita */}
            <div className="space-y-6">
              {/* Meta */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  META / TARGET *
                </label>
                <div className="grid grid-cols-[80px_1fr_90px] gap-2">
                  <select
                    value={targetComparator}
                    onChange={(e) => setTargetComparator(e.target.value as KpiComparator)}
                    className="w-full bg-white border border-gray-300 px-2 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm text-center"
                  >
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                    <option value="=">=</option>
                  </select>
                  <input
                    type="text"
                    required
                    inputMode="decimal"
                    value={targetValue}
                    onChange={(e) => { setTargetValue(e.target.value); if (targetError) setTargetError(''); }}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                    placeholder="85"
                  />
                  <input
                    type="text"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-semibold rounded-lg shadow-sm text-sm"
                    placeholder="% / dias"
                  />
                </div>
                {targetError ? (
                  <p className="text-[10px] text-red-500 font-bold mt-1.5">{targetError}</p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-1.5">Ex: ≥ 85% ou ≤ 3 revisões</p>
                )}
              </div>

              {/* Valor Atual */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  VALOR ATUAL *
                </label>
                <input
                  type="text"
                  required
                  inputMode="decimal"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  placeholder="0"
                />
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    DATA INICIAL
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    PRAZO / DEADLINE *
                  </label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  STATUS *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as KpiStatus)}
                  className="w-full bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg shadow-sm text-sm"
                >
                  {KPI_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="kpi-form"
            disabled={loading || !name.trim() || !targetValue.trim() || !deadline}
            className="px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 transition-colors rounded-lg shadow-lg shadow-orange-100 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {item ? 'Salvar Alterações' : 'Criar KPI'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
