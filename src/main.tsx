import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/globals.css';

// Service Worker é registrado e controlado pelo componente <UpdatePrompt />
// no App.tsx — ele usa o hook useRegisterSW do vite-plugin-pwa, que faz
// checagem periódica de novas versões e mostra um banner pro usuário.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
