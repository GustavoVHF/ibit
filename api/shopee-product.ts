import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createHash } from 'node:crypto';
import type { ShopeeProduct } from '../src/types';

export type { ShopeeProduct };

const SHOPEE_ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_HOSTS = ['shopee.com.br', 'www.shopee.com.br'];
const SHORT_HOSTS = ['s.shopee.com.br', 'shope.ee'];
const ID_RE = /^\d{1,20}$/;
const SEARCH_LIMIT = 10;
const SEARCH_FETCH_LIMIT = 20;

const SHOPEE_ERROR_MESSAGES: Record<number, string> = {
  10020: 'Assinatura inválida na API Shopee',
  10030: 'Limite de requisições da Shopee atingido, tente novamente',
  10035: 'Conta sem acesso à API de afiliados',
};

// Initialize Firebase Admin (lazy, so a missing service account becomes a handled error)
function getAdminAuth() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

export class ShopeeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ProductQueryInput =
  | { mode: 'item'; itemId: string; shopId?: string | null }
  | { mode: 'search'; keyword: string; page?: number; sortType?: 1 | 2 };

export function parseShopeeUrl(url: string): { shopId: string; itemId: string } | null {
  // /opaanlp/{shopId}/{itemId} is where s.shopee.com.br affiliate short links redirect to
  const m =
    url.match(/-i\.(\d+)\.(\d+)/) ||
    url.match(/\/product\/(\d+)\/(\d+)/) ||
    url.match(/\/opaanlp\/(\d+)\/(\d+)/);
  if (!m || !ID_RE.test(m[1]) || !ID_RE.test(m[2])) return null;
  return { shopId: m[1], itemId: m[2] };
}

export function buildProductQuery(input: ProductQueryInput): string {
  const filters: string[] = [];
  if (input.mode === 'item') {
    if (!ID_RE.test(input.itemId)) throw new ShopeeError(400, 'itemId inválido');
    filters.push(`itemId: ${input.itemId}`);
    if (input.shopId) {
      if (!ID_RE.test(input.shopId)) throw new ShopeeError(400, 'shopId inválido');
      filters.push(`shopId: ${input.shopId}`);
    }
    filters.push('limit: 1');
  } else {
    const page = input.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 20) throw new ShopeeError(400, 'Página inválida');
    const sortType = input.sortType ?? 1; // 1 = relevância, 2 = mais vendidos
    if (sortType !== 1 && sortType !== 2) throw new ShopeeError(400, 'Ordenação inválida');
    filters.push(
      `keyword: ${JSON.stringify(input.keyword)}`,
      `sortType: ${sortType}`,
      `page: ${page}`,
      `limit: ${SEARCH_FETCH_LIMIT}`,
    );
  }
  return `{ productOfferV2(${filters.join(', ')}) { nodes { itemId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar shopId shopName shopType commissionRate } pageInfo { page limit hasNextPage } } }`;
}

export function signShopeeRequest(appId: string, secret: string, payload: string, ts: number): string {
  return createHash('sha256').update(appId + ts + payload + secret).digest('hex');
}

export async function callShopee(query: string): Promise<any[]> {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) throw new ShopeeError(500, 'Integração Shopee não configurada');

  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const sig = signShopeeRequest(appId, secret, payload, ts);

  const upstream = await fetch(SHOPEE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`,
    },
    body: payload,
  });

  if (!upstream.ok) {
    console.error('Shopee upstream HTTP status:', upstream.status);
    throw new ShopeeError(502, 'Erro ao consultar a Shopee');
  }

  const json: any = await upstream.json().catch(() => null);
  const code = json?.errors?.[0]?.extensions?.code;
  if (json?.errors?.length) {
    console.error('Shopee API error code:', code ?? 'unknown');
    throw new ShopeeError(502, SHOPEE_ERROR_MESSAGES[Number(code)] || 'Erro ao consultar a Shopee');
  }
  const nodes = json?.data?.productOfferV2?.nodes;
  if (!Array.isArray(nodes)) {
    console.error('Shopee API: unexpected response shape');
    throw new ShopeeError(502, 'Erro ao consultar a Shopee');
  }
  return nodes;
}

export function normalizeNode(n: any): ShopeeProduct {
  const priceMin = Number(n.priceMin);
  const priceMax = Number(n.priceMax);
  return {
    itemId: String(n.itemId),
    shopId: String(n.shopId),
    productName: n.productName ?? '',
    price: Number.isFinite(priceMin) ? priceMin : priceMax,
    priceMin,
    priceMax,
    ratingStar: n.ratingStar != null ? Number(n.ratingStar) : null,
    sales: n.sales != null ? Number(n.sales) : null,
    shopName: n.shopName ?? '',
    shopType: Array.isArray(n.shopType) ? n.shopType.map(Number).filter(Number.isFinite) : [],
    imageUrl: n.imageUrl ?? '',
    productLink: n.productLink ?? '',
    offerLink: n.offerLink ?? '',
  };
}

// Ranking da busca por palavra-chave (união de sortType 1 e 2, sem duplicatas):
// score = 0.40*s + 0.30*q + 0.25*r + 0.05*b
//   s = log10(1+vendas) / log10(1+maxVendas)
//   q = nota > 0 ? clamp((nota-3)/2, 0, 1) * min(1, log10(1+vendas)/3) : 0  (nota pesa conforme o volume)
//   r = 1 - i/N pela posição na lista de relevância (0 se ausente)
//   b = loja Mall/Star+ = 1, Star = 0.5, demais = 0
// Desempate: r desc, depois vendas desc.
export function rankSearchResults(
  relevance: ShopeeProduct[],
  bySales: ShopeeProduct[],
  limit = SEARCH_LIMIT,
): ShopeeProduct[] {
  const keyOf = (p: ShopeeProduct) => `${p.shopId}-${p.itemId}`;
  const n = relevance.length;
  const relScore = new Map<string, number>();
  const union = new Map<string, ShopeeProduct>();
  relevance.forEach((p, i) => {
    const k = keyOf(p);
    if (!relScore.has(k)) relScore.set(k, 1 - i / n);
    if (!union.has(k)) union.set(k, p);
  });
  for (const p of bySales) {
    const k = keyOf(p);
    if (!union.has(k)) union.set(k, p);
  }

  const salesOf = (p: ShopeeProduct) => (Number.isFinite(p.sales) && (p.sales as number) > 0 ? (p.sales as number) : 0);
  const items = [...union.entries()];
  const maxSales = items.reduce((m, [, p]) => Math.max(m, salesOf(p)), 0);

  const scored = items.map(([k, p]) => {
    const sales = salesOf(p);
    const rating = Number.isFinite(p.ratingStar) ? (p.ratingStar as number) : 0;
    const volume = Math.log10(1 + sales);
    const r = relScore.get(k) ?? 0;
    const s = maxSales > 0 ? volume / Math.log10(1 + maxSales) : 0;
    const q = rating > 0 ? Math.min(1, Math.max(0, (rating - 3) / 2)) * Math.min(1, volume / 3) : 0;
    const types = p.shopType ?? [];
    const b = types.includes(1) || types.includes(4) ? 1 : types.includes(2) ? 0.5 : 0;
    return { p, r, sales, score: 0.4 * s + 0.3 * q + 0.25 * r + 0.05 * b };
  });

  scored.sort((a, b) => b.score - a.score || b.r - a.r || b.sales - a.sales);
  return scored.slice(0, limit).map((x) => x.p);
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

async function resolveShopeeLink(raw: unknown): Promise<{ shopId: string; itemId: string }> {
  const invalid = new ShopeeError(400, 'Link da Shopee inválido');
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) throw invalid;
  const u = parseHttpUrl(raw.trim());
  if (!u) throw invalid;
  const host = u.hostname.toLowerCase();

  let target = u;
  if (SHORT_HOSTS.includes(host)) {
    // Short link: follow exactly one redirect hop and require a shopee.com.br target
    let location: string | null = null;
    try {
      const r = await fetch(u.toString(), { redirect: 'manual' });
      location = r.headers.get('location');
    } catch {
      throw invalid;
    }
    const next = location ? parseHttpUrl(new URL(location, u).toString()) : null;
    if (!next || !SHOPEE_HOSTS.includes(next.hostname.toLowerCase())) throw invalid;
    target = next;
  } else if (!SHOPEE_HOSTS.includes(host)) {
    throw invalid;
  }

  const ids = parseShopeeUrl(target.pathname);
  if (!ids) throw invalid;
  return ids;
}

type ShopeeRequest =
  | { mode: 'url' | 'item'; query: string }
  | { mode: 'search'; keyword: string; page: number };

async function buildRequest(body: any): Promise<ShopeeRequest> {
  if (!body || typeof body !== 'object') throw new ShopeeError(400, 'Requisição inválida');

  if (body.mode === 'url') {
    const ids = await resolveShopeeLink(body.url);
    return { mode: 'url', query: buildProductQuery({ mode: 'item', ...ids }) };
  }

  if (body.mode === 'item') {
    const itemId = typeof body.itemId === 'string' ? body.itemId : String(body.itemId ?? '');
    const shopId = body.shopId == null || body.shopId === '' ? null : String(body.shopId);
    if (!ID_RE.test(itemId) || (shopId !== null && !ID_RE.test(shopId))) {
      throw new ShopeeError(400, 'Identificador de produto inválido');
    }
    return { mode: 'item', query: buildProductQuery({ mode: 'item', itemId, shopId }) };
  }

  if (body.mode === 'search') {
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    if (keyword.length < 2 || keyword.length > 100) {
      throw new ShopeeError(400, 'A pesquisa deve ter entre 2 e 100 caracteres');
    }
    const page = body.page == null ? 1 : body.page;
    if (!Number.isInteger(page) || page < 1 || page > 20) throw new ShopeeError(400, 'Página inválida');
    return { mode: 'search', keyword, page };
  }

  throw new ShopeeError(400, 'Modo inválido');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  let adminAuth: ReturnType<typeof getAuth>;
  try {
    adminAuth = getAdminAuth();
  } catch {
    console.error('Shopee proxy: Firebase Admin not configured');
    return res.status(500).json({ error: 'Erro interno' });
  }
  try {
    await adminAuth.verifyIdToken(match[1].trim());
  } catch {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_APP_SECRET) {
    return res.status(500).json({ error: 'Integração Shopee não configurada' });
  }

  let body: any = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
  }

  try {
    const request = await buildRequest(body);
    if (request.mode === 'search') {
      const { keyword, page } = request;
      // Relevância + mais vendidos em paralelo; se uma falhar, ranqueia a outra.
      const [relevance, bySales] = await Promise.allSettled([
        callShopee(buildProductQuery({ mode: 'search', keyword, page, sortType: 1 })),
        callShopee(buildProductQuery({ mode: 'search', keyword, page, sortType: 2 })),
      ]);
      if (relevance.status === 'rejected' && bySales.status === 'rejected') throw relevance.reason;
      const list = (r: PromiseSettledResult<any[]>) => (r.status === 'fulfilled' ? r.value.map(normalizeNode) : []);
      return res.status(200).json({ products: rankSearchResults(list(relevance), list(bySales)) });
    }
    const nodes = await callShopee(request.query);
    if (nodes.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    return res.status(200).json({ products: nodes.map(normalizeNode) });
  } catch (error) {
    if (error instanceof ShopeeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Shopee proxy: unexpected failure');
    return res.status(500).json({ error: 'Erro interno' });
  }
}
