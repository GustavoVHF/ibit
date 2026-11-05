import React, { useState } from 'react';
import { ExternalLink, Loader2, Search, Link2, Star, ShoppingBag, Store, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { DecisionCriterionKey, DecisionOption, ShopeeProduct } from '../../types';
import { emptyOption, isHttpUrl, storeNameFromUrl } from './decisionMatrixHelpers';
import { shopeeProductToOption, shopeeRequest } from './shopeeClient';

interface ProductSourcePickerProps {
  label: string; // 'PRODUTO A' | 'PRODUTO B'
  value: DecisionOption;
  onChange: (option: DecisionOption) => void;
  enabledKeys: DecisionCriterionKey[];
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2';
const inputCls =
  'w-full bg-white border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] font-bold rounded-lg placeholder-gray-300 transition-colors';
const actionBtnCls =
  'shrink-0 px-3 py-2.5 bg-[#ff7f00] text-white font-bold uppercase tracking-widest text-[10px] rounded-lg hover:bg-orange-600 active:scale-95 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:pointer-events-none';

const parseNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Campos de avaliação preservados ao trocar o produto (não vêm da Shopee).
const keepEvaluation = (prev: DecisionOption) => ({
  weightKg: prev.weightKg,
  deliveryDays: prev.deliveryDays,
  priceRating: prev.priceRating,
  sustainability: prev.sustainability,
});

export default function ProductSourcePicker({ label, value, onChange, enabledKeys }: ProductSourcePickerProps) {
  const [linkInput, setLinkInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ShopeeProduct[]>([]);
  const [loading, setLoading] = useState<'url' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEnabled = (k: DecisionCriterionKey) => enabledKeys.includes(k);
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
  };

  const fetchByLink = async () => {
    const url = linkInput.trim();
    if (!url) return;
    setLoading('url');
    setError(null);
    try {
      const products = await shopeeRequest({ mode: 'url', url });
      if (products.length === 0) throw new Error('Produto não encontrado');
      pickProduct(products[0]);
      setLinkInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao consultar a Shopee');
    } finally {
      setLoading(null);
    }
  };

  const search = async () => {
    const kw = keyword.trim();
    if (kw.length < 2) {
      setError('A pesquisa deve ter entre 2 e 100 caracteres');
      return;
    }
    setLoading('search');
    setError(null);
    try {
      const products = await shopeeRequest({ mode: 'search', keyword: kw });
      setResults(products);
      if (products.length === 0) setError('Nenhum produto encontrado');
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'Erro ao consultar a Shopee');
    } finally {
      setLoading(null);
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
  const showProductCard = hasShopeeProduct || (value.source === 'manual' && linkValid && value.name.trim() !== '');

  const numberField = (
    title: string,
    field: 'price' | 'weightKg' | 'deliveryDays' | 'priceRating' | 'qualityRating' | 'sustainability',
    opts: { step: string; min: number; max?: number; placeholder: string; suffix?: React.ReactNode }
  ) => (
    <div>
      <label className={labelCls}>{title}</label>
      <div className="relative">
        <input
          type="number"
          step={opts.step}
          min={opts.min}
          max={opts.max}
          value={value[field] ?? ''}
          onChange={(e) => set({ [field]: parseNum(e.target.value) } as Partial<DecisionOption>)}
          className={clsx(inputCls, opts.suffix && 'pr-10')}
          placeholder={opts.placeholder}
        />
        {opts.suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase pointer-events-none">
            {opts.suffix}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{label}</span>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {([
            { id: 'shopee', label: 'Shopee', icon: ShoppingBag },
            { id: 'manual', label: 'Outra loja', icon: Store },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => switchSource(opt.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5',
                value.source === opt.id ? 'bg-white text-[#ff7f00] shadow-sm' : 'text-gray-500 hover:text-gray-900'
              )}
            >
              <opt.icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {showProductCard && (
        <div className="flex gap-3 items-start border border-gray-200 rounded-xl p-3 bg-gray-50">
          <div className="w-16 h-16 rounded-lg bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
            {value.imageUrl ? (
              <img src={value.imageUrl} alt={value.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <ShoppingBag className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 line-clamp-2">{value.name}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 truncate">
              {value.storeName}
              {value.shopName ? ` · ${value.shopName}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              {value.link && (
                <a
                  href={value.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-[#ff7f00] uppercase tracking-widest flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> abrir link
                </a>
              )}
              {value.source === 'shopee' && (
                <button
                  type="button"
                  onClick={() => onChange({ ...emptyOption('shopee'), ...keepEvaluation(value) })}
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1 hover:text-gray-900"
                >
                  <RefreshCw className="w-3 h-3" /> trocar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {value.source === 'shopee' && !hasShopeeProduct && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Cole o link do produto Shopee</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchByLink(); } }}
                className={inputCls}
                placeholder="https://shopee.com.br/..."
              />
              <button type="button" onClick={fetchByLink} disabled={!!loading || !linkInput.trim()} className={actionBtnCls}>
                {loading === 'url' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Buscar
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>ou pesquise por palavra-chave</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                maxLength={100}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                className={inputCls}
                placeholder="Ex: garrafa térmica 1L"
              />
              <button type="button" onClick={search} disabled={!!loading || !keyword.trim()} className={actionBtnCls}>
                {loading === 'search' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Pesquisar
              </button>
            </div>
          </div>

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}

          {results.length > 0 && (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={`${p.shopId}-${p.itemId}`}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="w-full flex gap-3 items-center p-2.5 text-left hover:bg-orange-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0">
                    {p.imageUrl && <img src={p.imageUrl} alt={p.productName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 line-clamp-2">{p.productName}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{p.shopName}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] font-bold text-gray-500">
                      <span className="text-gray-900">{formatCurrency(p.price)}</span>
                      {p.ratingStar != null && (
                        <span className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          {p.ratingStar.toFixed(1)}
                        </span>
                      )}
                      {p.sales != null && <span>{p.sales} vendas</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {value.source === 'manual' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Link do produto *</label>
            <input
              type="url"
              value={value.link}
              onChange={(e) => onManualLinkChange(e.target.value)}
              className={clsx(inputCls, value.link && !linkValid && 'border-red-400 focus:border-red-500')}
              placeholder="https://produto.mercadolivre.com.br/..."
            />
            {value.link && !linkValid && (
              <p className="text-[10px] font-bold text-red-600 mt-1">O link deve começar com http:// ou https://</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Loja</label>
              <input
                type="text"
                value={value.storeName}
                onChange={(e) => set({ storeName: e.target.value })}
                className={inputCls}
                placeholder="Ex: Mercado Livre"
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
        </div>
      )}

      {(value.source === 'manual' || hasShopeeProduct) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
          {numberField('Preço (R$)', 'price', { step: '0.01', min: 0, placeholder: '0,00' })}
          {isEnabled('pesoPorValor') && numberField('Peso', 'weightKg', { step: '0.001', min: 0, placeholder: '0,000', suffix: 'kg' })}
          {isEnabled('tempoEntrega') && numberField('Prazo de entrega', 'deliveryDays', { step: '1', min: 1, placeholder: '0', suffix: 'dias' })}
          {isEnabled('rateQualidade') &&
            numberField('Nota de qualidade', 'qualityRating', { step: '0.1', min: 0, max: 5, placeholder: '0–5', suffix: '★' })}
          {isEnabled('ratePreco') && numberField('Rate de preço', 'priceRating', { step: '1', min: 1, max: 10, placeholder: '1–10', suffix: '/10' })}
          {isEnabled('sustentabilidade') &&
            numberField('Sustentabilidade', 'sustainability', { step: '1', min: 1, max: 10, placeholder: '1–10', suffix: '/10' })}
        </div>
      )}
    </div>
  );
}
