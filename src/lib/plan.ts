/**
 * Plano da oficina (Grátis × VIP). O VIP é liberado manualmente pelo admin
 * depois que um colaborador combina o pagamento — ver /admin/vip.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type WorkshopPlan = {
  workshop_id: string; plan: 'free' | 'vip';
  vip_since: string | null; vip_until: string | null; price_note: string | null;
};
export type VipRequestStatus = 'pending' | 'contacted' | 'activated' | 'declined';
export type VipRequest = {
  id: string; workshop_id: string; requested_by: string | null;
  contact_name: string | null; phone: string | null; best_time: string | null; message: string | null;
  status: VipRequestStatus; admin_notes: string | null; handled_at: string | null; created_at: string;
};

export const isVipActive = (p: WorkshopPlan | null | undefined) =>
  !!p && p.plan === 'vip' && (!p.vip_until || new Date(p.vip_until) > new Date());

export const VIP_REQUEST_STATUS: Record<VipRequestStatus, { label: string; color: string }> = {
  pending:   { label: 'Aguardando contato', color: 'bg-pending-100 text-pending-800' },
  contacted: { label: 'Em negociação',      color: 'bg-brand-100 text-brand-800' },
  activated: { label: 'VIP liberado',       color: 'bg-signal-100 text-signal-800' },
  declined:  { label: 'Não fechou',         color: 'bg-steel-100 text-steel-600' },
};

/** Plano atual + solicitação em aberto da oficina */
export function useWorkshopPlan(workshopId: string | null | undefined) {
  const [plan, setPlan] = useState<WorkshopPlan | null>(null);
  const [request, setRequest] = useState<VipRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from('workshop_plans').select('*').eq('workshop_id', workshopId).maybeSingle(),
      supabase.from('vip_requests').select('*').eq('workshop_id', workshopId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPlan((p.data as WorkshopPlan) ?? null);
    setRequest((r.data as VipRequest) ?? null);
    setLoading(false);
  }, [workshopId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { plan, isVip: isVipActive(plan), request, loading, refresh };
}
