/** Utilitários de formatação para mensagens do WhatsApp. */

/** Remove caracteres de formatação do WhatsApp (*, _, ~, `) de textos vindos do usuário. */
export function clean(text: string, max = 120): string {
  const t = text.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Primeiros nomes dos responsáveis: "Ana, Heitor" · "Ana, Bia, Caio +2" · "sem responsável". */
export function names(uids: string[], map: Map<string, string>): string {
  const list = uids.map((u) => map.get(u)).filter(Boolean) as string[];
  if (!list.length) return 'sem responsável';
  const first = list.map((n) => clean(n.split(' ')[0] ?? n, 30));
  return first.length > 3 ? `${first.slice(0, 3).join(', ')} +${first.length - 3}` : first.join(', ');
}
