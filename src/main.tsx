import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { AppErrorBoundary, reloadForNewVersion } from './components/AppErrorBoundary';
import './styles/globals.css';

// Service Worker é registrado e controlado pelo componente <UpdatePrompt />
// no App.tsx — ele usa o hook useRegisterSW do vite-plugin-pwa, que faz
// checagem periódica de novas versões e mostra um banner pro usuário.

// Deploy novo com o app aberto: arquivo antigo some do servidor e o Vite
// avisa com este evento. Recarrega uma vez, já na versão nova.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </AppErrorBoundary>
);
