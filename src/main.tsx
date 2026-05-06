import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/globals.css';

/**
 * Service Worker auto-update.
 *
 * Padrão seguro: só recarrega quando havia um SW controlando a página
 * E só uma vez por sessão. Isso evita o loop infinito que acontece
 * quando o primeiro SW ativa com clientsClaim:true (controllerchange
 * dispara, recarrega, no novo load dispara de novo, etc).
 */
if ('serviceWorker' in navigator) {
  // Se a página já está sob controle de um SW antigo, listenamos por updates.
  // Se NÃO está controlada (primeira visita), o controllerchange que vem
  // a seguir é da instalação inicial — ignoramos para não recarregar à toa.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
