import React, { useState } from 'react';
import { ExternalLink, Loader2, Search, ShoppingBag, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { DecisionOption, ShopeeProduct } from '../../types';
import { emptyOption, isHttpUrl, storeNameFromUrl } from './decisionMatrixHelpers';
import { shopeeProductToOption, shopeeRequest } from './shopeeClient';

interface ProductSourcePickerProps {
  label: string; // 'Produto A' | 'Produto B'
  value: DecisionOption;
  onChange: (option: DecisionOption) => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5';
const inputCls =
  'w-full bg-white border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg placeholder-gray-300 transition-colors';

// Campos de avaliação preservados ao trocar o produto (não vêm da Shopee).
const keepEvaluation = (prev: DecisionOption) => ({
  weightKg: prev.weightKg,
  deliveryDays: prev.deliveryDays,
  priceRating: prev.priceRating,
  sustainability: prev.sustainability,
});

function Thumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  return (
    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <ShoppingBag className="w-4 h-4 text-gray-300" />
      )}
    </div>
  );
}

export default function ProductSourcePicker({ label, value, onChange }: ProductSourcePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShopeeProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<DecisionOption>) => onChange({ ...value, ...patch });

  const switchSource = (source: DecisionOption['source']) => {
    if (source === value.source) return;
    setError(null);
    setResults([]);
    onChange({ ...emptyOption(source), ...keepEvaluation(value) });
  };

  const pickProduct = (p: ShopeeProduct) => {
    onChange({ ...shopeeProductToOption(p), ...keepEvaluation(value) });
    setResults([]);
    setError(null);
    setQuery('');
  };

  // Um único campo: link http(s) busca o produto; qualquer outro texto pesquisa por palavra-chave.
  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    const byLink = /^https?:\/\//i.test(q);
    if (!byLink && (q.length < 2 || q.length > 100)) {
      setError('A pesquisa deve ter entre 2 e 100 caracteres');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (byLink) {
        const products = await shopeeRequest({ mode: 'url', url: q });
        if (products.length === 0) throw new Error('Produto não encontrado');
        pickProduct(products[0]);
      } else {
        const products = await shopeeRequest({ mode: 'search', keyword: q });
        setResults(products);
        if (products.length === 0) setError('Nenhum produto encontrado');
      }
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'Erro ao consultar a Shopee');
    } finally {
      setLoading(false);
    }
  };

  const onManualLinkChange = (link: string) => {
    const prevAuto = storeNameFromUrl(value.link);
    const nextAuto = storeNameFromUrl(link);
    const storeName = !value.storeName.trim() || value.storeName === prevAuto ? nextAuto : value.storeName;
    set({ link, storeName });
  };

  const hasShopeeProduct = value.source === 'shopee' && !!value.itemId;
  const linkValid = isHttpUrl(value.link);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <div className="flex bg-gray-100 p-0.5 rounded-lg">
          {([
            { id: 'shopee', label: 'Shopee' },
            { id: 'manual', label: 'Outra loja' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => switchSource(opt.id)}
              className={clsx(
                'px-2.5 py-1 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all',
                value.source === opt.id ? 'bg-white text-[#ff7f00] shadow-sm' : 'text-gray-500 hover:text-gray-900'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {hasShopeeProduct && (
        <div className="flex gap-3 items-center">
          <Thumb src={value.imageUrl} alt={value.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate" title={value.name}>{value.name}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
              {value.storeName}
              {value.shopName ? ` · ${value.shopName}` : ''}
            </p>
          </div>
          {value.price != null && (
            <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">{formatCurrency(value.price)}</span>
          )}
          {value.link && (
            <a
              href={value.link}
              target="_blank"
              rel="noreferrer"
              title="Abrir link"
              className="text-gray-400 hover:text-[#ff7f00] transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            title="Trocar produto"
            onClick={() => onChange({ ...emptyOption('shopee'), ...keepEvaluation(value) })}
            className="text-gray-400 hover:text-gray-900 transition-colors shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {value.source === 'shopee' && !hasShopeeProduct && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              maxLength={2000}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              className={inputCls}
              placeholder="Pesquise ou cole o link da Shopee"
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || !query.trim()}
              title="Buscar"
              className="shrink-0 px-3 py-2.5 bg-[#ff7f00] text-white rounded-lg hover:bg-orange-600 active:scale-95 flex items-center transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}

          {results.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={`${p.shopId}-${p.itemId}`}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="w-full flex gap-3 items-center p-2 text-left hover:bg-orange-50 transition-colors"
                >
                  <Thumb src={p.imageUrl} alt={p.productName} />
                  <p className="min-w-0 flex-1 text-xs font-bold text-gray-900 line-clamp-2">{p.productName}</p>
                  <span className="text-xs font-bold text-gray-900 tabular-nums shrink-0">{formatCurrency(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {value.source === 'manual' && (
        <>
          <div>
            <label className={labelCls}>Link</label>
            <input
              type="url"
              value={value.link}
              onChange={(e) => onManualLinkChange(e.target.value)}
              className={clsx(inputCls, value.link && !linkValid && 'border-red-400 focus:border-red-500')}
              placeholder="https://produto.mercadolivre.com.br/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Loja</label>
              <input
                type="text"
                value={value.storeName}
                onChange={(e) => set({ storeName: e.target.value })}
                className={inputCls}
                placeholder="Mercado Livre"
              />
            </div>
            <div>
              <label className={labelCls}>Produto</label>
              <input
                type="text"
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                className={inputCls}
                placeholder="Nome do produto"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
