import { DecisionCriterion, DecisionCriterionKey, DecisionOption } from '../../types';
import { getLocale, getMessages } from '../../i18n';

// Matriz de Decisão Ponderada — Weighted Sum Model (WSM).
// Pesos normalizados (Σ = 100%), notas em escala comum 0–10 por normalização linear:
//   custo    → 10 × min / x   (menor é melhor)
//   benefício → 10 × x / max  (maior é melhor; max = 0 ⇒ notas 0)
//   qualitativo (1–10) → nota direta
// Nota final T = Σ nota × peso. Empate quando |T_A − T_B| < 0.005.

export type CriterionType = 'cost' | 'benefit';
export type CriterionKind = 'quantitative' | 'qualitative';

export interface CriterionMeta {
  key: DecisionCriterionKey;
  label: string;
  type: CriterionType;
  kind: CriterionKind;
  unit: string;
  description: string;
}

// Display texts are resolved on read so they follow the current language; key is the stored value.
const text = (key: DecisionCriterionKey) => getMessages().finance.criteria[key];

export const CRITERIA_CATALOG: (CriterionMeta & ThisType<CriterionMeta>)[] = [
  {
    key: 'preco',
    get label() { return text(this.key).label; },
    type: 'cost',
    kind: 'quantitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
  {
    key: 'pesoPorValor',
    get label() { return text(this.key).label; },
    type: 'cost',
    kind: 'quantitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
  {
    key: 'ratePreco',
    get label() { return text(this.key).label; },
    type: 'benefit',
    kind: 'qualitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
  {
    key: 'rateQualidade',
    get label() { return text(this.key).label; },
    type: 'benefit',
    kind: 'quantitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
  {
    key: 'sustentabilidade',
    get label() { return text(this.key).label; },
    type: 'benefit',
    kind: 'qualitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
  {
    key: 'tempoEntrega',
    get label() { return text(this.key).label; },
    type: 'cost',
    kind: 'quantitative',
    get unit() { return text(this.key).unit; },
    get description() { return text(this.key).description; },
  },
];

export const DEFAULT_CRITERIA: DecisionCriterion[] = [
  { key: 'preco', weight: 30 },
  { key: 'pesoPorValor', weight: 15 },
  { key: 'ratePreco', weight: 10 },
  { key: 'rateQualidade', weight: 25 },
  { key: 'sustentabilidade', weight: 10 },
  { key: 'tempoEntrega', weight: 10 },
];

export const TIE_THRESHOLD = 0.005;

export function getCriterionMeta(key: DecisionCriterionKey): CriterionMeta {
  return CRITERIA_CATALOG.find((c) => c.key === key)!;
}

/** Linha editável de critério (todos os critérios do catálogo; desmarcados guardam o peso). */
export interface CriteriaRow {
  key: DecisionCriterionKey;
  enabled: boolean;
  weight: number;
}

/** Critérios salvos → linhas na ordem do catálogo (desmarcados recebem o peso padrão). */
export function buildCriteriaRows(criteria: DecisionCriterion[]): CriteriaRow[] {
  return CRITERIA_CATALOG.map((meta) => {
    const current = criteria.find((c) => c.key === meta.key);
    const fallback = DEFAULT_CRITERIA.find((c) => c.key === meta.key)?.weight ?? 0;
    return { key: meta.key, enabled: !!current, weight: current ? current.weight : fallback };
  });
}

/** Linhas marcadas → critérios {key, weight}. */
export function rowsToCriteria(rows: CriteriaRow[]): DecisionCriterion[] {
  return rows.filter((r) => r.enabled).map((r) => ({ key: r.key, weight: r.weight }));
}

const safeWeight = (w: number) => (Number.isFinite(w) && w > 0 ? w : 0);

export function sumWeights(criteria: DecisionCriterion[]): number {
  return criteria.reduce((acc, c) => acc + safeWeight(c.weight), 0);
}

/** Pesos normalizados como frações (Σ = 1). Σ bruto = 0 ⇒ todos 0. */
export function normalizeWeights(criteria: DecisionCriterion[]): number[] {
  const total = sumWeights(criteria);
  if (total <= 0) return criteria.map(() => 0);
  return criteria.map((c) => safeWeight(c.weight) / total);
}

/** Reescreve os pesos brutos em % com 2 casas; o resíduo do arredondamento vai para o maior peso (Σ = 100). */
export function rebalanceTo100(criteria: DecisionCriterion[]): DecisionCriterion[] {
  const total = sumWeights(criteria);
  if (total <= 0 || criteria.length === 0) return criteria.map((c) => ({ ...c }));
  // Trabalha em centésimos inteiros para evitar erro de ponto flutuante.
  const hundredths = criteria.map((c) => Math.round((safeWeight(c.weight) / total) * 10000));
  const residue = 10000 - hundredths.reduce((a, b) => a + b, 0);
  let largest = 0;
  hundredths.forEach((h, i) => {
    if (h > hundredths[largest]) largest = i;
  });
  hundredths[largest] += residue;
  return criteria.map((c, i) => ({ ...c, weight: hundredths[i] / 100 }));
}

/** Valor bruto de um critério para uma opção (R$/kg é derivado de preço / peso). */
export function rawValue(option: DecisionOption, key: DecisionCriterionKey): number | null {
  switch (key) {
    case 'preco':
      return option.price;
    case 'pesoPorValor':
      return option.price != null && option.weightKg != null && option.weightKg > 0
        ? option.price / option.weightKg
        : null;
    case 'ratePreco':
      return option.priceRating;
    case 'rateQualidade':
      return option.qualityRating;
    case 'sustentabilidade':
      return option.sustainability;
    case 'tempoEntrega':
      return option.deliveryDays;
    default:
      return null;
  }
}

export interface MatrixIssue {
  optionIndex: number | null; // null = problema geral (ex.: critérios)
  key: DecisionCriterionKey | null;
  message: string;
}

export type OptionField = 'price' | 'weightKg' | 'deliveryDays' | 'priceRating' | 'qualityRating' | 'sustainability';

const FIELDS_BY_CRITERION: Record<DecisionCriterionKey, OptionField[]> = {
  preco: ['price'],
  pesoPorValor: ['price', 'weightKg'],
  ratePreco: ['priceRating'],
  rateQualidade: ['qualityRating'],
  sustentabilidade: ['sustainability'],
  tempoEntrega: ['deliveryDays'],
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fieldIssue(option: DecisionOption, field: OptionField): string | null {
  const v = option[field];
  const m = getMessages().finance;
  switch (field) {
    case 'price':
      if (!isNum(v)) return m.issuePrice;
      return v > 0 ? null : m.issuePricePositive;
    case 'weightKg':
      if (!isNum(v)) return m.issueWeight;
      return v > 0 ? null : m.issueWeightPositive;
    case 'deliveryDays':
      if (!isNum(v)) return m.issueDelivery;
      return Number.isInteger(v) && v >= 1 ? null : m.issueDeliveryInt;
    case 'priceRating':
      if (!isNum(v)) return m.issuePriceRating;
      return v >= 1 && v <= 10 ? null : m.issuePriceRatingRange;
    case 'qualityRating':
      if (!isNum(v)) return m.issueQuality;
      return v >= 0 && v <= 5 ? null : m.issueQualityRange;
    case 'sustainability':
      if (!isNum(v)) return m.issueSustainability;
      return v >= 1 && v <= 10 ? null : m.issueSustainabilityRange;
    default:
      return null;
  }
}

/** Dados ausentes/inválidos para os critérios selecionados (cada campo é reportado uma vez por opção). */
export function validateOptions(options: DecisionOption[], criteria: DecisionCriterion[]): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  options.forEach((option, optionIndex) => {
    const seen = new Set<OptionField>();
    criteria.forEach((c) => {
      FIELDS_BY_CRITERION[c.key].forEach((field) => {
        if (seen.has(field)) return;
        seen.add(field);
        const message = fieldIssue(option, field);
        if (message) issues.push({ optionIndex, key: c.key, message });
      });
    });
  });
  return issues;
}

/** Campos da opção ausentes/inválidos para os critérios selecionados (mesma regra de validateOptions). */
export function invalidFields(option: DecisionOption, criteria: DecisionCriterion[]): Set<OptionField> {
  const invalid = new Set<OptionField>();
  criteria.forEach((c) => {
    FIELDS_BY_CRITERION[c.key].forEach((field) => {
      if (!invalid.has(field) && fieldIssue(option, field)) invalid.add(field);
    });
  });
  return invalid;
}

export interface MatrixRow {
  key: DecisionCriterionKey;
  weight: number; // fração normalizada
  values: number[];
  scores: number[];
  weighted: number[];
}

export interface MatrixComputation {
  status: 'ok' | 'incomplete';
  rows: MatrixRow[];
  totals: number[];
  winnerIndex: number | null;
  issues: MatrixIssue[];
}

export function computeMatrix(options: DecisionOption[], criteria: DecisionCriterion[]): MatrixComputation {
  const issues: MatrixIssue[] = [];
  if (criteria.length === 0 || sumWeights(criteria) <= 0) {
    issues.push({ optionIndex: null, key: null, message: getMessages().finance.issueNoCriteria });
  }
  issues.push(...validateOptions(options, criteria));

  if (issues.length > 0) {
    return { status: 'incomplete', rows: [], totals: options.map(() => 0), winnerIndex: null, issues };
  }

  const weights = normalizeWeights(criteria);
  const rows: MatrixRow[] = criteria.map((c, i) => {
    const meta = getCriterionMeta(c.key);
    const values = options.map((o) => rawValue(o, c.key) as number);
    let scores: number[];
    if (meta.kind === 'qualitative') {
      scores = values.slice();
    } else if (meta.type === 'cost') {
      const min = Math.min(...values);
      scores = values.map((v) => (10 * min) / v);
    } else {
      const max = Math.max(...values);
      scores = values.map((v) => (max === 0 ? 0 : (10 * v) / max));
    }
    return { key: c.key, weight: weights[i], values, scores, weighted: scores.map((s) => s * weights[i]) };
  });

  const totals = options.map((_, o) => rows.reduce((acc, r) => acc + r.weighted[o], 0));

  let best = 0;
  totals.forEach((t, i) => {
    if (t > totals[best]) best = i;
  });
  const tied = totals.some((t, i) => i !== best && Math.abs(totals[best] - t) < TIE_THRESHOLD);

  return { status: 'ok', rows, totals, winnerIndex: tied ? null : best, issues: [] };
}

export function emptyOption(source: DecisionOption['source']): DecisionOption {
  return {
    source,
    storeName: source === 'shopee' ? 'Shopee' : '',
    name: '',
    link: '',
    imageUrl: null,
    itemId: null,
    shopId: null,
    shopName: null,
    price: null,
    weightKg: null,
    deliveryDays: null,
    priceRating: null,
    qualityRating: null,
    sustainability: null,
    ratingStar: null,
    sales: null,
  };
}

/** Garante todos os campos (sem `undefined`, que o Firestore rejeita). */
export function toStoredOption(option: Partial<DecisionOption> & { source: DecisionOption['source'] }): DecisionOption {
  const base = emptyOption(option.source);
  const merged = { ...base } as Record<string, unknown>;
  (Object.keys(base) as (keyof DecisionOption)[]).forEach((k) => {
    const v = option[k];
    if (v !== undefined) merged[k] = v;
  });
  return merged as unknown as DecisionOption;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Nome da loja a partir do link (mercadolivre/mercadolibre → Mercado Livre, amazon → Amazon, senão o hostname). */
export function storeNameFromUrl(value: string): string {
  if (!isHttpUrl(value)) return '';
  const host = new URL(value.trim()).hostname.replace(/^www\./, '');
  if (/mercadoli(vre|bre)/i.test(host)) return 'Mercado Livre';
  if (/amazon/i.test(host)) return 'Amazon';
  if (/shopee|shope\.ee/i.test(host)) return 'Shopee';
  return host;
}

/** Identificação mínima do produto (nome; link http/https obrigatório para outras lojas). */
export function validateProductIdentity(options: DecisionOption[]): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  options.forEach((o, optionIndex) => {
    if (o.source === 'shopee' && !o.itemId) {
      issues.push({ optionIndex, key: null, message: getMessages().finance.issueShopeeProduct });
      return;
    }
    if (o.source === 'manual') {
      if (!isHttpUrl(o.link)) issues.push({ optionIndex, key: null, message: getMessages().finance.issueLink });
      if (!o.storeName.trim()) issues.push({ optionIndex, key: null, message: getMessages().finance.issueStore });
    }
    if (!o.name.trim()) issues.push({ optionIndex, key: null, message: getMessages().finance.issueName });
  });
  return issues;
}

const brl = (v: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'BRL' }).format(v);
const num = (v: number, digits = 2) =>
  new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);

export function formatCriterionValue(key: DecisionCriterionKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (key) {
    case 'preco':
      return brl(value);
    case 'pesoPorValor':
      return `${brl(value)}/kg`;
    case 'tempoEntrega':
      return getMessages().finance.daysValue(num(value, 0), value === 1);
    case 'rateQualidade':
      return `${num(value, 2)} ★`;
    default:
      return `${num(value, 2)}/10`;
  }
}

export function optionLabel(index: number): string {
  return getMessages().finance.optionLabel(String.fromCharCode(65 + index));
}
