import Header from './components/Header';
import Hero from './components/Hero';
import Services from './components/Services';
import Diagnostico from './components/Diagnostico';
import Sobre from './components/Sobre';
import ComoFunciona from './components/ComoFunciona';
import Localizacao from './components/Localizacao';
import Footer from './components/Footer';

/** Landing page da Jota Car — 8 blocos, nesta ordem */
export default function App() {
  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-black">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo">
        <Hero />
        <Services />
        <Diagnostico />
        <Sobre />
        <ComoFunciona />
        <Localizacao />
      </main>
      <Footer />
    </>
  );
}
