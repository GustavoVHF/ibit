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
  | { mode: 'search'; keyword: string; page?: number };

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
    filters.push(`keyword: ${JSON.stringify(input.keyword)}`, 'sortType: 1', `page: ${page}`, `limit: ${SEARCH_LIMIT}`);
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
    imageUrl: n.imageUrl ?? '',
    productLink: n.productLink ?? '',
    offerLink: n.offerLink ?? '',
  };
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

async function buildRequest(body: any): Promise<{ mode: 'url' | 'item' | 'search'; query: string }> {
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
    return { mode: 'search', query: buildProductQuery({ mode: 'search', keyword, page }) };
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
    const { mode, query } = await buildRequest(body);
    const nodes = await callShopee(query);
    if (mode !== 'search' && nodes.length === 0) {
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
