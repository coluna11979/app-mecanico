import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, fmtPhone, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { PLATFORM } from '@/components/cash/ResponsiblePicker';
import { METHODS, RECEIVE_METHODS, type PayMethod } from '@/lib/cash';
import { useOperator } from '@/lib/operators';
import { ensureCatalogParts, partKey, partNameForVehicle } from '@/lib/parts';
import { COMMISSION_COLS, RULE, commissionFor, pcts, type CommissionMech } from '@/lib/commission';
import { OsCommission, useDraftCommission, type AutoCommission } from '@/components/cash/OsCommission';
import { fixedFor, isExcluded, loadItemRules, type ItemRule } from '@/lib/commissionRules';
import type { Customer, OsItemKind, PaperImport, PaperQuoteExtracted, Vehicle, WorkshopMechanic } from '@/types/database';

/** who: '' = o responsável geral da nota · id do mecânico · PLATFORM */
type ItemRow = { key: number; tipo: OsItemKind; descricao: string; quantidade: string; valor: string; who: string };
/** 'depois' = F na nota (pagar depois): não entra como recebido; vira conta a receber com vencimento */
type PayRow = { key: number; method: PayMethod | '' | 'depois'; amount: string; installments: number };
type Op = { id: string; name: string; is_owner: boolean };

let seq = 0;
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const plateNorm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

interface Props {
  imp: PaperImport;
  imageUrl: string | null;
  isPdf?: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Conferência de um orçamento lido pela IA: foto de um lado, dados do outro.
 * Nada entra no sistema sem a oficina confirmar.
 */
export default function ImportReview({ imp, imageUrl, isPdf, onClose, onDone }: Props) {
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
  const [items, setItems] = useState<ItemRow[]>(() => (x?.itens ?? []).map(i => {
    const qty = i.quantidade || 1;
    // A IA devolve o unitário e/ou o total da linha; o editor trabalha com o unitário
    const unit = i.valor_unitario ?? (i.valor_total_item != null ? Math.round((i.valor_total_item / qty) * 100) / 100 : null);
    return {
      key: ++seq, tipo: i.tipo, descricao: i.descricao,
      quantidade: String(qty).replace('.', ','),
      valor: unit != null ? moneyInput(unit) : '',
      who: '',
    };
  }));
  const { balcao, session } = useOperator();
  const sid = balcao ? session?.session_id ?? null : null;

  // Quem fez o serviço (equipe da loja) e quem recebeu (colaboradores do balcão)
  const [itemRules, setItemRules] = useState<ItemRule[]>([]);
  useEffect(() => { loadItemRules(imp.workshop_id).then(setItemRules); }, [imp.workshop_id]);
  const [team, setTeam] = useState<(Pick<WorkshopMechanic, 'id' | 'name'> & CommissionMech)[]>([]);
  const [ops, setOps]   = useState<Op[]>([]);
  const [osWho, setOsWho] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  /** Pago na época (lança o recebimento com a data da nota) ou ficou em aberto */
  const [paid, setPaid] = useState(true);
  /** Peças da nota vão para o cadastro (preço da nota; custo pela margem da loja) */
  const [toCatalog, setToCatalog] = useState(true);
  const [pays, setPays] = useState<PayRow[]>(() => {
    const list = (x?.pagamentos ?? []).map(p => ({
      key: ++seq, method: p.forma as PayRow['method'], amount: p.valor != null ? moneyInput(p.valor) : '', installments: p.parcelas || 1,
    }));
    return list.length ? list : [{ key: ++seq, method: '' as const, amount: '', installments: 1 }];
  });

  /** O serviço foi feito, ou ficou só no orçamento? */
  const [done, setDone] = useState(true);
  /** Serviços recomendados para o futuro (alimentam a reativação de clientes) */
  const [recs, setRecs] = useState<string[]>(() => x?.recomendacoes ?? []);

  // Cliente/veículo já cadastrados (pelo telefone ou pela placa)
  const [matchCustomer, setMatchCustomer] = useState<Customer | null>(null);
  const [matchVehicle, setMatchVehicle]   = useState<Vehicle | null>(null);
  const [useExisting, setUseExisting]     = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom]     = useState(false);

  useEffect(() => {
    (async () => {
      const [m, o] = await Promise.all([
        supabase.from('workshop_mechanics').select(`id, name, ${COMMISSION_COLS}`).eq('workshop_id', imp.workshop_id).eq('active', true).order('name'),
        supabase.from('workshop_operators').select('id, name, is_owner').eq('workshop_id', imp.workshop_id).eq('active', true).order('name'),
      ]);
      const mechs = (m.data as unknown as (Pick<WorkshopMechanic, 'id' | 'name'> & CommissionMech)[]) ?? [];
      const opList = (o.data as Op[]) ?? [];
      setTeam(mechs); setOps(opList);
      // Mecânico escrito na nota → equipe (pelo nome)
      const written = (x?.mecanico ?? '').trim().toLowerCase();
      if (written) {
        const hit = mechs.find(t => t.name.toLowerCase() === written)
          ?? mechs.find(t => t.name.toLowerCase().split(' ')[0] === written.split(' ')[0]);
        if (hit) setOsWho(hit.id);
      }
      setReceivedBy(balcao && session?.operator_id ? session.operator_id : opList.find(p => p.is_owner)?.id ?? '');
    })();
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
  const finalTotal = Math.round((items.length ? total : (aiTotal ?? 0)) * 100) / 100;

  // Uma forma só e sem valor → é o total da nota
  const payRows = pays.length === 1 && !pays[0].amount ? [{ ...pays[0], amount: moneyInput(finalTotal) }] : pays;
  const payVal = (p: PayRow) => { const v = parseMoney(p.amount || '0'); return Number.isFinite(v) ? v : 0; };
  const paySum = Math.round(payRows.reduce((a, p) => a + payVal(p), 0) * 100) / 100;
  const payMissing = Math.round((finalTotal - paySum) * 100) / 100;
  /** Recebido de verdade × o que ficou para pagar depois (F) */
  const paidRows = payRows.filter(p => p.method !== 'depois');
  const laterAmt = Math.round(payRows.filter(p => p.method === 'depois').reduce((a, p) => a + payVal(p), 0) * 100) / 100;
  const [laterDue, setLaterDue] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); });
  const [laterNote, setLaterNote] = useState('');
  /** Fiado (F) de nota antiga que o cliente já quitou: entra como pago, na forma e data em que pagou */
  const [laterPaid, setLaterPaid] = useState(false);
  const [laterPaidMethod, setLaterPaidMethod] = useState<PayMethod | ''>('');
  const [laterPaidDate, setLaterPaidDate] = useState('');
  const setPay = (key: number, patch: Partial<PayRow>) => setPays(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));
  function addPay() {
    const used = new Set(pays.map(p => p.method));
    const next = RECEIVE_METHODS.find(m => !used.has(m)) ?? 'pix';
    setPays(ps => {
      const base = ps.length === 1 && !ps[0].amount ? [{ ...ps[0], amount: moneyInput(finalTotal) }] : ps;
      return [...base, { key: ++seq, method: next, amount: payMissing > 0 ? moneyInput(payMissing) : '', installments: 1 }];
    });
  }

  const laborRows = items.filter(r => r.tipo === 'labor');
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const futureDate = !!f.data && f.data > todayYmd;
  /** Data muito antiga costuma ser mês lido errado (ex.: 30/03 em vez de 30/09) */
  const oldDate = (() => {
    if (!f.data) return false;
    const d = new Date(); d.setDate(d.getDate() - 90);
    return f.data < `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const whoOf = (r: ItemRow) => r.who || osWho;

  /**
   * Comissão pela regra, com quem fez cada serviço: peças ficam com o serviço logo acima delas.
   * Nota a partir de 01/10/2026: 4% serviço + peças · 10% mão de obra. Antes: a % da ficha de cada um.
   */
  const commAuto = useMemo<AutoCommission[]>(() => {
    if (!done) return [];
    // Nota importada usa sempre a regra atual (4% serviço + peças · 10% mão de obra)
    const ruleV2 = true;
    const by = new Map<string, { value: number; base: string[] }>();
    const groups: { labor: ItemRow | null; parts: ItemRow[] }[] = [];
    // Peças antes do primeiro serviço pertencem a esse primeiro serviço
    const lead: ItemRow[] = [];
    for (const r of items) {
      if (r.tipo === 'labor') groups.push({ labor: r, parts: groups.length ? [] : lead.splice(0) });
      else if (groups.length) groups[groups.length - 1].parts.push(r);
      else lead.push(r);
    }
    if (lead.length) groups.push({ labor: null, parts: lead });
    for (const g of groups) {
      const w = g.labor ? whoOf(g.labor) : (ruleV2 ? '' : osWho);
      if (!w || w === PLATFORM) continue;
      const m = team.find(t => t.id === w);
      if (!m || m.no_commission) continue;  // salário fixo: sem comissão
      const laborAmt = g.labor ? rowTotal(g.labor) : 0;
      const partsAmt = g.parts.reduce((a, p) => a + rowTotal(p), 0);
      const e = by.get(w) ?? { value: 0, base: [] };
      if (ruleV2) {
        if (!g.labor) continue;
        // Regra por item da loja: item com regra (ex.: alinhamento) sai da conta; fixo para quem tiver
        const lab = isExcluded(g.labor.descricao, itemRules) ? 0 : laborAmt;
        const prt = g.parts.filter(p => !isExcluded(p.descricao, itemRules)).reduce((a, p) => a + rowTotal(p), 0);
        if (g.parts.length) { if (lab + prt > 0) { e.value += (lab + prt) * RULE.service / 100; e.base.push(`${RULE.service}% de ${fmtBRL(lab + prt)}`); } }
        else if (lab > 0) { e.value += lab * RULE.labor / 100; e.base.push(`${RULE.labor}% de ${fmtBRL(lab)}`); }
        for (const it of [g.labor, ...g.parts]) {
          const fx = fixedFor(it.descricao, w, parseMoney(it.quantidade) || 0, itemRules);
          if (fx > 0) { e.value += fx; e.base.push(`${fmtBRL(fx)} fixo (${it.descricao})`); }
        }
      } else {
        const p = pcts(m);
        e.value += commissionFor(m, { labor: laborAmt, laborOwn: 0, parts: partsAmt, svc: 0, mo: 0 }, 0).commission;
        if (laborAmt) e.base.push(`${p.labor}% de ${fmtBRL(laborAmt)}`);
        if (partsAmt && p.parts) e.base.push(`${p.parts}% peças ${fmtBRL(partsAmt)}`);
      }
      by.set(w, e);
    }
    return [...by.entries()].filter(([, e]) => e.value > 0)
      .map(([id, e]) => ({ mechanic_id: id, value: Math.round(e.value * 100) / 100, base: e.base.join(' + ') }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, osWho, team, done, f.data, itemRules]);
  const comm = useDraftCommission(commAuto, items.length ? total : (aiTotal ?? 0), osWho && osWho !== PLATFORM ? osWho : '');
  // Nota só de peças (venda de balcão): não tem serviço, ninguém ganha comissão — não pede quem fez
  const onlyParts = items.length > 0 && laborRows.length === 0;
  const needWho = done && team.length > 0 && !onlyParts;
  /** "Quem fez" aparece sempre que o serviço foi feito; em nota só de peças é opcional (quem instalou) */
  const showWho = done && team.length > 0;
  const whoMissing = needWho && (laborRows.length ? laborRows.some(r => !whoOf(r)) : !osWho);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));
  const cls = (path: string) => `input !py-2 text-sm ${isUnsure(path) ? '!border-pending-500 !bg-pending-50' : ''}`;

  const linking = useExisting && !!matchCustomer;
  /** Nome no cadastro: com o veículo da nota, quando identificado */
  const vehicleMake = linking && matchVehicle && !f.marca.trim() ? matchVehicle.make : f.marca;
  const vehicleModel = linking && matchVehicle && !f.modelo.trim() ? matchVehicle.model : f.modelo;
  const catalogName = (d: string) => partNameForVehicle(d, vehicleMake, vehicleModel);
  const vehicleLabel = partNameForVehicle('', vehicleMake, vehicleModel).replace(/^\s*\(|\)\s*$/g, '');
  // Cliente é opcional: nota de balcão costuma vir sem nome (a OS entra sem cliente)
  const canSave = useMemo(() => !!f.titulo.trim(), [f.titulo]);

  async function confirm() {
    if (!canSave) { toast.error('Informe o serviço'); return; }
    for (const [i, r] of items.entries()) {
      if (!r.descricao.trim()) { toast.error(`Item ${i + 1}: informe a descrição`); return; }
      if (!Number.isFinite(parseMoney(r.quantidade)) || parseMoney(r.quantidade) <= 0) { toast.error(`Item ${i + 1}: quantidade inválida`); return; }
      if (!Number.isFinite(parseMoney(r.valor || '0'))) { toast.error(`Item ${i + 1}: valor inválido`); return; }
    }
    if (whoMissing) { toast.error('Informe quem fez o serviço'); return; }
    if (!comm.valid) { toast.error('Escolha quem recebe cada comissão'); return; }
    if (futureDate) { toast.error('A data da nota está no futuro — corrija antes de importar'); return; }
    const charge = done && paid && finalTotal > 0;
    if (charge) {
      if (payRows.some(p => !p.method)) { toast.error('Escolha a forma de pagamento'); return; }
      if (payRows.some(p => !(payVal(p) > 0))) { toast.error('Informe o valor de cada forma de pagamento'); return; }
      if (payMissing < -0.004) { toast.error('O pagamento passa do total da nota'); return; }
      if (laterAmt > 0 && !laterPaid && !laterDue) { toast.error('Informe até quando o cliente vai pagar o que ficou para depois'); return; }
      if (laterAmt > 0 && laterPaid && !laterPaidMethod) { toast.error('Escolha como o cliente pagou o fiado'); return; }
      if (laterAmt > 0 && laterPaid && laterPaidDate && laterPaidDate > todayYmd) { toast.error('A data do pagamento não pode ser no futuro'); return; }
      if (payMissing > 0.004 && !window.confirm(`O pagamento soma ${fmtBRL(paySum)} e a nota dá ${fmtBRL(finalTotal)}. Os ${fmtBRL(payMissing)} que faltam ficam em aberto. Confirmar?`)) return;
    }
    setSaving(true);
    let osId: string | null = null;
    try {
      const wid = imp.workshop_id;

      // 1. Cliente (sem nome na nota → OS sem cliente)
      let customerId: string | null = null;
      if (linking) {
        customerId = matchCustomer!.id;
        // completa só o que estava vazio no cadastro
        const patch: Record<string, string> = {};
        if (!matchCustomer!.phone && f.telefone.trim()) patch.phone = f.telefone.trim();
        if (!matchCustomer!.cpf && f.cpf.trim()) patch.cpf = f.cpf.trim();
        if (!matchCustomer!.address && f.endereco.trim()) patch.address = f.endereco.trim();
        if (Object.keys(patch).length) await supabase.from('customers').update(patch).eq('id', customerId);
      } else if (f.nome.trim()) {
        const { data, error } = await supabase.from('customers').insert({
          workshop_id: wid,
          full_name: f.nome.trim(),
          phone: f.telefone.trim() || null,
          cpf: f.cpf.trim() || null,
          address: f.endereco.trim() || null,
          source: 'paper_import',
        }).select('id').single();
        if (error) throw error;
        customerId = data.id;
      }

      // 2. Veículo (se houver placa ou marca/modelo)
      let vehicleId: string | null = null;
      const plate = plateNorm(f.placa);
      if (linking && matchVehicle && (!plate || plateNorm(matchVehicle.plate) === plate)) {
        vehicleId = matchVehicle.id;
      } else if (customerId && (plate || f.modelo.trim())) {
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

      // 3. OS com a data do bloquinho: concluída (feito) ou orçamento não aprovado
      const when = f.data ? new Date(`${f.data}T12:00:00`).toISOString() : imp.created_at;
      const doc = x?.numero_documento?.trim();
      // Sem cliente não dá para cadastrar o veículo: o carro fica anotado na OS
      const carNote = !vehicleId && (f.marca.trim() || f.modelo.trim() || plate)
        ? `Veículo: ${[f.marca.trim(), f.modelo.trim(), plate].filter(Boolean).join(' ')}` : null;
      const description = [doc ? `Nota nº ${doc}` : null, carNote, f.obs.trim() || null].filter(Boolean).join('\n') || null;
      // Responsável geral: quem mais fez serviço da equipe (referência dos indicadores)
      const effWho = done ? (laborRows.length ? laborRows.map(whoOf) : [osWho]).filter(Boolean) : [];
      const allPlatform = effWho.length > 0 && effWho.every(w => w === PLATFORM);
      const bySum = new Map<string, number>();
      if (done) laborRows.forEach(r => { const w = whoOf(r); if (w && w !== PLATFORM) bySum.set(w, (bySum.get(w) ?? 0) + rowTotal(r)); });
      const topMech = [...bySum.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        ?? (done && osWho && osWho !== PLATFORM ? osWho : null);
      const { data: os, error: osErr } = await supabase.from('service_orders').insert({
        workshop_id: wid,
        customer_id: customerId,
        vehicle_id: vehicleId,
        title: f.titulo.trim(),
        description,
        status: done ? 'completed' : 'cancelled',   // não aprovado fica fora do faturamento
        quote_status: done ? null : 'declined',
        created_at: when,
        completed_at: done ? when : null,
        km_reading: f.km ? parseInt(f.km.replace(/\D/g, ''), 10) || null : null,
        price: items.length ? 0 : (aiTotal ?? 0), // com itens, o banco recalcula
        discount: disc,
        source: 'paper_import',
        workshop_mechanic_id: allPlatform ? null : topMech,
        executor: allPlatform ? 'platform' : topMech ? 'workshop' : null,
      }).select('id, number').single();
      if (osErr) throw osErr;
      osId = os.id;

      // 4. Itens (o total é recalculado pelo banco)
      // Peças → cadastro: reaproveita a de mesmo nome ou cria (custo = preço ÷ (1 + margem))
      let catalog = new Map<string, { id: string; cost: number }>();
      if (toCatalog) {
        try {
          catalog = (await ensureCatalogParts(wid, items.filter(r => r.tipo === 'part' && r.descricao.trim())
            .map(r => ({ name: catalogName(r.descricao), price: parseMoney(r.valor || '0') })))).map;
        } catch (err) {
          console.warn('[ImportReview] peças não foram para o cadastro:', err);
        }
      }
      if (items.length) {
        const { error } = await supabase.from('service_order_items').insert(items.map((r, idx) => ({
          service_order_id: os.id, workshop_id: wid, kind: r.tipo,
          description: r.descricao.trim(),
          quantity: parseMoney(r.quantidade),
          unit_price: parseMoney(r.valor || '0'),
          position: idx,
          ...(r.tipo === 'part' && catalog.get(partKey(catalogName(r.descricao)))
            ? { part_id: catalog.get(partKey(catalogName(r.descricao)))!.id,
                unit_cost: catalog.get(partKey(catalogName(r.descricao)))!.cost > 0 ? catalog.get(partKey(catalogName(r.descricao)))!.cost : null }
            : {}),
          // Serviço leva quem fez; peça segue o serviço logo acima dela (comissão)
          ...(done && r.tipo === 'labor' && whoOf(r)
            ? whoOf(r) === PLATFORM
              ? { executor: 'platform', workshop_mechanic_id: null }
              : { executor: 'workshop', workshop_mechanic_id: whoOf(r) }
            : {}),
        })));
        if (error) throw error;
      }

      // 4a. Comissão alterada na conferência (substitui a regra só nesta OS)
      if (done && comm.editing) {
        const { error } = await comm.save(wid, sid, os.id);
        if (error) throw error;
      }

      // 4b. Recebimento com a data da nota (fora do caixa do dia; entra no Financeiro do período)
      if (charge && paidRows.some(p => payVal(p) > 0)) {
        const { error } = await supabase.rpc('import_receive_os', {
          p_workshop: wid, p_session: sid, p_os: os.id, p_paid_at: when,
          p_operator: receivedBy || null,
          p_parts: paidRows.filter(p => payVal(p) > 0).map(p => ({ method: p.method, amount: payVal(p), installments: p.installments })),
        });
        if (error) throw error;
      }
      // F já quitado: recebimento na data em que o cliente pagou (vazia = data da nota)
      if (charge && laterAmt > 0 && laterPaid) {
        const paidAt = laterPaidDate ? new Date(`${laterPaidDate}T12:00:00`).toISOString() : when;
        const { error } = await supabase.rpc('import_receive_os', {
          p_workshop: wid, p_session: sid, p_os: os.id, p_paid_at: paidAt,
          p_operator: receivedBy || null,
          p_parts: [{ method: laterPaidMethod, amount: laterAmt, installments: 1 }],
        });
        if (error) throw error;
      }
      // F (pagar depois): o que falta fica como conta a receber, com vencimento
      if (charge && laterAmt > 0 && !laterPaid) {
        const { error } = await supabase.rpc('cash_pay_later', {
          p_workshop: wid, p_session: sid, p_os: os.id, p_due: laterDue, p_note: laterNote || 'F na nota',
        });
        if (error) throw error;
      }

      // 5. Recomendações para o futuro (base da reativação de clientes)
      const recList = recs.map(r => r.trim()).filter(Boolean);
      if (recList.length) {
        const { error } = await supabase.from('service_recommendations').insert(recList.map(description => ({
          workshop_id: wid, customer_id: customerId, vehicle_id: vehicleId, service_order_id: os.id,
          description, source: 'paper_import', recommended_at: when,
        })));
        if (error) console.warn('[ImportReview] recomendações não salvas:', error.message);
      }

      // 6. Marca a importação como concluída
      await supabase.from('paper_imports').update({
        status: 'confirmed', service_order_id: os.id, customer_id: customerId, confirmed_at: new Date().toISOString(),
        // Guarda a data conferida (o cartão e o filtro "data da nota" usam esta, não a lida pela IA)
        extracted: { ...x, data: f.data || null },
      }).eq('id', imp.id);

      toast.success(done
        ? `Importado ✓ — OS nº ${String(os.number ?? '').padStart(4, '0')}`
        : 'Importado ✓ — orçamento não aprovado salvo para você retomar o contato');
      onDone();
    } catch (e: any) {
      console.error('[ImportReview] erro:', e);
      // Desfaz a OS criada pela metade (itens e recebimento vão junto)
      if (osId) await supabase.from('service_orders').delete().eq('id', osId);
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
            <h2 className="text-lg font-bold">Conferir nota</h2>
            <p className="text-xs text-steel-500">Confira com a foto e corrija o que precisar. Campos em <span className="bg-pending-50 border border-pending-500 px-1 rounded">amarelo</span> a IA leu com dúvida.</p>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-0">
          {/* Foto */}
          <div className="bg-steel-900 lg:sticky lg:top-0 lg:h-[calc(94vh-120px)] flex items-center justify-center p-3">
            {imageUrl && isPdf ? (
              <iframe src={imageUrl} title="Nota original" className="w-full h-[45vh] lg:h-full rounded-lg bg-white" />
            ) : imageUrl ? (
              <img src={imageUrl} alt="Orçamento original" onClick={() => setZoom(z => !z)}
                className={`max-h-[45vh] lg:max-h-full object-contain cursor-zoom-in rounded-lg ${zoom ? 'lg:scale-150 lg:cursor-zoom-out' : ''} transition-transform`} />
            ) : <div className="text-steel-400 text-sm">Carregando arquivo…</div>}
          </div>

          {/* Dados */}
          <div className="p-5 space-y-5">
            {/* Data da nota (a leitura às vezes erra o dia/mês) */}
            <section className="space-y-1.5">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">📅 Data da nota</div>
              <input className={`${cls('data')} ${futureDate ? '!border-alert-500 !bg-alert-50' : ''} !text-base font-semibold`} type="date" max={todayYmd}
                value={f.data} onChange={set('data')} />
              {futureDate && (
                <div className="text-xs bg-alert-50 border border-alert-200 text-alert-700 rounded-lg px-3 py-2">
                  ⚠️ A data da nota ({new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR')}) é depois de hoje — a leitura pode ter errado. Confira no papel e corrija.
                </div>
              )}
              {oldDate && (
                <div className="text-xs bg-pending-50 border border-pending-200 text-pending-800 rounded-lg px-3 py-2">
                  ⚠️ Data de mais de 3 meses atrás ({new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR')}) — confira no papel se a leitura não trocou o mês.
                </div>
              )}
              {!f.data && <div className="text-xs text-pending-800">Sem data: a nota entra com a data de hoje. Se estiver no papel, preencha.</div>}
            </section>

            {/* Foi feito? */}
            <section className="space-y-2">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Esse serviço foi feito?</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDone(true)}
                  className={`rounded-xl border-2 p-3 text-left transition ${done ? 'border-signal-500 bg-signal-50' : 'border-steel-200'}`}>
                  <div className="font-semibold text-sm">✅ Sim, foi feito</div>
                  <div className="text-xs text-steel-500">Entra no histórico como serviço concluído</div>
                </button>
                <button type="button" onClick={() => setDone(false)}
                  className={`rounded-xl border-2 p-3 text-left transition ${!done ? 'border-pending-500 bg-pending-50' : 'border-steel-200'}`}>
                  <div className="font-semibold text-sm">📝 Ficou só no orçamento</div>
                  <div className="text-xs text-steel-500">Cliente não aprovou — vira oportunidade de contato</div>
                </button>
              </div>
            </section>

            {/* Cliente */}
            <section className="space-y-2">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Cliente</div>
              {matchCustomer && (
                <label className="flex items-start gap-2 text-sm bg-signal-50 border border-signal-200 rounded-xl px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={useExisting} onChange={e => setUseExisting(e.target.checked)} />
                  <span>
                    <strong>Já cadastrado:</strong> {matchCustomer.full_name}{matchCustomer.phone ? ` · ${fmtPhone(matchCustomer.phone)}` : ''}
                    <span className="block text-xs text-steel-500">Usar este cadastro (reconhecido pela {matchVehicle ? 'placa' : 'telefone'}). Desmarque para criar outro.</span>
                  </span>
                </label>
              )}
              {!linking && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className={cls('cliente.nome')} placeholder="Nome (opcional)" value={f.nome} onChange={set('nome')} />
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
              <input className={cls('servico_resumo')} placeholder="Serviço * (ex.: Troca de embreagem)" value={f.titulo} onChange={set('titulo')} />
              <textarea className={cls('observacoes')} rows={2} placeholder="Observações" value={f.obs} onChange={set('obs')} />
            </section>

            {/* Recomendações */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Recomendado para o futuro</div>
                  <div className="text-[11px] text-steel-400">Serviços que a oficina indicou fazer depois — viram oportunidade de contato.</div>
                </div>
                <button type="button" onClick={() => setRecs(r => [...r, ''])}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-steel-100 hover:bg-steel-200 shrink-0">+ Recomendação</button>
              </div>
              {recs.map((r, i) => (
                <div key={i} className="flex gap-1.5">
                  <input className={`${cls(`recomendacoes[${i}]`)} flex-1`} placeholder="Ex.: Avaliar bieletas na próxima revisão" value={r}
                    onChange={e => setRecs(list => list.map((v, j) => j === i ? e.target.value : v))} />
                  <button type="button" onClick={() => setRecs(list => list.filter((_, j) => j !== i))}
                    className="h-9 w-9 rounded-lg bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600 text-xs shrink-0">✕</button>
                </div>
              ))}
            </section>

            {/* Itens */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Peças e serviços</div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setItems(s => [...s, { key: ++seq, tipo: 'part', descricao: '', quantidade: '1', valor: '', who: '' }])}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-steel-100 hover:bg-steel-200">+ Peça</button>
                  <button type="button" onClick={() => setItems(s => [...s, { key: ++seq, tipo: 'labor', descricao: '', quantidade: '1', valor: '', who: '' }])}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100">+ Serviço</button>
                </div>
              </div>
              {items.some(r => r.tipo === 'part') && (
                <label className="flex items-start gap-2 text-xs bg-steel-50 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={toCatalog} onChange={e => setToCatalog(e.target.checked)} />
                  <span>
                    <strong>Salvar as peças no cadastro</strong> (Peças e estoque) com o preço desta nota; o custo sai pela margem da loja
                    (100% → metade do preço). Peça com o mesmo nome já cadastrada é reaproveitada. Dá para mudar depois.
                    {vehicleLabel
                      ? <span className="block mt-1 text-steel-600">Veículo identificado: entram como <strong>“{catalogName(items.find(r => r.tipo === 'part')?.descricao || 'Peça')}”</strong>.</span>
                      : <span className="block mt-1 text-steel-500">Sem veículo na nota: entram com o nome como está.</span>}
                  </span>
                </label>
              )}
              {items.map((r, idx) => (
                /* Duas linhas por item: o painel de conferência ocupa só metade da tela */
                <div key={r.key} className="grid grid-cols-12 gap-1.5 items-center pb-2 border-b border-steel-100 last:border-0">
                  {/* Cada lançamento é 1 item, como num cupom */}
                  <div className="col-span-12 text-[10px] font-bold text-steel-400 uppercase tracking-wider">Item {idx + 1}</div>
                  <select className="input !py-2 !px-2 text-xs col-span-3" value={r.tipo}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, tipo: e.target.value as OsItemKind } : i))}>
                    <option value="part">Peça</option>
                    <option value="labor">Serviço</option>
                  </select>
                  <input className={`${cls(`itens[${idx}].descricao`)} col-span-9`} placeholder="Descrição" value={r.descricao}
                    onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, descricao: e.target.value } : i))} />
                  <label className="col-span-3 text-[10px] text-steel-400 uppercase">
                    Qtd
                    <input className={`${cls(`itens[${idx}].quantidade`)} text-right mt-0.5`} inputMode="decimal" value={r.quantidade}
                      onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, quantidade: e.target.value } : i))} />
                  </label>
                  <label className="col-span-4 text-[10px] text-steel-400 uppercase">
                    Valor unit.
                    <input className={`${cls(`itens[${idx}].valor_unitario`)} text-right mt-0.5`} inputMode="decimal" placeholder="0,00" value={r.valor}
                      onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, valor: e.target.value } : i))} />
                  </label>
                  <div className="col-span-4 text-right self-end pb-2">
                    <div className="text-[10px] text-steel-400 uppercase">Total</div>
                    <div className="text-sm font-bold whitespace-nowrap">{fmtBRL(rowTotal(r))}</div>
                  </div>
                  <button type="button" onClick={() => setItems(s => s.filter(i => i.key !== r.key))} title="Remover item"
                    className="col-span-1 self-end mb-0.5 h-9 rounded-lg bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600 text-xs">✕</button>
                </div>
              ))}
              <div className="flex justify-end items-center gap-3 pt-2 text-sm">
                <span className="text-steel-500">Desconto</span>
                <input className="input !py-1.5 w-28 text-right text-sm" inputMode="decimal" placeholder="0,00" value={f.desconto} onChange={set('desconto')} />
              </div>
              <div className="flex justify-end items-baseline gap-3">
                {items.length > 0 && <span className="text-xs text-steel-400 mr-auto">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>}
                <span className="text-sm text-steel-500">Total</span>
                <span className="text-2xl font-bold font-display">{fmtBRL(items.length ? total : (aiTotal ?? 0))}</span>
              </div>
              {totalMismatch && (
                <div className="text-xs bg-pending-50 border border-pending-200 text-pending-800 rounded-lg px-3 py-2">
                  ⚠️ No papel o total está {fmtBRL(aiTotal)}, mas a soma dos itens dá {fmtBRL(total)}. Confira os valores.
                </div>
              )}
            </section>

            {/* Quem fez — comissão e desempenho no mês da nota */}
            {showWho && (
              <section className="space-y-2">
                <div>
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">
                    Quem fez o serviço {needWho ? <span className="text-alert-600">*</span> : <span className="normal-case font-normal text-steel-400">(opcional)</span>}
                  </div>
                  <div className="text-[11px] text-steel-400">
                    {onlyParts
                      ? 'Nota só com peças: informe quem instalou, se alguém instalou. Peça sem serviço não tem comissão pela regra — use “Alterar ou digitar valor” se ele ganha algo.'
                      : 'A comissão entra no mês da nota. Peça vai junto com o serviço logo acima dela.'}
                  </div>
                </div>
                <select className={`input !py-2 text-sm ${!osWho && whoMissing ? '!border-pending-500 !bg-pending-50' : ''}`}
                  value={osWho} onChange={e => setOsWho(e.target.value)}>
                  <option value="">{laborRows.length > 1 ? 'Responsável pela nota (vale para todos os serviços)…' : 'Selecione…'}</option>
                  {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  <option value={PLATFORM}>🌐 Mecânico da plataforma</option>
                </select>
                {x?.mecanico && !osWho && <div className="text-[11px] text-pending-700">Na nota está escrito “{x.mecanico}” — escolha quem é da equipe.</div>}
                {laborRows.length > 1 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-steel-500">Serviço feito por outra pessoa? Troque só nele:</div>
                    {laborRows.map(r => (
                      <div key={r.key} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-sm truncate">{r.descricao || 'Serviço'} <span className="text-steel-400 text-xs">· {fmtBRL(rowTotal(r))}</span></div>
                        <select className={`input !py-1.5 text-sm !w-44 shrink-0 ${!whoOf(r) ? '!border-pending-500' : ''}`} value={r.who}
                          onChange={e => setItems(s => s.map(i => i.key === r.key ? { ...i, who: e.target.value } : i))}>
                          <option value="">{osWho ? `Mesmo (${osWho === PLATFORM ? 'plataforma' : team.find(t => t.id === osWho)?.name ?? ''})` : 'Selecione…'}</option>
                          {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          <option value={PLATFORM}>🌐 Plataforma</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Comissões — pela regra, com opção de alterar */}
            {done && team.length > 0 && (
              <section>
                <OsCommission c={comm} team={team} className="rounded-xl border border-steel-200 px-3 py-3" />

              </section>
            )}

            {/* Pagamento — entra no Financeiro com a data da nota */}
            {done && finalTotal > 0 && (
              <section className="space-y-2">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Pagamento</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPaid(true)}
                    className={`rounded-xl border-2 p-2.5 text-left transition ${paid ? 'border-signal-500 bg-signal-50' : 'border-steel-200'}`}>
                    <div className="font-semibold text-sm">💰 Foi pago</div>
                    <div className="text-[11px] text-steel-500">
                      {!f.data || f.data === todayYmd ? 'Nota de hoje: entra no caixa aberto (conta na gaveta)' : `Entra como recebido em ${new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR')}, fora do caixa`}
                    </div>
                  </button>
                  <button type="button" onClick={() => setPaid(false)}
                    className={`rounded-xl border-2 p-2.5 text-left transition ${!paid ? 'border-pending-500 bg-pending-50' : 'border-steel-200'}`}>
                    <div className="font-semibold text-sm">⏳ Ficou em aberto</div>
                    <div className="text-[11px] text-steel-500">Recebe depois pelo Caixa</div>
                  </button>
                </div>
                {paid && (
                  <>
                    {payRows.map(p => (
                      <div key={p.key} className="flex gap-1.5 items-center">
                        <select className={`input !py-2 text-sm flex-1 min-w-0 ${!p.method || isUnsure('pagamentos') ? '!border-pending-500 !bg-pending-50' : ''}`}
                          value={p.method} onChange={e => setPay(p.key, { method: e.target.value as PayMethod, installments: 1 })}>
                          <option value="">Forma de pagamento…</option>
                          {RECEIVE_METHODS.map(m => <option key={m} value={m}>{METHODS[m].icon} {METHODS[m].label}</option>)}
                          <option value="depois">🕒 Pagar depois (F)</option>
                        </select>
                        {p.method === 'credito' && (
                          <select className="input !py-2 text-sm !w-16 shrink-0 !px-2" value={p.installments} onChange={e => setPay(p.key, { installments: Number(e.target.value) })}>
                            {Array.from({ length: 12 }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                          </select>
                        )}
                        <input className="input !py-2 text-sm !w-28 shrink-0 text-right" inputMode="decimal" placeholder="0,00"
                          value={p.amount}
                          onChange={e => setPay(p.key, { amount: e.target.value })} />
                        {pays.length > 1 && (
                          <button type="button" onClick={() => setPays(ps => ps.filter(x2 => x2.key !== p.key))}
                            className="h-9 w-9 rounded-lg bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600 text-xs shrink-0">✕</button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={addPay} className="text-xs font-semibold text-brand-600">+ Outra forma</button>
                      <span className={`text-xs font-semibold ${Math.abs(payMissing) < 0.005 ? 'text-signal-700' : payMissing > 0 ? 'text-pending-800' : 'text-alert-600'}`}>
                        {Math.abs(payMissing) < 0.005 ? '✓ Valor fechado' : payMissing > 0 ? `Falta ${fmtBRL(payMissing)}` : `Passou ${fmtBRL(-payMissing)}`}
                      </span>
                    </div>
                    {laterAmt > 0 && (
                      <div className="rounded-xl border-2 border-brand-300 bg-brand-50/40 p-2.5 space-y-2">
                        <div className="text-xs font-semibold">🕒 {fmtBRL(laterAmt)} para pagar depois (F)</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button type="button" onClick={() => setLaterPaid(false)}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-semibold ${!laterPaid ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-600'}`}>
                            ⏳ Ainda vai pagar
                          </button>
                          <button type="button" onClick={() => { setLaterPaid(true); if (!laterPaidDate) setLaterPaidDate(f.data || todayYmd); }}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-semibold ${laterPaid ? 'bg-signal-600 text-white border-signal-600' : 'bg-white border-steel-200 text-steel-600'}`}>
                            ✅ O cliente já pagou
                          </button>
                        </div>
                        {laterPaid ? (
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] text-steel-500">Pagou com *
                              <select className={`input !py-2 text-sm mt-0.5 ${laterPaidMethod ? '' : '!border-pending-500 !bg-pending-50'}`} value={laterPaidMethod}
                                onChange={e => setLaterPaidMethod(e.target.value as PayMethod)}>
                                <option value="">Forma…</option>
                                {RECEIVE_METHODS.map(m => <option key={m} value={m}>{METHODS[m].icon} {METHODS[m].label}</option>)}
                              </select>
                            </label>
                            <label className="text-[11px] text-steel-500">Pagou em
                              <input type="date" className="input !py-2 text-sm mt-0.5" max={todayYmd} value={laterPaidDate} onChange={e => setLaterPaidDate(e.target.value)} />
                            </label>
                            <div className="col-span-2 text-[11px] text-steel-500">Entra como recebido nessa data (fora do caixa, se não for hoje). Não fica em “a receber”.</div>
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-steel-500">Vai pagar até *
                            <input type="date" className="input !py-2 text-sm mt-0.5" value={laterDue} onChange={e => setLaterDue(e.target.value)} />
                          </label>
                          <label className="text-[11px] text-steel-500">Observação
                            <input className="input !py-2 text-sm mt-0.5" placeholder="Ex.: paga dia 10" value={laterNote} onChange={e => setLaterNote(e.target.value)} />
                          </label>
                        </div>
                        )}
                        {!laterPaid && <div className="text-[11px] text-steel-500">Fica em Caixa → Pagar depois e no Financeiro → OS a receber.</div>}
                      </div>
                    )}
                    {ops.length > 0 && (
                      <label className="block text-[11px] text-steel-500">
                        Quem recebeu
                        <select className="input !py-2 text-sm mt-0.5" value={receivedBy} onChange={e => setReceivedBy(e.target.value)}>
                          {ops.map(o => <option key={o.id} value={o.id}>{o.name}{o.is_owner ? ' (dono)' : ''}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </section>
            )}
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
