export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed';

export interface WorkOrder {
  id: string;
  bubble_id: string;
  codigo_id: string;
  title: string;
  description: string;
  status: WorkOrderStatus;
  address: string;
  unit: string;
  scheduled_date: string;
  tasks: WorkOrderTask[];
  notes: string;
  created_at: string;
  updated_at: string;
  synced: boolean;
  total_worker: number;
  invoice_code?: string;
}

export interface WorkOrderTask {
  id: string;
  description: string;
  completed: boolean;
}

export interface Photo {
  id: string;
  work_order_id: string;
  blob: Blob;
  thumbnail?: Blob;
  caption: string;
  taken_at: string;
  synced: boolean;
}

export type SyncAction =
  | 'update_status'
  | 'update_notes'
  | 'upload_photo'
  | 'complete_wo'
  | 'send_chat_file'
  | 'send_chat_file_delete'
  | 'send_chat_message'
  | 'create_conversation'
  | 'create_adjustment';

export interface SyncQueueItem {
  id: string;
  action: SyncAction;
  work_order_id?: string;     // required for WO actions, optional for chat files
  chat_file_id?: string;      // set when action === 'send_chat_file'
  adjustment_id?: string;     // set when action === 'create_adjustment'
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  created_at: string;
  last_attempt_at?: string;
  error?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  token: string;
}

// ──────────────────────────────────────────────
// CHAT MEDIA
// ──────────────────────────────────────────────

export type ChatFileType = 'image' | 'audio' | 'file';

export interface ChatFile {
  id: string;
  message_id: string;
  sender_id: string;
  bucket: string;
  storage_path: string;
  public_url: string;
  file_type: ChatFileType;
  mime_type: string;
  original_name?: string;
  file_size: number;
  bubble_id?: string;
  synced: boolean;
  created_at: string;
}

export interface PendingChatFile {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_email: string;
  blob: Blob;
  file_type: ChatFileType;
  mime_type: string;
  original_name?: string;
  file_size?: number;
  content?: string;
  created_at: string;
  codigo_WO?: string;
  tipo_foto?: 'repair' | 'damage' | 'splinkers' | 'extra';
}

export interface AdjustmentRequest {
  id: string;
  worker_email: string;
  date: string;
  description: string;
  value: number; // Value of the expense (overwritten by owner if adjusted)
  store: string;
  invoice_code: string; // The week/invoice code e.g. "25/26"
  image_url?: string; // Receipt uploaded by the worker
  paid: boolean; // Flag to indicate if payment was completed
  payment_receipt_url?: string; // Receipt uploaded by the owner (payment proof)
  bubble_id?: string;
  created_at: string;
  synced: boolean;
  local_image_blob?: Blob; // For offline storage and upload
}
