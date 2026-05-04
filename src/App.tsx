import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';

import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import SignupMechanic from './pages/public/SignupMechanic';
import SignupWorkshop from './pages/public/SignupWorkshop';
import PendingApproval from './pages/public/PendingApproval';

import MechanicDashboard from './pages/mecanico/Dashboard';
import MechanicJob from './pages/mecanico/JobDetail';
import MechanicTracking from './pages/mecanico/Tracking';
import MechanicProfile from './pages/mecanico/Profile';

import WorkshopDashboard from './pages/oficina/Dashboard';
import WorkshopSearch from './pages/oficina/Search';
import WorkshopTracking from './pages/oficina/Tracking';
import WorkshopProfile from './pages/oficina/Profile';
import WorkshopServiceOrders from './pages/oficina/ServiceOrders';
import WorkshopCustomers from './pages/oficina/Customers';

import AdminDashboard from './pages/admin/Dashboard';
import AdminApprovals from './pages/admin/Approvals';
import AdminMechanics from './pages/admin/Mechanics';
import AdminWorkshops from './pages/admin/Workshops';
import AdminJobs from './pages/admin/Jobs';
import AdminSettings from './pages/admin/Settings';

export default function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro/mecanico" element={<SignupMechanic />} />
      <Route path="/cadastro/oficina" element={<SignupWorkshop />} />
      <Route path="/aguardando-aprovacao" element={<PendingApproval />} />

      {/* Mecânico */}
      <Route path="/mecanico/dashboard" element={<ProtectedRoute allow={['mechanic']}><MechanicDashboard /></ProtectedRoute>} />
      <Route path="/mecanico/job/:id" element={<ProtectedRoute allow={['mechanic']}><MechanicJob /></ProtectedRoute>} />
      <Route path="/mecanico/job/:id/tracking" element={<ProtectedRoute allow={['mechanic']}><MechanicTracking /></ProtectedRoute>} />
      <Route path="/mecanico/perfil" element={<ProtectedRoute allow={['mechanic']}><MechanicProfile /></ProtectedRoute>} />

      {/* Oficina */}
      <Route path="/oficina/dashboard" element={<ProtectedRoute allow={['workshop']}><WorkshopDashboard /></ProtectedRoute>} />
      <Route path="/oficina/os" element={<ProtectedRoute allow={['workshop']}><WorkshopServiceOrders /></ProtectedRoute>} />
      <Route path="/oficina/clientes" element={<ProtectedRoute allow={['workshop']}><WorkshopCustomers /></ProtectedRoute>} />
      <Route path="/oficina/buscar" element={<ProtectedRoute allow={['workshop']}><WorkshopSearch /></ProtectedRoute>} />
      <Route path="/oficina/job/:id/tracking" element={<ProtectedRoute allow={['workshop']}><WorkshopTracking /></ProtectedRoute>} />
      <Route path="/oficina/perfil" element={<ProtectedRoute allow={['workshop']}><WorkshopProfile /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/dashboard" element={<ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/aprovacoes" element={<ProtectedRoute allow={['admin']}><AdminApprovals /></ProtectedRoute>} />
      <Route path="/admin/mecanicos" element={<ProtectedRoute allow={['admin']}><AdminMechanics /></ProtectedRoute>} />
      <Route path="/admin/oficinas" element={<ProtectedRoute allow={['admin']}><AdminWorkshops /></ProtectedRoute>} />
      <Route path="/admin/jobs" element={<ProtectedRoute allow={['admin']}><AdminJobs /></ProtectedRoute>} />
      <Route path="/admin/configuracoes" element={<ProtectedRoute allow={['admin']}><AdminSettings /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
