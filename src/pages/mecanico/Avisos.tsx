import MechanicLayout from '@/components/layout/MechanicLayout';
import { NotificationsPanel } from '@/components/NotificationsPanel';

export default function MechanicAvisos() {
  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold text-white">Avisos</h1>
        <NotificationsPanel dark />
      </div>
    </MechanicLayout>
  );
}
