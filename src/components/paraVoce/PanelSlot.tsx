import PanelBanners from '@/components/banners/PanelBanners';
import { type PanelId, usePanelLayout } from '@/lib/panelLayout';
import { ArticlesRow, PartnersRow } from './ParaVoceRows';

/**
 * Uma posição do painel onde o admin pode encaixar banners, dicas do blog e
 * benefícios (Marketing → Banners → Posição nos painéis). Vazia, não ocupa espaço.
 */
export default function PanelSlot({ panel, at, className = '' }: { panel: PanelId; at: string; className?: string }) {
  const layout = usePanelLayout();
  if (!layout) return null;
  const here = layout[panel];
  const showBanners = here.banners === at;
  const showConteudo = here.conteudo === at;
  const showBeneficios = here.beneficios === at;
  if (!showBanners && !showConteudo && !showBeneficios) return null;

  // Cada parte some sozinha se não houver nada publicado; [&:empty]:hidden evita espaço sobrando
  return (
    <div className={`space-y-5 [&:empty]:hidden ${className}`}>
      {showBanners && <PanelBanners />}
      {showConteudo && <ArticlesRow />}
      {showBeneficios && <PartnersRow />}
    </div>
  );
}
