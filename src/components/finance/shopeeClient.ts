import { auth } from '../../firebase';
import { DecisionOption, ShopeeProduct } from '../../types';
import { getMessages } from '../../i18n';

export type ShopeeRequestBody =
  | { mode: 'url'; url: string }
  | { mode: 'item'; itemId: string; shopId?: string }
  | { mode: 'search'; keyword: string; page?: number };

/** Chama o proxy autenticado POST /api/shopee-product e retorna os produtos normalizados. */
export async function shopeeRequest(body: ShopeeRequestBody): Promise<ShopeeProduct[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error(getMessages().finance.loginAgain);

  let res: Response;
  try {
    res = await fetch('/api/shopee-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(getMessages().finance.shopeeError);
  }

  const json = await res.json().catch(() => ({} as { error?: string; products?: ShopeeProduct[] }));
  if (!res.ok) throw new Error(json.error || getMessages().finance.shopeeError);
  return Array.isArray(json.products) ? json.products : [];
}

export function shopeeProductToOption(p: ShopeeProduct): DecisionOption {
  return {
    source: 'shopee',
    storeName: 'Shopee',
    name: p.productName,
    link: p.productLink,
    imageUrl: p.imageUrl || null,
    itemId: p.itemId,
    shopId: p.shopId,
    shopName: p.shopName || null,
    price: Number.isFinite(p.price) ? p.price : null,
    weightKg: null,
    deliveryDays: null,
    priceRating: null,
    qualityRating: p.ratingStar,
    sustainability: null,
    ratingStar: p.ratingStar,
    sales: p.sales,
  };
}
