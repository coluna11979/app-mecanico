import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UpdatePrompt } from './components/UpdatePrompt';

import Landing from './pages/public/Landing';
import LandingMecanico from './pages/public/LandingMecanico';
import LandingOficina from './pages/public/LandingOficina';
import Login from './pages/public/Login';
import SignupMechanic from './pages/public/SignupMechanic';
import SignupWorkshop from './pages/public/SignupWorkshop';
import PendingApproval from './pages/public/PendingApproval';
import Terms from './pages/public/Terms';
import Privacy from './pages/public/Privacy';
import ForgotPassword from './pages/public/ForgotPassword';
import ResetPassword from './pages/public/ResetPassword';

import MechanicDashboard from './pages/mecanico/Dashboard';
import MechanicJob from './pages/mecanico/JobDetail';
import MechanicProfile from './pages/mecanico/Profile';
import MechanicGanhos from './pages/mecanico/Ganhos';

// Lazy: páginas com Mapbox (~3.7MB) — carregadas sob demanda
const MechanicTracking = lazy(() => import('./pages/mecanico/Tracking'));
const MechanicMapa = lazy(() => import('./pages/mecanico/Mapa'));
const WorkshopTracking = lazy(() => import('./pages/oficina/Tracking'));

import WorkshopDashboard from './pages/oficina/Dashboard';
import WorkshopSearch from './pages/oficina/Search';
import WorkshopProfile from './pages/oficina/Profile';
import WorkshopServiceOrders from './pages/oficina/ServiceOrders';
import WorkshopCustomers from './pages/oficina/Customers';
import WorkshopMensagens from './pages/oficina/Mensagens';
import WorkshopNovaOficina from './pages/oficina/NovaOficina';

import AdminDashboard from './pages/admin/Dashboard';
import AdminApprovals from './pages/admin/Approvals';
import AdminMechanics from './pages/admin/Mechanics';
import AdminWorkshops from './pages/admin/Workshops';
import AdminJobs from './pages/admin/Jobs';
import AdminSettings from './pages/admin/Settings';
import AdminRepasses from './pages/admin/Repasses';
import AdminUserDetail from './pages/admin/UserDetail';
import AdminFinancial from './pages/admin/Financial';
import AdminLeads from './pages/admin/Leads';

function LazyFallback() {
  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 dark:bg-steel-900">
      <div className="flex items-center gap-3 text-steel-500">
        <div className="h-3 w-3 rounded-full bg-brand-500 animate-pulse-soft" />
        <span className="font-medium">Carregando mapa…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
    <UpdatePrompt />
    <Routes>
      {/* Público */}
      <Route path="/" element={<Landing />} />
      <Route path="/mecanico" element={<LandingMecanico />} />
      <Route path="/oficina" element={<LandingOficina />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro/mecanico" element={<SignupMechanic />} />
      <Route path="/cadastro/oficina" element={<SignupWorkshop />} />
      <Route path="/aguardando-aprovacao" element={<PendingApproval />} />
      <Route path="/termos"             element={<Terms />} />
      <Route path="/privacidade"        element={<Privacy />} />
      <Route path="/recuperar-senha"    element={<ForgotPassword />} />
      <Route path="/redefinir-senha"    element={<ResetPassword />} />

      {/* Mecânico */}
      <Route path="/mecanico/dashboard" element={<ProtectedRoute allow={['mechanic']}><MechanicDashboard /></ProtectedRoute>} />
      <Route path="/mecanico/job/:id" element={<ProtectedRoute allow={['mechanic']}><MechanicJob /></ProtectedRoute>} />
      <Route path="/mecanico/job/:id/tracking" element={<ProtectedRoute allow={['mechanic']}><Suspense fallback={<LazyFallback />}><MechanicTracking /></Suspense></ProtectedRoute>} />
      <Route path="/mecanico/perfil" element={<ProtectedRoute allow={['mechanic']}><MechanicProfile /></ProtectedRoute>} />
      <Route path="/mecanico/ganhos" element={<ProtectedRoute allow={['mechanic']}><MechanicGanhos /></ProtectedRoute>} />
      <Route path="/mecanico/mapa" element={<ProtectedRoute allow={['mechanic']}><Suspense fallback={<LazyFallback />}><MechanicMapa /></Suspense></ProtectedRoute>} />

      {/* Oficina */}
      <Route path="/oficina/dashboard" element={<ProtectedRoute allow={['workshop']}><WorkshopDashboard /></ProtectedRoute>} />
      <Route path="/oficina/os" element={<ProtectedRoute allow={['workshop']}><WorkshopServiceOrders /></ProtectedRoute>} />
      <Route path="/oficina/clientes" element={<ProtectedRoute allow={['workshop']}><WorkshopCustomers /></ProtectedRoute>} />
      <Route path="/oficina/buscar" element={<ProtectedRoute allow={['workshop']}><WorkshopSearch /></ProtectedRoute>} />
      <Route path="/oficina/job/:id/tracking" element={<ProtectedRoute allow={['workshop']}><Suspense fallback={<LazyFallback />}><WorkshopTracking /></Suspense></ProtectedRoute>} />
      <Route path="/oficina/mensagens" element={<ProtectedRoute allow={['workshop']}><WorkshopMensagens /></ProtectedRoute>} />
      <Route path="/oficina/perfil" element={<ProtectedRoute allow={['workshop']}><WorkshopProfile /></ProtectedRoute>} />
      <Route path="/oficina/nova"   element={<ProtectedRoute allow={['workshop']}><WorkshopNovaOficina /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/dashboard" element={<ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/aprovacoes" element={<ProtectedRoute allow={['admin']}><AdminApprovals /></ProtectedRoute>} />
      <Route path="/admin/mecanicos" element={<ProtectedRoute allow={['admin']}><AdminMechanics /></ProtectedRoute>} />
      <Route path="/admin/oficinas" element={<ProtectedRoute allow={['admin']}><AdminWorkshops /></ProtectedRoute>} />
      <Route path="/admin/usuario/:id"   element={<ProtectedRoute allow={['admin']}><AdminUserDetail /></ProtectedRoute>} />
      <Route path="/admin/jobs" element={<ProtectedRoute allow={['admin']}><AdminJobs /></ProtectedRoute>} />
      <Route path="/admin/repasses"      element={<ProtectedRoute allow={['admin']}><AdminRepasses /></ProtectedRoute>} />
      <Route path="/admin/financeiro"    element={<ProtectedRoute allow={['admin']}><AdminFinancial /></ProtectedRoute>} />
      <Route path="/admin/leads"         element={<ProtectedRoute allow={['admin']}><AdminLeads /></ProtectedRoute>} />
      <Route path="/admin/configuracoes" element={<ProtectedRoute allow={['admin']}><AdminSettings /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
