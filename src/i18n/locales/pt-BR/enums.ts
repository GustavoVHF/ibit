import type {
  ChangeSector,
  ChangeSource,
  ChangeStatus,
  ImpactStatus,
  KpiSector,
  KpiStatus,
  ProjectRisk,
  ProjectRole,
  ProjectStakeholder,
  StatusReportSector,
} from '../../../types';

type Level = NonNullable<ProjectStakeholder['influenceLevel']>;
type Engagement = NonNullable<ProjectStakeholder['engagementCurrent']>;
type QualityRisk = 'Neutro' | 'Baixo' | 'Médio' | 'Alto';

/** Display labels for stored values. Keys are the stored values and must never be translated. */
export const enums = {
  projectRole: {
    owner: 'DONO',
    admin: 'ADMIN',
    editor: 'EDITOR',
    viewer: 'ESPECTADOR',
  } as Record<ProjectRole, string>,
  kpiSector: {
    Engenharia: 'Engenharia',
    Marketing: 'Marketing',
    Financeiro: 'Financeiro',
    'Gestão de Projetos': 'Gestão de Projetos',
    Design: 'Design',
    'Projeto Social': 'Projeto Social',
  } as Record<KpiSector, string>,
  kpiStatus: {
    Concluído: 'Concluído',
    'Em Andamento': 'Em Andamento',
    'Em Risco': 'Em Risco',
    Atrasado: 'Atrasado',
  } as Record<KpiStatus, string>,
  statusReportSector: {
    Geral: 'Geral',
    Marketing: 'Marketing',
    Engenharia: 'Engenharia',
    Financeiro: 'Financeiro',
    Design: 'Design',
    'Projeto Social': 'Projeto Social',
  } as Record<StatusReportSector, string>,
  impactStatus: {
    'Alto Impacto': 'Alto Impacto',
    'Impacto Moderado': 'Impacto Moderado',
    'Sem Impacto': 'Sem Impacto',
    'Pendente de Avaliação': 'Pendente de Avaliação',
  } as Record<ImpactStatus, string>,
  riskType: {
    Interno: 'Interno',
    Externo: 'Externo',
  } as Record<ProjectRisk['type'], string>,
  riskStatus: {
    Aberto: 'Aberto',
    Andamento: 'Andamento',
    Mitigado: 'Mitigado',
    Encerrado: 'Encerrado',
  } as Record<ProjectRisk['status'], string>,
  externalType: {
    Ameaça: 'Ameaça',
    Oportunidade: 'Oportunidade',
  } as Record<NonNullable<ProjectRisk['externalType']>, string>,
  changeSource: {
    Gantt: 'Gantt',
    Kanban: 'Kanban',
    'Status Reports': 'Status Reports',
    Orçamento: 'Orçamento',
    KPIs: 'KPIs',
    RACI: 'RACI',
    Riscos: 'Riscos',
    Inventário: 'Inventário',
    Plataforma: 'Plataforma',
  } as Record<ChangeSource, string>,
  changeSector: {
    Engenharia: 'Engenharia',
    Marketing: 'Marketing',
    Financeiro: 'Financeiro',
    Design: 'Design',
    Gestão: 'Gestão',
  } as Record<ChangeSector, string>,
  changeStatus: {
    Registrado: 'Registrado',
    Pendente: 'Pendente',
    Aprovado: 'Aprovado',
    Recusado: 'Recusado',
    Postergado: 'Postergado',
    Prolongado: 'Prolongado',
  } as Record<ChangeStatus, string>,
  qualityRisk: {
    Neutro: 'Neutro',
    Baixo: 'Baixo',
    Médio: 'Médio',
    Alto: 'Alto',
  } as Record<QualityRisk, string>,
  level: {
    Alto: 'Alto',
    Médio: 'Médio',
    Baixo: 'Baixo',
  } as Record<Level, string>,
  engagement: {
    Desinformado: 'Desinformado',
    Resistente: 'Resistente',
    Neutro: 'Neutro',
    Apoiador: 'Apoiador',
    Engajado: 'Engajado',
  } as Record<Engagement, string>,
};
