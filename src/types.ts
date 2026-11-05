export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: 'admin' | 'user';
}

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Project {
  id: string;
  name: string;
  description?: string;
  photoURL?: string;
  ownerId: string;
  shortId: string;
  members: string[];
  roles?: { [uid: string]: ProjectRole }; // RBAC: maps user UID to role
  createdAt: any; // Firestore Timestamp
  updatedAt?: any; // Added for traceability
  ganttStartDate?: any; // Start date of Gantt Chart timeline
  targetEventName?: string; // Countdown KPI: event name
  targetDate?: any; // Countdown KPI: target date (Firestore Timestamp)
  auditToken?: string; // Public Audit: unique token for public read-only access (optional for backward compatibility)
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  order: number;
  color?: string;
  ownerId: string; // Added for security
  createdAt: any;
  updatedAt?: any;
}

export interface Task {
  id: string;
  projectId: string;
  boardId: string;
  title: string;
  description?: string;
  assignedTo?: string | string[]; // Support single string (legacy) and array
  order: number;
  color?: string;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any; // Added for traceability
  ownerId: string; // Added for traceability (unifying authorId)
  startDate?: any; // Firestore Timestamp
  dueDate?: any; // Firestore Timestamp
  tags?: string[];
}

export interface QuadroNode {
  id: string;
  projectId: string; // Added for security and indexing
  type: string;
  position: { x: number; y: number };
  data: { label: string; color?: string; [key: string]: any };
  style?: any;
  createdBy: string; // Track who created the node
  createdAt: any;
}

export interface QuadroEdge {
  id: string;
  projectId: string; // Added for security and indexing
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style?: any;
  createdBy: string; // Track who created the edge
  createdAt: any;
}

export interface Quadro {
  id: string;
  projectId: string;
  name: string;
  nodes: QuadroNode[];
  edges: QuadroEdge[];
  createdAt: any;
  updatedAt: any;
  ownerId: string;
}

export interface InventoryItem {
  id: string;
  projectId: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  location: string; // Depósito
  tags: string[];
  assignedTo: string[]; // Responsáveis (Array de UIDs)
  taskId?: string; // Link para tarefa do Kanban
  createdAt: any;
  updatedAt: any;
}

export interface ProjectTag {
  id: string;
  projectId: string;
  label: string;
  color: string;
  createdAt: any;
}

export interface AssetFolder {
  id: string;
  projectId: string;
  parentId?: string | null; // Support nested folders
  name: string;
  order: number;
  createdAt: any;
  updatedAt: any;
  ownerId: string;
}
export interface AssetLink {
  id: string;
  folderId?: string; // Optional for root assets
  projectId: string;
  name: string;
  url: string;
  createdAt: any;
  updatedAt: any;
  ownerId: string;
}

export interface AssetDocument {
  id: string;
  projectId: string;
  folderId?: string | null;
  type: 'note';
  title: string;
  content: Record<string, any>; // TipTap JSON content
  syncEvents?: Array<{title: string, date: string}>;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
}

export interface RACIMatrix {
  id: string;
  projectId: string;
  name: string;
  createdAt: any;
  updatedAt: any;
  ownerId: string;
}

export interface RACITask {
  id: string;
  matrixId: string;
  projectId: string;
  title: string;
  order: number;
  createdAt: any;
}

export interface RACIStakeholder {
  id: string;
  matrixId: string;
  projectId: string;
  name: string;
  role?: string;
  userId?: string;
  order: number;
  createdAt: any;
}

export type RACIRole = 'R' | 'A' | 'C' | 'I' | null;

export interface RACIAssignment {
  id: string;
  matrixId: string;
  projectId: string;
  taskId: string;
  participantId: string; // User UID or Stakeholder ID
  role: RACIRole;
  updatedAt: any;
}

export interface GanttTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  section?: string; // e.g. ENGENHARIA, PROJETO SOCIAL
  category?: string; // e.g. MILESTONE, HIGH RISK, GOAL...
  dependencies?: string[]; // Array of predecessor task IDs
  assignedTo?: string[]; // Array of projectMember UIDs or ProjectStakeholder IDs
  startDate: any; // Firestore Timestamp
  endDate: any; // Firestore Timestamp
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
  progress: number; // 0-100
  color?: string;
  order: number;
  createdAt: any;
  updatedAt: any;
  changeLog?: GanttTaskChange[];
}

export interface GanttTaskChange {
  id: string;
  changedAt: any; // Firestore Timestamp
  changedBy: {
    uid: string;
    name: string;
  };
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface ProjectStakeholder {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  userId?: string; // If it's a project member
  photoURL?: string;
  createdAt: any;
  description?: string;
  organization?: string;
  contactInfo?: string;
  activities?: string;
  tags?: string[];
  influenceLevel?: 'Alto' | 'Médio' | 'Baixo';
  interestLevel?: 'Alto' | 'Médio' | 'Baixo';
  expectations?: string;
  engagementCurrent?: 'Desinformado' | 'Resistente' | 'Neutro' | 'Apoiador' | 'Engajado';
  engagementDesired?: 'Desinformado' | 'Resistente' | 'Neutro' | 'Apoiador' | 'Engajado';
  actionStrategy?: string;
  updatedAt?: any;
  communications?: StakeholderCommunication[];
}

export interface StakeholderCommunication {
  id: string;
  what: string;
  method: string;
  when: string;
  responsible?: string;
}

export interface Transaction {
  id: string;
  projectId: string;
  title: string;
  amount: number;
  date: any; // Firestore Timestamp
  category: string;
  type: 'income' | 'expense';
  budgetId?: string; // Links this transaction to a specific budget
  receiptUrl?: string; // Uploaded receipt image link
  isExternal?: boolean; // Recurso externo (patrocínio/investimento de terceiros) - não entra no cálculo do saldo
  createdAt: any; // Firestore Timestamp
}

export interface Budget {
  id: string;
  projectId: string;
  name: string;
  amount: number;
  date: string; // 'YYYY-MM'
  createdAt: any; // Firestore Timestamp
}

export type KpiSector = 'Engenharia' | 'Marketing' | 'Financeiro' | 'Gestão de Projetos' | 'Design' | 'Projeto Social';

export type KpiStatus = 'Concluído' | 'Em Andamento' | 'Em Risco' | 'Atrasado';

export type KpiComparator = '>=' | '<=' | '=';

export interface KpiHistoryEntry {
  date: any; // Firestore Timestamp
  value: number;
  note?: string;
}

export interface ProjectKPI {
  id: string;
  projectId: string;
  name: string;
  sector: KpiSector;
  description?: string;
  targetComparator: KpiComparator;
  targetValue: number;
  targetUnit?: string; // e.g. '%', 'revisões', 'dias'
  currentValue: number;
  startDate?: any; // Firestore Timestamp
  deadline: any; // Firestore Timestamp
  responsible?: string; // Project member UID
  status: KpiStatus;
  history?: KpiHistoryEntry[];
  ownerId: string;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}

export type StatusReportSector = 'Geral' | 'Marketing' | 'Engenharia' | 'Financeiro' | 'Design' | 'Projeto Social';

export interface StatusReportActionItem {
  id: string;
  task: string;
  responsible?: string; // Project member UID
  done: boolean;
}

export interface StatusReportAttachment {
  name: string;
  url: string;
}

export type ImpactStatus = 'Alto Impacto' | 'Impacto Moderado' | 'Sem Impacto' | 'Pendente de Avaliação';

export interface StatusReportImpactEvaluation {
  id: string;
  date: any; // Firestore Timestamp
  authorUid: string;
  authorName: string;
  whatChanged: string; // "O que mudou?"
  impactStatus: ImpactStatus;
}

export interface StatusReportNextMeeting {
  scheduled: boolean;
  date?: any; // Firestore Timestamp
  agenda?: string; // Pauta prévia
  syncCalendar?: boolean;
  createKanbanCard?: boolean;
  taskId?: string; // Linked kanban/calendar task, if created
}

export interface StatusReport {
  id: string;
  projectId: string;
  date: any; // Firestore Timestamp — combined meeting date + time
  location: string;
  sector: StatusReportSector;
  participants: string[]; // Project member UIDs
  agenda: string; // Pauta principal
  minutes: string; // Registros / discussão
  outcome?: string; // Resultado alcançado (texto)
  outcomeRating?: number; // Resultado alcançado (1-5 estrelas)
  actionItems?: StatusReportActionItem[];
  attachments?: StatusReportAttachment[];
  approved: boolean; // true = Concluída, false = Pendente
  approvedBy?: string; // Project member UID who marked as concluded
  approvedAt?: any; // Firestore Timestamp
  impactStatus?: ImpactStatus;
  impactEvaluations?: StatusReportImpactEvaluation[];
  nextMeeting?: StatusReportNextMeeting;
  ownerId: string;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}

export interface ProjectRisk {
  id: string;
  numericId: number;
  projectId: string;
  type: 'Interno' | 'Externo';
  risk: string;
  description?: string;
  probability: 'B' | 'M' | 'A' | 'C'; // B = LOW, M = MEDIUM, A = HIGH, C = CRITICAL
  impact: 1 | 2 | 3 | 4 | 5;
  priority?: string;
  responsible?: string;
  actionPlan?: string;
  status: 'Aberto' | 'Andamento' | 'Mitigado' | 'Encerrado';
  lastReviewDate?: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
  tags?: string[];
  impactAreas?: string[];
  impactJustification?: string;
  cause?: string;
  externalType?: 'Ameaça' | 'Oportunidade';
}

// ===============================================================
// HISTÓRICO DE MUDANÇAS
// ===============================================================

/** 'auto' = gerado pela plataforma; 'manual' = solicitado por um membro. */
export type ChangeOrigin = 'auto' | 'manual';

/** Ferramenta que originou um registro automático. */
export type ChangeSource =
  | 'Gantt'
  | 'Kanban'
  | 'Status Reports'
  | 'Orçamento'
  | 'KPIs'
  | 'RACI'
  | 'Riscos'
  | 'Inventário'
  | 'Plataforma';

export type ChangeSector = 'Engenharia' | 'Marketing' | 'Financeiro' | 'Design' | 'Gestão';

/**
 * 'Registrado' é o status fixo dos registros automáticos (nada a decidir).
 * Solicitações manuais nascem 'Pendente' e recebem a decisão do gestor.
 */
export type ChangeStatus = 'Registrado' | 'Pendente' | 'Aprovado' | 'Recusado' | 'Postergado' | 'Prolongado';

export interface ChangeHistoryEntry {
  id: string;
  projectId: string;
  origin: ChangeOrigin;
  source?: ChangeSource; // preenchido nos registros automáticos

  title: string;
  description?: string; // motivo (manual) ou detalhe do que mudou (automático)
  sector?: ChangeSector;

  // Vínculos opcionais de uma solicitação manual para aplicação automática.
  linkedGanttTaskId?: string | null;
  linkedKanbanTaskId?: string | null;
  appliedAt?: any; // Firestore Timestamp — quando os vínculos foram atualizados
  appliedBy?: string | null;

  requestedBy: string; // UID de quem solicitou ou disparou a alteração
  requestedByName?: string; // nome no momento do registro (histórico imutável)

  impactDays?: number; // dias a mais (+) ou a menos (-)
  impactAmount?: number; // R$ a mais (+) ou a menos (-)
  qualityRisk?: 'Neutro' | 'Baixo' | 'Médio' | 'Alto';

  status: ChangeStatus;
  decisionNote?: string; // justificativa obrigatória da decisão
  decidedBy?: string | null;
  decidedByName?: string | null;
  decidedAt?: any; // Firestore Timestamp — data exata da decisão/aprovação

  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}

// Produto normalizado retornado por POST /api/shopee-product (Shopee Affiliate Open API)
export interface ShopeeProduct {
  itemId: string;
  shopId: string;
  productName: string;
  price: number; // priceMin (fallback priceMax), em R$
  priceMin: number;
  priceMax: number;
  ratingStar: number | null; // 0–5
  sales: number | null;
  shopName: string;
  shopType?: number[]; // 1 Mall, 2 Star, 4 Star+ (não persistido)
  imageUrl: string;
  productLink: string;
  offerLink: string;
}

// Matriz de Decisão Ponderada (Financeiro) — coleção `decisionMatrices`
export type DecisionCriterionKey = 'preco' | 'pesoPorValor' | 'ratePreco' | 'rateQualidade' | 'sustentabilidade' | 'tempoEntrega';

export interface DecisionCriterion {
  key: DecisionCriterionKey;
  weight: number; // peso bruto ≥ 0 (normalizado para 100% no cálculo)
}

export interface DecisionOption {
  source: 'shopee' | 'manual';
  storeName: string; // 'Shopee' | 'Mercado Livre' | texto livre
  name: string;
  link: string; // URL do produto (obrigatório para manual; productLink para shopee)
  imageUrl?: string | null;
  itemId?: string | null; // somente shopee
  shopId?: string | null;
  shopName?: string | null;
  price: number | null; // R$
  weightKg: number | null;
  deliveryDays: number | null;
  priceRating: number | null; // 1–10
  qualityRating: number | null; // 0–5 estrelas
  sustainability: number | null; // 1–10
  ratingStar?: number | null; // valor bruto da Shopee
  sales?: number | null;
}

export interface DecisionMatrixResult {
  totals: number[];
  winnerIndex: number | null; // null = empate
}

export interface DecisionMatrix {
  id: string;
  projectId: string;
  title: string;
  criteria: DecisionCriterion[];
  options: DecisionOption[]; // exatamente 2
  result: DecisionMatrixResult | null;
  ownerId: string;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}
