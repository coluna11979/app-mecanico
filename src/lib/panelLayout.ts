import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Onde o conteúdo do admin (banners, dicas do blog, benefícios) aparece em cada
 * painel. O admin escolhe em Marketing → Banners; fica em app_settings
 * ('panel_content_layout', público para quem está logado — não é segredo).
 */

export type PanelId = 'oficina_demandas' | 'oficina_inicio' | 'mecanico';
export type ItemId = 'banners' | 'conteudo' | 'beneficios';
export type Layout = Record<PanelId, Record<ItemId, string>>;   // valor = id da posição ou 'oculto'

export const ITEMS: { id: ItemId; label: string }[] = [
  { id: 'banners',    label: '🪧 Banners' },
  { id: 'conteudo',   label: '📰 Dicas e conteúdo (blog)' },
  { id: 'beneficios', label: '🎁 Benefícios (parceiros)' },
];

/** Posições de cada painel, na ordem em que aparecem na tela. */
export const PANELS: { id: PanelId; label: string; slots: { id: string; label: string }[] }[] = [
  { id: 'oficina_demandas', label: 'Oficina · Demandas', slots: [
    { id: 'topo',              label: 'No topo (acima de Nova demanda)' },
    { id: 'apos-nova-demanda', label: 'Abaixo de Nova demanda' },
    { id: 'apos-contadores',   label: 'Abaixo dos contadores (Em busca, Aceitas…)' },
    { id: 'apos-atalhos',      label: 'Abaixo de Atalhos de serviço' },
    { id: 'apos-preferidos',   label: 'Abaixo de Meus preferidos' },
    { id: 'apos-avaliacoes',   label: 'Abaixo de Avaliações pendentes' },
    { id: 'apos-solicitacoes', label: 'Abaixo de Minhas solicitações (fim)' },
  ] },
  { id: 'oficina_inicio', label: 'Oficina · Início', slots: [
    { id: 'topo', label: 'No topo (abaixo da saudação)' },
  ] },
  { id: 'mecanico', label: 'Mecânico · Início', slots: [
    { id: 'topo',             label: 'No topo (acima do status)' },
    { id: 'apos-status',      label: 'Abaixo do status (Disponível)' },
    { id: 'apos-andamento',   label: 'Abaixo de Em andamento' },
    { id: 'apos-disponiveis', label: 'Abaixo de Serviços disponíveis' },
    { id: 'fim',              label: 'No fim da tela' },
  ] },
];

export const DEFAULT_LAYOUT: Layout = {
  oficina_demandas: { banners: 'topo', conteudo: 'apos-avaliacoes', beneficios: 'apos-avaliacoes' },
  oficina_inicio:   { banners: 'topo', conteudo: 'topo', beneficios: 'topo' },
  mecanico:         { banners: 'topo', conteudo: 'topo', beneficios: 'topo' },
};

export const LAYOUT_KEY = 'panel_content_layout';

function merge(raw: unknown): Layout {
  const out = structuredClone(DEFAULT_LAYOUT);
  if (raw && typeof raw === 'object') {
    for (const p of PANELS) {
      const v = (raw as Record<string, Record<string, string>>)[p.id];
      if (!v) continue;
      for (const it of ITEMS) {
        const pos = v[it.id];
        if (pos === 'oculto' || p.slots.some(s => s.id === pos)) out[p.id][it.id] = pos;
      }
    }
  }
  return out;
}

let cached: Promise<Layout> | null = null;

export function loadLayout(force = false) {
  if (!cached || force) {
    cached = Promise.resolve(supabase.from('app_settings').select('value').eq('key', LAYOUT_KEY).maybeSingle())
      .then(({ data }) => { try { return merge(data?.value ? JSON.parse(data.value) : null); } catch { return merge(null); } })
      .catch(() => merge(null));
  }
  return cached;
}

/** Layout atual (padrão enquanto carrega). */
export function usePanelLayout() {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => { let alive = true; loadLayout().then(l => { if (alive) setLayout(l); }); return () => { alive = false; }; }, []);
  return layout;
}
