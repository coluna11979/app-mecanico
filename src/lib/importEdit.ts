/**
 * Editar uma nota importada que já foi conferida — no lugar, sem apagar a OS.
 *
 * A OS continua a mesma (mesmo número). A conferência abre com os dados que foram conferidos
 * (não os lidos pela IA) e, ao salvar, atualiza a OS: cliente, carro, data, itens, quem fez,
 * comissão e recomendações. O recebimento só é mexido se mudar, e pelo "corrigir pagamento"
 * do caixa (cash_fix_payment), que já vale para caixa fechado: o lançamento continua no mesmo
 * caixa e na mesma data, só com as formas e valores novos.
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
  payments: { id: string; cancelled_at: string | null; created_at: string; register: { status: string } | null; entries: { kind: string; method: string; amount: number; installments: number | null; cancelled_at: string | null }[] }[];
  overrides: { mechanic_id: string | null }[];
};

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clean = (s: string | null | undefined) => (s && !/n[aã]o informado/i.test(s) && s !== 'S/P' ? s : null);

export type EditOs = OsRow;

/** Lê a OS da nota para editar. Devolve a nota com os dados conferidos no lugar da leitura. */
export async function loadForEdit(imp: PaperImport): Promise<{ os: EditOs; imp: PaperImport; hasPayments: boolean; closedCommission: string | null }> {
  if (!imp.service_order_id) throw new Error('Esta nota não tem OS ligada.');
  const { data, error } = await supabase.from('service_orders')
    .select(`id, number, title, status, discount, completed_at, created_at, km_reading, workshop_mechanic_id, pay_later_due, price, paid_amount,
      customer:customers(full_name, phone, cpf, address),
      vehicle:vehicles(make, model, plate, year, color),
      mechanic:workshop_mechanics!fk_so_workshop_mechanic(name),
      items:service_order_items(kind, description, quantity, unit_price, position, workshop_mechanic_id),
      payments:os_payments(id, cancelled_at, created_at, register:cash_registers(status), entries:cash_entries(kind, method, amount, installments, cancelled_at)),
      overrides:os_commission_overrides(mechanic_id)`)
    .eq('id', imp.service_order_id).maybeSingle();
  if (error) throw new Error('Não foi possível ler a OS: ' + error.message);
  if (!data) throw new Error('A OS desta nota não existe mais.');
  const os = data as unknown as OsRow;
  os.payments = os.payments.filter(p => !p.cancelled_at)
    .map(p => ({ ...p, entries: p.entries.filter(e => !e.cancelled_at && e.kind === 'recebimento') }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Comissão da quinzena já fechada: avisa (a edição não muda o que já foi pago)
  let closedCommission: string | null = null;
  if (os.status === 'completed' && os.completed_at) {
    const day = localDay(os.completed_at);
    const competence = day.slice(0, 7);
    const half = Number(day.slice(8, 10)) <= 15 ? 1 : 2;
    const mechs = [os.workshop_mechanic_id, ...os.items.map(i => i.workshop_mechanic_id), ...os.overrides.map(o => o.mechanic_id)]
      .filter((x): x is string => !!x);
    if (mechs.length) {
      const { data: closed } = await supabase.from('commission_closings').select('id')
        .eq('competence', competence).eq('half', half).in('mechanic_id', [...new Set(mechs)]).limit(1);
      if (closed?.length) closedCommission = `${half}ª quinzena de ${competence.slice(5)}/${competence.slice(0, 4)}`;
    }
  }
  return { os, imp: { ...imp, extracted: extractedFromOs(os, imp.extracted) }, hasPayments: os.payments.length > 0, closedCommission };
}

/** Dados conferidos (os da OS) no formato da leitura, para a nota voltar à conferência */
function extractedFromOs(os: OsRow, prev: PaperQuoteExtracted | null): PaperQuoteExtracted {
  const items = [...os.items].sort((a, b) => a.position - b.position);
  const sum = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const discount = Number(os.discount ?? 0);
  const total = Math.round((items.length ? sum - discount : Number(os.price)) * 100) / 100;

  const pays: NonNullable<PaperQuoteExtracted['pagamentos']> = [];
  for (const p of os.payments) {
    for (const e of p.entries) {
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
