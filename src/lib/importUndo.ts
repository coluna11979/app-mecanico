/**
 * Editar uma nota importada que já foi conferida.
 *
 * A conferência cria uma OS concluída, com itens, recebimento (os_payments → cash_entries),
 * comissão alterada e recomendações. Para editar, a OS é desfeita e a nota volta para
 * "Para conferir" já com os dados que foram conferidos (não os lidos pela IA). Ao confirmar
 * de novo, tudo é recriado do zero, pelo mesmo caminho da primeira conferência.
 *
 * Apagar a OS leva junto (on delete cascade) itens, recebimentos, lançamentos de caixa e
 * comissão alterada. É o mesmo desfazer que a conferência já usa quando dá erro no meio.
 *
 * Travas: não desfaz se o recebimento caiu num caixa já fechado, nem se a comissão da
 * quinzena da nota já foi fechada para alguém que trabalhou nela.
 */
import { supabase } from '@/lib/supabase';
import type { OsItemKind, PaperImport, PaperQuoteExtracted } from '@/types/database';

type OsRow = {
  id: string; number: number | null; title: string; status: string; discount: number | null;
  completed_at: string | null; created_at: string; km_reading: number | null; workshop_mechanic_id: string | null;
  pay_later_due: string | null; price: number; paid_amount: number;
  customer: { full_name: string | null; phone: string | null; cpf: string | null; address: string | null } | null;
  vehicle: { make: string | null; model: string | null; plate: string | null; year: number | null; color: string | null } | null;
  mechanic: { name: string } | null;
  items: { kind: OsItemKind; description: string; quantity: number; unit_price: number; position: number; workshop_mechanic_id: string | null }[];
  payments: { id: string; cancelled_at: string | null; register: { status: string } | null; entries: { kind: string; method: string; amount: number; installments: number | null }[] }[];
  overrides: { mechanic_id: string | null }[];
};

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clean = (s: string | null | undefined) => (s && !/n[aã]o informado/i.test(s) && s !== 'S/P' ? s : null);

export type UndoCheck = { ok: true; os: OsRow; hasPayments: boolean } | { ok: false; reason: string };

/** Lê a OS da nota e diz se dá para desfazer */
export async function checkUndo(imp: PaperImport): Promise<UndoCheck> {
  if (!imp.service_order_id) return { ok: false, reason: 'Esta nota não tem OS ligada.' };
  const { data, error } = await supabase.from('service_orders')
    .select(`id, number, title, status, discount, completed_at, created_at, km_reading, workshop_mechanic_id, pay_later_due, price, paid_amount,
      customer:customers(full_name, phone, cpf, address),
      vehicle:vehicles(make, model, plate, year, color),
      mechanic:workshop_mechanics!fk_so_workshop_mechanic(name),
      items:service_order_items(kind, description, quantity, unit_price, position, workshop_mechanic_id),
      payments:os_payments(id, cancelled_at, register:cash_registers(status), entries:cash_entries(kind, method, amount, installments)),
      overrides:os_commission_overrides(mechanic_id)`)
    .eq('id', imp.service_order_id).maybeSingle();
  if (error) return { ok: false, reason: 'Não foi possível ler a OS: ' + error.message };
  if (!data) return { ok: false, reason: 'A OS desta nota não existe mais.' };
  const os = data as unknown as OsRow;

  const live = os.payments.filter(p => !p.cancelled_at);
  if (live.some(p => p.register?.status === 'closed')) {
    return { ok: false, reason: 'O recebimento desta nota entrou num caixa que já foi fechado. Para editar, cancele o recebimento pela OS antes.' };
  }

  if (os.status === 'completed' && os.completed_at) {
    const day = localDay(os.completed_at);
    const competence = day.slice(0, 7);
    const half = Number(day.slice(8, 10)) <= 15 ? 1 : 2;
    const mechs = new Set([os.workshop_mechanic_id, ...os.items.map(i => i.workshop_mechanic_id), ...os.overrides.map(o => o.mechanic_id)]
      .filter((x): x is string => !!x));
    if (mechs.size) {
      const { data: closed } = await supabase.from('commission_closings').select('id')
        .eq('competence', competence).eq('half', half).in('mechanic_id', [...mechs]).limit(1);
      if (closed?.length) {
        return { ok: false, reason: `A comissão da ${half}ª quinzena de ${competence.slice(5)}/${competence.slice(0, 4)} já foi fechada para quem fez este serviço. Editar a nota mudaria uma comissão já paga.` };
      }
    }
  }
  return { ok: true, os, hasPayments: live.length > 0 };
}

/** Dados conferidos (os da OS) no formato da leitura, para a nota voltar à conferência */
function extractedFromOs(os: OsRow, prev: PaperQuoteExtracted | null): PaperQuoteExtracted {
  const items = [...os.items].sort((a, b) => a.position - b.position);
  const sum = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const discount = Number(os.discount ?? 0);
  const total = Math.round((items.length ? sum - discount : Number(os.price)) * 100) / 100;

  const pays: NonNullable<PaperQuoteExtracted['pagamentos']> = [];
  for (const p of os.payments.filter(x => !x.cancelled_at)) {
    for (const e of p.entries.filter(x => x.kind === 'recebimento')) {
      if (['dinheiro', 'pix', 'debito', 'credito'].includes(e.method)) {
        pays.push({ forma: e.method as 'dinheiro', valor: Number(e.amount), parcelas: Number(e.installments ?? 1) || 1 });
      }
    }
  }
  const open = Math.round((Number(os.price) - Number(os.paid_amount)) * 100) / 100;
  if (os.pay_later_due && open > 0) pays.push({ forma: 'depois', valor: open, parcelas: 1 });

  const c = os.customer, v = os.vehicle;
  return {
    ...(prev ?? {} as PaperQuoteExtracted),
    legivel: prev?.legivel ?? true,
    cliente: {
      nome: c?.full_name ?? prev?.cliente?.nome ?? null,
      telefone: c?.phone ?? prev?.cliente?.telefone ?? null,
      cpf: c?.cpf ?? prev?.cliente?.cpf ?? null,
      endereco: c?.address ?? prev?.cliente?.endereco ?? null,
    },
    veiculo: {
      marca: clean(v?.make) ?? prev?.veiculo?.marca ?? null,
      modelo: clean(v?.model) ?? prev?.veiculo?.modelo ?? null,
      placa: clean(v?.plate) ?? prev?.veiculo?.placa ?? null,
      ano: v?.year ?? prev?.veiculo?.ano ?? null,
      cor: v?.color ?? prev?.veiculo?.cor ?? null,
      km: os.km_reading ?? prev?.veiculo?.km ?? null,
    },
    data: localDay(os.completed_at ?? os.created_at),
    servico_resumo: os.title || prev?.servico_resumo || null,
    itens: items.map(i => ({ tipo: i.kind, descricao: i.description, quantidade: Number(i.quantity), valor_unitario: Number(i.unit_price) })),
    desconto: discount || null,
    total,
    pagamentos: pays.length ? pays : prev?.pagamentos,
    mecanico: os.mechanic?.name ?? prev?.mecanico,
    campos_incertos: [],
  };
}

/** Desfaz a OS e devolve a nota para "Para conferir". Retorna a nota atualizada. */
export async function reopenImport(imp: PaperImport, os: OsRow): Promise<PaperImport> {
  const extracted = extractedFromOs(os, imp.extracted);
  // 1. Nota volta para conferência (se o resto falhar, volta como estava)
  const { error: e1 } = await supabase.from('paper_imports')
    .update({ status: 'extracted', extracted, confirmed_at: null }).eq('id', imp.id);
  if (e1) throw e1;
  const { data: recs } = await supabase.from('service_recommendations').select('id').eq('service_order_id', os.id);
  // 2. A OS (itens, recebimentos, caixa e comissão alterada vão junto)
  const { error: e2 } = await supabase.from('service_orders').delete().eq('id', os.id);
  if (e2) {
    await supabase.from('paper_imports').update({ status: 'confirmed', extracted: imp.extracted, confirmed_at: imp.confirmed_at }).eq('id', imp.id);
    throw e2;
  }
  // 3. Recomendações da OS antiga (a nova conferência recria)
  const recIds = (recs ?? []).map(r => (r as { id: string }).id);
  if (recIds.length) await supabase.from('service_recommendations').delete().in('id', recIds);
  await supabase.from('paper_imports').update({ service_order_id: null, customer_id: null }).eq('id', imp.id);
  return { ...imp, status: 'extracted', extracted, service_order_id: null, customer_id: null, confirmed_at: null };
}
