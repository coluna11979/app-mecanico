export type Role = 'mechanic' | 'workshop' | 'admin';
export type ProfileStatus = 'pending' | 'under_review' | 'approved' | 'rejected';
export type JobStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'disputed' | 'cancelled';
export type TxStatus = 'held' | 'released' | 'refunded';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
  admin_notes: string | null;
  last_seen_at: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalMessage {
  id: string;
  profile_id: string;
  sender_id: string;
  sender_role: 'admin' | 'user';
  kind: 'request_documents' | 'reply' | 'note' | 'status_change';
  content: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  resolved_by_message_id: string | null;
  created_at: string;
}

export interface Workshop {
  id: string;
  profile_id: string;
  business_name: string;
  cnpj: string;
  address: string;
  number: string | null;
  neighborhood: string | null;
  cep: string | null;
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
  pix_key: string | null;
  cep: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  work_reference: string | null;
  // Programa de embaixador
  is_embaixador: boolean;
  codigo_indicacao: string | null;
  embaixador_desde: string | null;
  embaixador_ate: string | null;
  indicado_por: string | null;
}

export interface ComissaoEmbaixador {
  id: string;
  embaixador_id: string;
  indicado_id: string;
  job_id: string;
  bruto: number;
  platform_fee: number;
  comissao: number;
  criado_em: string;
  pago_em: string | null;
  pago_valor: number | null;
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
  /** Quando o mecânico aceitou (preenchido por trigger no banco) */
  accepted_at?: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  arrived_at: string | null;
  pix_paid_at: string | null;
  workshop_confirmed_at: string | null;
  repasse_pago_at: string | null;
  repasse_valor: number | null;
  mechanic_rating: number | null;
  mechanic_rating_note: string | null;
  workshop_rating: number | null;
  workshop_rating_note: string | null;
  cancelled_at: string | null;
  cancelled_by: 'workshop' | 'mechanic' | 'admin' | null;
  cancellation_reason: string | null;
  cancellation_fee: number | null;
  cancellation_refund: number | null;
  stripe_refund_id: string | null;
  audience: 'public' | 'favorites';
  created_at: string;
}

export interface WorkshopFavoriteMechanic {
  workshop_id: string;
  mechanic_id: string;
  added_at: string;
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

/** Aberta → Aguardando aprovação → Aprovada → Em andamento → Concluída (ou Cancelada) */
export type OsStatus = 'open' | 'awaiting_approval' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

export interface Customer {
  id: string;
  workshop_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  address: string | null;
  city: string | null;
  birth_date: string | null;
  created_at: string;
  /** LGPD: cliente pediu para não receber contato */
  contact_opt_out?: boolean;
  last_contacted_at?: string | null;
  /** Observações internas (só a oficina vê) */
  notes?: string | null;
  source?: string | null;
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
  scheduled_at: string | null;
  estimated_hours: number | null;
  notes: string | null;
  km_reading: number | null;
  parts_cost: number | null;
  labor_cost: number | null;
  /** Número sequencial por oficina (OS nº 0001). Preenchido por trigger. */
  number: number | null;
  discount: number;
  /** 'declined' = orçamento que o cliente não aprovou (status fica 'cancelled') */
  quote_status?: 'declined' | null;
  /** 'app' | 'paper_import' */
  source?: string;
  /** Orçamento enviado ao cliente para aprovação */
  approval_requested_at?: string | null;
  /** Cliente aprovou o orçamento */
  approved_at?: string | null;
  /** Como o cliente aprovou: whatsapp | telefone | presencial */
  approval_channel?: string | null;
  /** Retorno/garantia: OS original que "voltou" */
  rework_of_id?: string | null;
  /** execution | diagnosis contam contra o mecânico; part | customer | other não */
  rework_cause?: ReworkCause | null;
  /** Mecânico responsável pelo serviço original (preenchido por trigger) */
  rework_mechanic_id?: string | null;
  rework_notes?: string | null;
  /** Caixa: quanto já foi recebido, desconto dado no balcão e quando foi quitada */
  paid_amount?: number;
  counter_discount?: number;
  paid_at?: string | null;
}

export type ReworkCause = 'execution' | 'diagnosis' | 'part' | 'customer' | 'other';

export type OsItemKind = 'part' | 'labor';

/** Item da OS — peça ou serviço. Totais da OS são recalculados por trigger. */
export interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  workshop_id: string;
  kind: OsItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  /** Custo de compra no momento (só peças; null = não informado) */
  unit_cost?: number | null;
  /** Peça do cadastro de onde veio */
  part_id?: string | null;
  /** Quem fez este item (comissão); null = responsável da OS */
  workshop_mechanic_id?: string | null;
  position: number;
  created_at: string;
}

/** Dados lidos pela IA na foto de um orçamento em papel (formato da Edge Function read-paper-quote) */
export interface PaperQuoteExtracted {
  legivel: boolean;
  cliente: { nome: string | null; telefone: string | null; cpf: string | null; endereco: string | null };
  veiculo: { marca: string | null; modelo: string | null; placa: string | null; ano: number | null; cor: string | null; km: number | null };
  data: string | null;
  numero_documento: string | null;
  servico_resumo: string | null;
  observacoes: string | null;
  /** Serviços recomendados para o futuro (base do módulo de reativação) */
  recomendacoes?: string[];
  itens: { tipo: OsItemKind; descricao: string; quantidade: number; valor_unitario: number | null; valor_total_item?: number | null }[];
  desconto: number | null;
  total: number | null;
  campos_incertos: string[];
}

export type PaperImportStatus = 'pending' | 'processing' | 'extracted' | 'confirmed' | 'failed' | 'discarded';

export interface PaperImport {
  id: string;
  workshop_id: string;
  image_path: string;
  status: PaperImportStatus;
  extracted: PaperQuoteExtracted | null;
  error: string | null;
  service_order_id: string | null;
  customer_id: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_by: string | null;
  created_at: string;
  processed_at: string | null;
  confirmed_at: string | null;
}

/** Pausa no serviço (ex.: aguardando peça). ended_at null = pausa em andamento */
export interface ServiceOrderPause {
  id: string;
  service_order_id: string;
  workshop_id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

/** Serviço recomendado para o futuro ("avaliar bieletas na próxima revisão") */
export interface ServiceRecommendation {
  id: string;
  workshop_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_order_id: string | null;
  description: string;
  status: 'pending' | 'done' | 'dismissed';
  source: string;
  recommended_at: string;
  created_at: string;
}

export interface WorkshopMechanic {
  id: string;
  workshop_id: string;
  name: string;
  specialty: string | null;
  skills: string[];
  active: boolean;
  created_at: string;
  /** Comissão: % sobre a mão de obra das OS concluídas por ele */
  commission_percent?: number;
  /** % sobre as peças dos itens que ele fez */
  commission_parts_percent?: number;
  /** % sobre o faturamento total da loja (ex.: gerente) */
  commission_revenue_percent?: number;
  photo_url?: string | null;
  phone?: string | null;
  /** Função: mecânico, eletricista, auxiliar… */
  role_title?: string | null;
  employment_type?: EmploymentType | null;
  hired_at?: string | null;
  work_schedule?: string | null;
  status?: TeamStatus;
  terminated_at?: string | null;
  cnh_category?: string | null;
  cnh_expires_at?: string | null;
  notes?: string | null;
}

export type EmploymentType = 'clt' | 'pj' | 'autonomo' | 'comissionado';
export type TeamStatus = 'active' | 'away' | 'terminated';

/** Dados sensíveis do colaborador (LGPD) — só o dono da oficina acessa */
export interface MechanicPrivate {
  mechanic_id: string;
  workshop_id: string;
  cpf: string | null;
  rg: string | null;
  birth_date: string | null;
  email: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  salary: number | null;
  pix_key: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
}

export interface MechanicCertification {
  id: string;
  mechanic_id: string;
  workshop_id: string;
  name: string;
  issued_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface MechanicDocument {
  id: string;
  mechanic_id: string;
  workshop_id: string;
  kind: string;
  file_path: string;
  file_name: string | null;
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

export type WorkshopRole = 'owner' | 'manager' | 'staff';

export interface WorkshopMember {
  id: string;
  workshop_id: string;
  profile_id: string;
  role: WorkshopRole;
  created_at: string;
}
