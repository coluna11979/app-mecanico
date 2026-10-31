import { useEffect, useState } from 'react';
import { CONFIG, track, wa } from '../config';

/* =====================================================================
   1 · Header fixo minimalista
   ===================================================================== */
const links = [
  { href: '#servicos', label: 'Serviços' },
  { href: '#diagnostico', label: 'Diagnóstico' },
  { href: '#sobre', label: 'Sobre' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#localizacao', label: 'Localização' },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  // Esc fecha o menu; trava a rolagem do fundo enquanto aberto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const agendar = wa(CONFIG.mensagens.agendar);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1168px] items-center justify-between px-6">
        <a href="#topo" className="text-[19px] font-semibold tracking-tight text-white" aria-label="Jota Car, voltar ao topo">
          Jota Car<span className="text-gold">.</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seções">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[13px] tracking-tight text-white/70 transition-colors duration-300 hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={agendar}
            target="_blank"
            rel="noopener"
            onClick={() => track('wa_header', agendar)}
            className="inline-flex h-9 items-center rounded-full bg-gold px-4 text-[13px] font-medium tracking-tight text-black transition-colors duration-300 hover:bg-[#E9B90C]"
          >
            Agendar atendimento
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            className="grid h-11 w-11 place-items-center rounded-full text-white md:hidden"
          >
            <span className="relative block h-3 w-[18px]">
              <span className={`absolute left-0 block h-[1.5px] w-full bg-current transition-transform duration-300 ease-apple ${open ? 'top-[5px] rotate-45' : 'top-0'}`} />
              <span className={`absolute left-0 block h-[1.5px] w-full bg-current transition-transform duration-300 ease-apple ${open ? 'top-[5px] -rotate-45' : 'top-[10px]'}`} />
            </span>
          </button>
        </div>
      </div>

      {/* Menu mobile em tela cheia */}
      <div
        id="menu-mobile"
        className={`fixed inset-x-0 bottom-0 top-14 bg-black transition-all duration-500 ease-apple md:hidden ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        <nav className="flex flex-col px-8 pt-8" aria-label="Seções">
          {links.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${80 + i * 40}ms` : '0ms' }}
              className={`py-3 text-[28px] font-semibold tracking-tight text-white transition-all duration-500 ease-apple ${open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
