import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { METHODS, type PayMethod } from '@/lib/cash';
import { fmtBRL, fmtPhone, osNumber } from '@/components/os/osHelpers';
import type { OsRow } from '@/components/os/OsCard';
import type { ServiceOrderItem, Workshop } from '@/types/database';

type PayLine = { method: PayMethod; amount: number; installments: number | null };

/**
 * Comprovante da venda de balcão (não fiscal). Dois papéis: cupom de 80 mm (impressora térmica) ou A4.
 */
export default function SaleReceipt({ os, items, shop, phone }: {
  os: OsRow; items: ServiceOrderItem[]; shop: Workshop | null; phone?: string | null;
}) {
  const [paper, setPaper] = useState<'cupom' | 'a4'>(() => {
    try { return (localStorage.getItem('receipt-paper') as 'cupom' | 'a4') || 'cupom'; } catch { return 'cupom'; }
  });
  const [pays, setPays] = useState<PayLine[]>([]);
  const [change, setChange] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('os_payments').select('id, change_given')
        .eq('service_order_id', os.id).is('cancelled_at', null);
      const ids = ((p ?? []) as { id: string; change_given: number | null }[]);
      setChange(ids.reduce((a, x) => a + Number(x.change_given ?? 0), 0));
      if (!ids.length) return;
      const { data: e } = await supabase.from('cash_entries').select('method, amount, installments')
        .in('payment_id', ids.map(x => x.id)).is('cancelled_at', null);
      setPays(((e ?? []) as PayLine[]).filter(x => x.method));
    })();
  }, [os.id]);

  const choose = (p: 'cupom' | 'a4') => { setPaper(p); try { localStorage.setItem('receipt-paper', p); } catch { /* sem storage */ } };
  const qty = (q: number) => String(q).replace('.', ',');
  const subtotal = items.reduce((a, i) => a + i.quantity * i.unit_price, 0);
  const discount = Number(os.discount ?? 0);
  const total = Number(os.price ?? subtotal - discount);
  const c = os.customer;
  const address = shop ? [[shop.address, shop.number].filter(Boolean).join(', '), shop.neighborhood,
    [shop.city, shop.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') : '';
  const when = new Date(os.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const cupom = paper === 'cupom';

  return (
    <div className="min-h-screen bg-steel-100 print:bg-white py-6 print:py-0">
      <style>{cupom
        ? `@page { size: 80mm auto; margin: 3mm; } @media print { body { background: #fff !important; } }`
        : `@page { size: A4; margin: 12mm; } @media print { body { background: #fff !important; } }`}</style>

      {/* Barra de ações (não sai na impressão) */}
      <div className="print:hidden max-w-[210mm] mx-auto mb-4 px-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/oficina/caixa" className="text-sm text-steel-600 hover:text-steel-900">← Voltar para o caixa</Link>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Papel" className="inline-flex rounded-xl bg-steel-200 p-1">
            {([['cupom', 'Cupom 80 mm'], ['a4', 'Folha A4']] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={paper === v} onClick={() => choose(v)}
                className={`min-h-[36px] px-3 rounded-lg text-sm font-semibold ${paper === v ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-600'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => window.print()} className="btn-primary">🖨️ Imprimir</button>
        </div>
      </div>

      <div className={`mx-auto bg-white shadow-xl print:shadow-none text-steel-900 leading-snug ${cupom
        ? 'w-[80mm] max-w-full p-3 print:p-0 text-[11px] font-mono'
        : 'max-w-[210mm] p-[12mm] print:p-0 text-[12px]'}`}>
        {/* Loja */}
        <header className={`text-center pb-2 ${cupom ? 'border-b border-dashed border-steel-500' : 'border-b-2 border-steel-900 pb-4'}`}>
          {!cupom && shop?.logo_url && <img src={shop.logo_url} alt="" className="h-14 mx-auto object-contain mb-1" />}
          <div className={`font-bold ${cupom ? 'text-[13px]' : 'text-lg'}`}>{shop?.business_name ?? 'Loja'}</div>
          {shop?.cnpj && <div>CNPJ {shop.cnpj}</div>}
          {address && <div>{address}</div>}
          {phone && <div>Tel. {phone}</div>}
        </header>

        <div className={`text-center py-2 ${cupom ? 'border-b border-dashed border-steel-500' : ''}`}>
          <div className="font-bold uppercase tracking-wide">Comprovante de venda</div>
          <div>Nº {osNumber(os)} · {when}</div>
          <div className="text-[10px] text-steel-500">Documento sem valor fiscal</div>
        </div>

        {c && (
          <div className={`py-2 ${cupom ? 'border-b border-dashed border-steel-500' : ''}`}>
            <div>Cliente: <strong>{c.full_name}</strong></div>
            {c.cpf && <div>CPF: {c.cpf}</div>}
            {c.phone && <div>Tel.: {fmtPhone(c.phone)}</div>}
          </div>
        )}

        {/* Itens */}
        <div className={`py-2 ${cupom ? 'border-b border-dashed border-steel-500' : ''}`}>
          {cupom ? (
            items.map(i => (
              <div key={i.id} className="mb-1">
                <div className="break-words">{i.description}</div>
                <div className="flex justify-between">
                  <span>{qty(i.quantity)} x {fmtBRL(i.unit_price)}</span>
                  <span className="font-bold">{fmtBRL(i.quantity * i.unit_price)}</span>
                </div>
              </div>
            ))
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-steel-100 text-[10px] uppercase tracking-wider text-steel-600">
                  <th className="text-left py-1.5 px-2">Descrição</th>
                  <th className="text-right py-1.5 px-2 w-14">Qtd</th>
                  <th className="text-right py-1.5 px-2 w-24">Valor unit.</th>
                  <th className="text-right py-1.5 px-2 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-steel-200">
                    <td className="py-1.5 px-2">{i.description}</td>
                    <td className="py-1.5 px-2 text-right">{qty(i.quantity)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtBRL(i.unit_price)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{fmtBRL(i.quantity * i.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Totais e pagamento */}
        <div className={`py-2 space-y-0.5 ${cupom ? '' : 'w-72 ml-auto'}`}>
          {discount > 0 && <>
            <Row label="Subtotal" value={fmtBRL(subtotal)} />
            <Row label="Desconto" value={`− ${fmtBRL(discount)}`} />
          </>}
          <div className={`flex justify-between font-bold ${cupom ? 'text-[14px] border-t border-dashed border-steel-500 pt-1' : 'text-base border-t-2 border-steel-900 pt-1.5'}`}>
            <span>TOTAL</span><span>{fmtBRL(total)}</span>
          </div>
          {pays.map((p, k) => (
            <Row key={k} label={`${METHODS[p.method]?.label ?? p.method}${p.installments && p.installments > 1 ? ` ${p.installments}x` : ''}`} value={fmtBRL(Number(p.amount))} />
          ))}
          {change > 0 && <Row label="Troco" value={fmtBRL(change)} />}
        </div>

        <footer className={`text-center pt-2 text-[10px] text-steel-500 ${cupom ? 'border-t border-dashed border-steel-500' : 'mt-6 border-t border-steel-200'}`}>
          Peças com garantia legal de 90 dias (CDC, art. 26, II).<br />Obrigado pela preferência!
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span>{label}</span><span>{value}</span></div>;
}
