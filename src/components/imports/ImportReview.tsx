import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import type { Customer, OsItemKind, PaperImport, PaperQuoteExtracted, Vehicle } from '@/types/database';

type ItemRow = { key: number; tipo: OsItemKind; descricao: string; quantidade: string; valor: string };

let seq = 0;
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const plateNorm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

interface Props {
  imp: PaperImport;
  imageUrl: string | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Conferência de um orçamento lido pela IA: foto de um lado, dados do outro.
 * Nada entra no sistema sem a oficina confirmar.
 */
export default function ImportReview({ imp, imageUrl, onClose, onDone }: Props) {
  const x = imp.extracted as PaperQuoteExtracted;
  const unsure = new Set(x?.campos_incertos ?? []);
  const isUnsure = (path: string) => [...unsure].some(u => u === path || u.startsWith(path + '.') || u.startsWith(path + '['));

  const [f, setF] = useState({
    nome:     x?.cliente?.nome ?? '',
    telefone: x?.cliente?.telefone ?? '',
    cpf:      x?.cliente?.cpf ?? '',
    endereco: x?.cliente?.endereco ?? '',
    placa:    x?.veiculo?.placa ?? '',
    marca:    x?.veiculo?.marca ?? '',
    modelo:   x?.veiculo?.modelo ?? '',
    ano:      x?.veiculo?.ano != null ? String(x.veiculo.ano) : '',
    cor:      x?.veiculo?.cor ?? '',
    km:       x?.veiculo?.km != null ? String(x.veiculo.km) : '',
    data:     x?.data ?? '',
    titulo:   x?.servico_resumo ?? '',
    obs:      x?.observacoes ?? '',
    desconto: x?.desconto ? moneyInput(x.desconto) : '',
  });
  const [items, setItems] = useState<ItemRow[]>(() => (x?.itens ?? []).map(i => ({
    key: ++seq, tipo: i.tipo, descricao: i.descricao,
    quantidade: String(i.quantidade ?? 1).replace('.', ','),
    valor: i.valor_unitario != null ? moneyInput(i.valor_unitario) : '',
  })));

  // Cliente/veículo já cadastrados (pelo telefone ou pela placa)
  const [matchCustomer, setMatchCustomer] = useState<Customer | null>(null);
  const [matchVehicle, setMatchVehicle]   = useState<Vehicle | null>(null);
  const [useExisting, setUseExisting]     = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom]     = useState(false);

  useEffect(() => {
    (async () => {
      const plate = plateNorm(f.placa);
      if (plate.length >= 7) {
        const { data } = await supabase.from('vehicles').select('*, customer:customers(*)')
          .eq('workshop_id', imp.workshop_id).ilike('plate', plate).limit(1);
        const v = data?.[0] as (Vehicle & { customer: Customer | null }) | undefined;
        if (v) { setMatchVehicle(v); if (v.customer) { setMatchCustomer(v.customer); return; } }
      }
      const tel = digits(f.telefone);
      if (tel.length >= 8) {
        const { data } = await supabase.from('customers').select('*')
          .eq('workshop_id', imp.workshop_id).ilike('phone', `%${tel.slice(-8, -4)}%${tel.slice(-4)}%`).limit(5);
        const c = (data as Customer[] ?? []).find(c => digits(c.phone).endsWith(tel.slice(-8)));
        if (c) setMatchCustomer(c);
      }
    })();
    // só na abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp.id]);

  const rowTotal = (r: ItemRow) => {
    const q = parseMoney(r.quantidade); const v = parseMoney(r.valor || '0');
    return Number.isFinite(q) && Number.isFinite(v) ? q * v : 0;
  };
  const sum   = items.reduce((a, r) => a + rowTotal(r), 0);
  const disc  = Number.isFinite(parseMoney(f.desconto)) ? parseMoney(f.desconto) : 0;
  const total = Math.max(sum - disc, 0);
  const aiTotal = x?.total ?? null;
  const totalMismatch = aiTotal != null && items.length > 0 && Math.abs(aiTotal - total) > 0.5;

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const cls = (path: string) => `input !py-2 text-sm ${isUnsure(path) ? '!border-pending-500 !bg-pending-50' : ''}`;

  const linking = useExisting && !!matchCustomer;
  const canSave = useMemo(() => !!(f.nome.trim() || linking) && !!f.titulo.trim(), [f.nome, f.titulo, linking]);

  async function confirm() {
    if (!canSave) { toast.error('Informe o nome do cliente e o serviço'); return; }
    for (const [i, r] of items.entries()) {
      if (!r.descricao.trim()) { toast.error(`Item ${i + 1}: informe a descrição`); return; }
      if (!Number.isFinite(parseMoney(r.quantidade)) || parseMoney(r.quantidade) <= 0) { toast.error(`Item ${i + 1}: quantidade inválida`); return; }
      if (!Number.isFinite(parseMoney(r.valor || '0'))) { toast.error(`Item ${i + 1}: valor inválido`); return; }
    }
    setSaving(true);
    try {
      const wid = imp.workshop_id;

      // 1. Cliente
      let customerId: string;
      if (linking) {
        customerId = matchCustomer!.id;
        // completa só o que estava vazio no cadastro
        const patch: Record<string, string> = {};
        if (!matchCustomer!.phone && f.telefone.trim()) patch.phone = f.telefone.trim();
        if (!matchCustomer!.cpf && f.cpf.trim()) patch.cpf = f.cpf.trim();
        if (!matchCustomer!.address && f.endereco.trim()) patch.address = f.endereco.trim();
        if (Object.keys(patch).length) await supabase.from('customers').update(patch).eq('id', customerId);
      } else {
        const { data, error } = await supabase.from('customers').insert({
          workshop_id: wid,
          full_name: f.nome.trim(),
          phone: f.telefone.trim() || null,
          cpf: f.cpf.trim() || null,
          address: f.endereco.trim() || null,
        }).select('id').single();
        if (error) throw error;
        customerId = data.id;
      }

      // 2. Veículo (se houver placa ou marca/modelo)
      let vehicleId: string | null = null;
      const plate = plateNorm(f.placa);
      if (linking && matchVehicle && (!plate || plateNorm(matchVehicle.plate) === plate)) {
        vehicleId = matchVehicle.id;
      } else if (plate || (f.marca.trim() && f.modelo.trim())) {
        const { data: existing } = plate
          ? await supabase.from('vehicles').select('id').eq('workshop_id', wid).eq('customer_id', customerId).ilike('plate', plate).limit(1)
          : { data: [] as { id: string }[] };
        if (existing?.length) vehicleId = existing[0].id;
        else {
          const { data, error } = await supabase.from('vehicles').insert({
            workshop_id: wid, customer_id: customerId,
            plate: plate || 'S/P',
            make: f.marca.trim() || 'Não informado',
            model: f.modelo.trim() || 'Não informado',
            year: f.ano ? parseInt(f.ano, 10) || null : null,
            color: f.cor.trim() || null,
          }).select('id').single();
          if (error) throw error;
          vehicleId = data.id;
        }
      }

      // 3. OS histórica, concluída, com a data do bloquinho
      const when = f.data ? new Date(`${f.data}T12:00:00`).toISOString() : imp.created_at;
      const { data: os, error: osErr } = await supabase.from('service_orders').insert({
        workshop_id: wid,
        customer_id: customerId,
        vehicle_id: vehicleId,
        title: f.titulo.trim(),
        description: f.obs.trim() || null,
        status: 'completed',
        created_at: when,
        completed_at: when,
        km_reading: f.km ? parseInt(f.km.replace(/\D/g, ''), 10) || null : null,
        price: items.length ? 0 : (aiTotal ?? 0), // com itens, o banco recalcula
        discount: disc,
        source: 'paper_import',
      }).select('id, number').single();
      if (osErr) throw osErr;

      // 4. Itens (o total é recalculado pelo banco)
      if (items.length) {
        const { error } = await supabase.from('service_order_items').insert(items.map((r, idx) => ({
          service_order_id: os.id, workshop_id: wid, kind: r.tipo,
          description: r.descricao.trim(),
          quantity: parseMoney(r.quantidade),
          unit_price: parseMoney(r.valor || '0'),
          position: idx,
        })));
        if (error) throw error;
      }

      // 5. Marca a importação como concluída
      await supabase.from('paper_imports').update({
        status: 'confirmed', service_order_id: os.id, customer_id: customerId, confirmed_at: new Date().toISOString(),
      }).eq('id', imp.id);

      toast.success(`Importado ✓ — OS nº ${String(os.number ?? '').padStart(4, '0')}`);
      onDone();
    } catch (e: any) {
      console.error('[ImportReview] erro:', e);
      toast.error('Não foi possível importar: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/70 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-6xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[94vh]">
        <div className="px-5 py-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Conferir orçamento</h2>
            <p className="text-xs text-steel-500">Confira com a foto e corrija o que precisar. Campos em <span className="bg-pending-50 border border-pending-500 px-1 rounded">amarelo</span> a IA leu com dúvida.</p>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-0">
          {/* Foto */}
          <div className="bg-steel-900 lg:sticky lg:top-0 lg:h-[calc(94vh-120px)] flex items-center justify-center p-3">
            {imageUrl ? (
              <img src={imageUrl} alt="Orçamento original" onClick={() => setZoom(z => !z)}
                className={`max-h-[45vh] lg:max-h-full object-contain cursor-zoom-in rounded-lg ${zoom ? 'lg:scale-150 lg:cursor-zoom-out' : ''} transition-transform`} />
            ) : <div className="text-steel-400 text-sm">Carregando foto…</div>}
          </div>

          {/* Dados */}
          <div className="p-5 space-y-5">
            {/* Cliente */}
            <section className="space-y-2">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Cliente</div>
              {matchCustomer && (
                <label className="flex items-start gap-2 text-sm bg-signal-50 border border-signal-200 rounded-xl px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={useExisting} onChange={e => setUseExisting(e.target.checked)} />
                  <span>
                    <strong>Já cadastrado:</strong> {matchCustomer.full_name}{matchCustomer.phone ? ` · ${matchCustomer.phone}` : ''}
                    <span className="block text-xs text-steel-500">Usar este cadastro (reconhecido pela {matchVehicle ? 'placa' : 'telefone'}). Desmarque para criar outro.</span>
                  </span>
                </label>
              )}
              {!linking && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className={cls('cliente.nome')} placeholder="Nome *" value={f.nome} onChange={set('nome')} />
                  <input className={cls('cliente.telefone')} placeholder="Telefone / WhatsApp" inputMode="tel" value={f.telefone} onChange={set('telefone')} />
                  <input className={cls('cliente.cpf')} placeholder="CPF" value={f.cpf} onChange={set('cpf')} />
                  <input className={cls('cliente.endereco')} placeholder="Endereço" value={f.endereco} onChange={set('endereco')} />
                </div>
              )}
            </section>

            {/* Veículo */}
            <section className="space-y-2">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Veículo</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input className={`${cls('veiculo.placa')} uppercase font-mono`} placeholder="Placa" value={f.placa} onChange={set('placa')} />
                <input className={cls('veiculo.marca')} placeholder="Marca" value={f.marca} onChange={set('marca')} />
                <input className={cls('veiculo.modelo')} placeholder="Modelo" value={f.modelo} onChange={set('modelo')} />
                <input className={cls('veiculo.ano')} placeholder="Ano" inputMode="numeric" value={f.ano} onChange={set('ano')} />
                <input className={cls('veiculo.cor')} placeholder="Cor" value={f.cor} onChange={set('cor')} />
                <input className={cls('veiculo.km')} placeholder="KM" inputMode="numeric" value={f.km} onChange={set('km')} />
              </div>
            </section>

            {/* Serviço */}
            <section className="space-y-2">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Serviço</div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input className={`${cls('servico_resumo')} sm:col-span-2`} placeholder="Serviço * (ex.: Troca de embreagem)" value={f.titulo} onChange={set('titulo')} />
                <input className={cls('data')} type="date" value={f.data} onChange={set('data')} />
              </div>
              <textarea className={cls('observacoes')} rows={2} placeholder="Observações" value={f.obs} onChange={set('obs')} />
            </section>

            {/* Itens */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Peças e serviços</div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setItems(s => [...s, { key: ++seq, tipo: 'part', descricao: '', quantidade: '1', valor: '' }])}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-steel-100 hover:bg-steel-200">+ Peça</button>
                  <button type="button" onClick={() => setItems(s => [...s, { key: ++seq, tipo: 'labor', descricao: '', quantidade: '1', valor: '' }])}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100">+ Serviço</button>
                </div>
              </div>
              {items.map((r, idx) => (
                <div key={r.key} className="grid grid-cols-12 gap-1.5 items-center">
                  <select className="input !py-2 !px-2 text-xs col-span-3 sm:col-span-2" value={r.tipo}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, tipo: e.target.value as OsItemKind } : i))}>
                    <option value="part">Peça</option>
                    <option value="labor">Serviço</option>
                  </select>
                  <input className={`${cls(`itens[${idx}].descricao`)} col-span-9 sm:col-span-5`} placeholder="Descrição" value={r.descricao}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, descricao: e.target.value } : i))} />
                  <input className={`${cls(`itens[${idx}].quantidade`)} col-span-3 sm:col-span-1 text-right`} inputMode="decimal" value={r.quantidade}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, quantidade: e.target.value } : i))} />
                  <input className={`${cls(`itens[${idx}].valor_unitario`)} col-span-5 sm:col-span-2 text-right`} inputMode="decimal" placeholder="0,00" value={r.valor}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, valor: e.target.value } : i))} />
                  <div className="col-span-3 sm:col-span-1 text-right text-xs font-semibold">{fmtBRL(rowTotal(r))}</div>
                  <button type="button" onClick={() => setItems(s => s.filter(i => i.key !== r.key))}
                    className="col-span-1 h-8 rounded-lg bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600 text-xs">✕</button>
                </div>
              ))}
              <div className="flex justify-end items-center gap-3 pt-2 text-sm">
                <span className="text-steel-500">Desconto</span>
                <input className="input !py-1.5 w-28 text-right text-sm" inputMode="decimal" placeholder="0,00" value={f.desconto} onChange={set('desconto')} />
              </div>
              <div className="flex justify-end items-baseline gap-3">
                <span className="text-sm text-steel-500">Total</span>
                <span className="text-2xl font-bold font-display">{fmtBRL(items.length ? total : (aiTotal ?? 0))}</span>
              </div>
              {totalMismatch && (
                <div className="text-xs bg-pending-50 border border-pending-200 text-pending-800 rounded-lg px-3 py-2">
                  ⚠️ No papel o total está {fmtBRL(aiTotal)}, mas a soma dos itens dá {fmtBRL(total)}. Confira os valores.
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-steel-100 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost" disabled={saving}>Depois</button>
          <button onClick={confirm} className="btn-primary" disabled={saving || !canSave}>
            {saving ? 'Importando…' : '✓ Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
