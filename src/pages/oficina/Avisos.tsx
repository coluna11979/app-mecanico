import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { NotificationsPanel } from '@/components/NotificationsPanel';

export default function WorkshopAvisos() {
  return (
    <WorkshopLayout>
      <h1 className="text-3xl font-bold tracking-tight text-steel-900 mb-6">Avisos</h1>
      <div className="max-w-2xl">
        <NotificationsPanel />
      </div>
    </WorkshopLayout>
  );
}
