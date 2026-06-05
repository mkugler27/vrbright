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

export interface SyncQueueItem {
  id: string;
  action: 'update_status' | 'update_notes' | 'upload_photo' | 'complete_wo';
  work_order_id: string;
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
