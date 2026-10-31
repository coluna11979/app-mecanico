import { CONFIG, track, wa } from '../config';

/* =====================================================================
   8 · Footer minimalista preto
   ===================================================================== */
export default function Footer() {
  const zap = wa(CONFIG.mensagens.geral);
  return (
    <footer className="border-t border-white/[0.08] bg-black px-6 py-12 text-[12px] text-mist">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="text-[15px] font-semibold tracking-tight text-white">Jota Car<span className="text-gold">.</span></p>
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-1">
            <a href="#servicos" className="inline-flex min-h-[44px] items-center hover:text-white">Serviços</a>
            <a href="#diagnostico" className="inline-flex min-h-[44px] items-center hover:text-white">Diagnóstico</a>
            <a href="#localizacao" className="inline-flex min-h-[44px] items-center hover:text-white">Localização</a>
            <a href={zap} target="_blank" rel="noopener" onClick={() => track('wa_footer', zap)} className="inline-flex min-h-[44px] items-center hover:text-white">WhatsApp {CONFIG.telefone}</a>
            <a href={CONFIG.instagram} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center hover:text-white">Instagram</a>
          </nav>
        </div>
        <p className="mt-8 border-t border-white/[0.08] pt-6 leading-relaxed text-white/40">
          Jota Car Serviços Automotivo · {CONFIG.razaoSocial} · CNPJ {CONFIG.cnpj} · {CONFIG.endereco}, {CONFIG.cidade} · © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
