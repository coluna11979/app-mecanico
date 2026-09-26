import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, osNumber, osStatusLabel } from '@/components/os/osHelpers';
import type { OsRow } from '@/components/os/OsCard';
import type { ServiceOrderItem, Workshop } from '@/types/database';

/**
 * OS pronta para imprimir ou salvar em PDF (Imprimir → "Salvar como PDF").
 * Sem layout do app: só o documento, em A4.
 */
export default function OsPrint() {
  const { id } = useParams();
  const { profile, workshops } = useAuth();
  const [os, setOs]       = useState<OsRow | null>(null);
  const [items, setItems] = useState<ServiceOrderItem[]>([]);
  const [shop, setShop]   = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: o }, { data: its }] = await Promise.all([
        supabase.from('service_orders')
          .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:workshop_mechanics(*)')
          .eq('id', id).maybeSingle(),
        supabase.from('service_order_items').select('*').eq('service_order_id', id).order('position'),
      ]);
      const row = o as OsRow | null;
      setOs(row);
      setItems((its as ServiceOrderItem[]) ?? []);
      if (row) {
        const known = workshops.find(w => w.id === row.workshop_id);
        if (known) setShop(known);
        else {
          const { data: w } = await supabase.from('workshops').select('*').eq('id', row.workshop_id).maybeSingle();
          setShop(w as Workshop);
        }
      }
      setLoading(false);
    })();
  }, [id, workshops]);

  useEffect(() => {
    if (os) document.title = `OS ${osNumber(os)} — ${shop?.business_name ?? 'Oficina'}`;
    return () => { document.title = 'MecânicoApp'; };
  }, [os, shop]);

  if (loading) return <div className="p-10 text-steel-500">Preparando documento…</div>;
  if (!os) return (
    <div className="p-10 text-center">
      <p className="text-steel-600">OS não encontrada.</p>
      <Link to="/oficina/os" className="text-brand-600 font-semibold">← Voltar</Link>
    </div>
  );

  const parts = items.filter(i => i.kind === 'part');
  const labor = items.filter(i => i.kind === 'labor');
  const sum = (list: ServiceOrderItem[]) => list.reduce((a, i) => a + i.quantity * i.unit_price, 0);
  const address = shop ? [
    [shop.address, shop.number].filter(Boolean).join(', '),
    shop.neighborhood,
    [shop.city, shop.state].filter(Boolean).join('/'),
    shop.cep ? `CEP ${shop.cep}` : null,
  ].filter(Boolean).join(' · ') : '';
  const c = os.customer;
  const v = os.vehicle;
  const qty = (q: number) => String(q).replace('.', ',');

  return (
    <div className="min-h-screen bg-steel-100 print:bg-white py-6 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: #fff !important; } }
      `}</style>

      {/* Barra de ações (não sai na impressão) */}
      <div className="print:hidden max-w-[210mm] mx-auto mb-4 px-4 flex items-center justify-between gap-3">
        <Link to={`/oficina/os/${os.id}`} className="text-sm text-steel-600 hover:text-steel-900">← Voltar para a OS</Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-steel-500">Para PDF, escolha "Salvar como PDF" na impressão.</span>
          <button onClick={() => window.print()} className="btn-primary">🖨️ Imprimir / Salvar PDF</button>
        </div>
      </div>

      {/* Documento A4 */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-xl print:shadow-none p-[12mm] print:p-0 text-[12px] text-steel-900 leading-snug">
        {/* Cabeçalho */}
        <header className="flex justify-between items-start gap-6 pb-4 border-b-2 border-steel-900">
          <div className="flex items-start gap-3 min-w-0">
            {shop?.logo_url && <img src={shop.logo_url} alt="" className="h-14 w-14 object-contain" />}
            <div className="min-w-0">
              <div className="text-lg font-bold leading-tight">{shop?.business_name ?? 'Oficina'}</div>
              {shop?.cnpj && <div className="text-steel-600">CNPJ {shop.cnpj}</div>}
              {address && <div className="text-steel-600">{address}</div>}
              {profile?.phone && <div className="text-steel-600">Tel./WhatsApp {profile.phone}</div>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-bold tracking-widest text-steel-500 uppercase">Ordem de Serviço</div>
            <div className="text-2xl font-bold font-mono">Nº {osNumber(os)}</div>
            <div className="text-steel-600">Emitida em {new Date().toLocaleDateString('pt-BR')}</div>
            <div className="text-steel-600">Abertura: {new Date(os.created_at).toLocaleDateString('pt-BR')}</div>
            <div className="text-steel-600">Situação: <strong>{osStatusLabel(os)}</strong></div>
          </div>
        </header>

        {/* Cliente + veículo */}
        <section className="grid grid-cols-2 gap-4 mt-4">
          <Box title="Cliente">
            {c ? (
              <>
                <div className="font-semibold">{c.full_name}</div>
                {c.cpf && <div>CPF: {c.cpf}</div>}
                {c.phone && <div>Telefone: {c.phone}</div>}
                {c.email && <div>E-mail: {c.email}</div>}
                {(c.address || c.city) && <div>{[c.address, c.city].filter(Boolean).join(' · ')}</div>}
              </>
            ) : <div className="text-steel-400">Não informado</div>}
          </Box>
          <Box title="Veículo">
            {v ? (
              <>
                <div className="font-semibold">{v.make} {v.model}{v.year ? ` · ${v.year}` : ''}</div>
                <div>Placa: <strong className="font-mono">{v.plate}</strong></div>
                {v.color && <div>Cor: {v.color}</div>}
                {os.km_reading != null && <div>KM: {os.km_reading.toLocaleString('pt-BR')}</div>}
              </>
            ) : <div className="text-steel-400">Não informado</div>}
          </Box>
        </section>

        {/* Serviço */}
        <section className="mt-4">
          <Box title="Serviço">
            <div className="font-semibold">{os.title}{os.category ? ` — ${os.category}` : ''}</div>
            {os.description && <div className="mt-1 whitespace-pre-line text-steel-700">{os.description}</div>}
            {os.mechanic && <div className="mt-1 text-steel-600">Responsável técnico: {os.mechanic.name}</div>}
          </Box>
        </section>

        {/* Itens */}
        <section className="mt-4">
          {items.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-steel-100 text-[10px] uppercase tracking-wider text-steel-600">
                  <th className="text-left py-1.5 px-2 w-8">#</th>
                  <th className="text-left py-1.5 px-2 w-16">Tipo</th>
                  <th className="text-left py-1.5 px-2">Descrição</th>
                  <th className="text-right py-1.5 px-2 w-12">Qtd</th>
                  <th className="text-right py-1.5 px-2 w-24">Valor unit.</th>
                  <th className="text-right py-1.5 px-2 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={i.id} className="border-b border-steel-200">
                    <td className="py-1.5 px-2 text-steel-500">{idx + 1}</td>
                    <td className="py-1.5 px-2">{i.kind === 'part' ? 'Peça' : 'Serviço'}</td>
                    <td className="py-1.5 px-2">{i.description}</td>
                    <td className="py-1.5 px-2 text-right">{qty(i.quantity)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtBRL(i.unit_price)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">{fmtBRL(i.quantity * i.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {/* Totais */}
          <div className="flex justify-end mt-3">
            <div className="w-64 space-y-1">
              {items.length > 0 ? (
                <>
                  <Line label="Peças" value={fmtBRL(sum(parts))} />
                  <Line label="Serviços" value={fmtBRL(sum(labor))} />
                  {Number(os.discount) > 0 && <Line label="Desconto" value={`− ${fmtBRL(os.discount)}`} />}
                </>
              ) : (
                <>
                  {os.parts_cost != null && <Line label="Peças" value={fmtBRL(os.parts_cost)} />}
                  {os.labor_cost != null && <Line label="Mão de obra" value={fmtBRL(os.labor_cost)} />}
                </>
              )}
              <div className="flex justify-between border-t-2 border-steel-900 pt-1.5 mt-1.5 text-base font-bold">
                <span>TOTAL</span><span>{fmtBRL(os.price)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Garantia */}
        <section className="mt-6 text-[10.5px] text-steel-600 border border-steel-200 rounded-md p-3">
          <strong className="text-steel-800">Garantia:</strong> serviços e peças fornecidos por esta oficina têm garantia legal
          de 90 dias, contados da entrega do veículo (Código de Defesa do Consumidor, art. 26, II). A garantia não cobre
          mau uso, acidentes ou intervenção de terceiros.
        </section>

        {/* Assinaturas */}
        <section className="mt-12 grid grid-cols-2 gap-10 text-center text-[11px]">
          <div>
            <div className="border-t border-steel-900 pt-1.5">
              {c?.full_name ?? 'Cliente'}
              <div className="text-steel-500">Autorizo a execução dos serviços descritos acima</div>
            </div>
          </div>
          <div>
            <div className="border-t border-steel-900 pt-1.5">
              {shop?.business_name ?? 'Oficina'}
              <div className="text-steel-500">Responsável</div>
            </div>
          </div>
        </section>

        <footer className="mt-10 pt-2 border-t border-steel-200 text-[9px] text-steel-400 text-center">
          Documento gerado pelo MecânicoApp · mecanicoapp.com.br
        </footer>
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-steel-300 rounded-md p-3 h-full">
      <div className="text-[9px] font-bold uppercase tracking-widest text-steel-500 mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-steel-700"><span>{label}</span><span>{value}</span></div>
  );
}
