export type Role = 'mechanic' | 'workshop' | 'admin';
export type ProfileStatus = 'pending' | 'approved' | 'rejected';
export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'disputed' | 'cancelled';
export type TxStatus = 'held' | 'released' | 'refunded';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface Workshop {
  id: string;
  profile_id: string;
  business_name: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  logo_url: string | null;
  rating: number;
  total_jobs: number;
}

export interface Mechanic {
  id: string;
  profile_id: string;
  cpf: string;
  cnh: string | null;
  skills: string[];
  experience_years: number;
  hourly_rate: number;
  rating: number;
  total_jobs: number;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_location_update: string | null;
}

export interface Job {
  id: string;
  workshop_id: string;
  mechanic_id: string | null;
  title: string;
  description: string;
  status: JobStatus;
  price: number;
  price_per_hour: number;
  max_hours: number;
  actual_hours: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  arrived_at: string | null;
  pix_paid_at: string | null;
  workshop_confirmed_at: string | null;
  mechanic_rating: number | null;
  mechanic_rating_note: string | null;
  workshop_rating: number | null;
  workshop_rating_note: string | null;
  created_at: string;
}

export interface JobLocation {
  id: string;
  job_id: string;
  mechanic_id: string;
  lat: number;
  lng: number;
  recorded_at: string;
}

export interface Transaction {
  id: string;
  job_id: string;
  amount: number;
  platform_fee: number;
  mechanic_amount: number;
  status: TxStatus;
  pix_key: string | null;
  paid_at: string | null;
  released_at: string | null;
}

export interface AppSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type OsStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface Customer {
  id: string;
  workshop_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  workshop_id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  notes: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  workshop_id: string;
  vehicle_id: string | null;
  customer_id: string | null;
  workshop_mechanic_id: string | null;
  title: string;
  description: string | null;
  mechanic_name: string | null;
  category: string | null;
  status: OsStatus;
  price: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkshopMechanic {
  id: string;
  workshop_id: string;
  name: string;
  specialty: string | null;
  skills: string[];
  active: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  job_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
}
