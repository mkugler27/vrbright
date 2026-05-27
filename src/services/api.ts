import type { WorkOrder } from '../types';

const API_BASE_URL = import.meta.env.VITE_BUBBLE_API_URL || 'https://system.vrbrightpainting.com/version-test/api/1.1';
const API_KEY = import.meta.env.VITE_BUBBLE_API_KEY || '';
const WORKER_ID = '1681158121564x251998441125205630';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function fetchWorkOrders(): Promise<WorkOrder[]> {
  const constraints = JSON.stringify([
    { key: 'status', constraint_type: 'not equal', value: 'COMPLETED' },
    { key: 'liberado_para_pintor', constraint_type: 'equals', value: true },
    { key: 'qual_pintor', constraint_type: 'equals', value: WORKER_ID },
  ]);

  const params = new URLSearchParams({ constraints });
  const data = await request<{ response: { results: Record<string, unknown>[] } }>(
    `/obj/WORKING ORDERS?${params}`
  );

  console.log('Raw Bubble data:', data);
  return data.response.results.map(mapBubbleToWorkOrder);
}

function mapBubbleToWorkOrder(raw: Record<string, unknown>): WorkOrder {
  return {
    id: raw._id as string,
    bubble_id: raw._id as string,
    codigo_id: String(raw['codigo_id'] || ''),
    title: `WO #${raw['codigo_id']}` || 'Work Order',
    description: (raw['notes_extra'] as string) || '',
    status: mapStatus(raw['status'] as string),
    address: (raw['qual_condo_txt'] as string) || '',
    unit: (raw['apt'] as string) || '',
    scheduled_date: (raw['data'] as string) || '',
    tasks: [],
    notes: (raw['notes_extra'] as string) || '',
    created_at: (raw['Created Date'] as string) || '',
    updated_at: (raw['Modified Date'] as string) || '',
    synced: true,
    total_worker: (raw['total_GERAL_WORKER'] as number) || 0,
  };
}

function mapStatus(bubbleStatus: string): WorkOrder['status'] {
  const normalized = (bubbleStatus || '').toUpperCase();
  if (normalized === 'IN PROGRESS') return 'in_progress';
  if (normalized === 'COMPLETED') return 'completed';
  return 'pending';
}

export async function fetchWorkerName(): Promise<string> {
  const constraints = JSON.stringify([
    { key: 'Email', constraint_type: 'equals', value: 'admin@uatsbuddy.com' },
  ]);
  const params = new URLSearchParams({ constraints });
  const data = await request<{ response: { results: Record<string, unknown>[] } }>(
    `/obj/user?${params}`
  );
  const user = data.response.results[0];
  if (!user) return 'Worker';
  return (user['Nome'] as string) || 'Worker';
}

export async function updateWorkOrderStatus(
  workOrderId: string,
  status: string,
): Promise<void> {
  await request(`/obj/WORKING ORDERS/${workOrderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateWorkOrderNotes(
  workOrderId: string,
  notes: string,
): Promise<void> {
  await request(`/obj/WORKING ORDERS/${workOrderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes_extra: notes }),
  });
}

export async function uploadPhoto(
  codigoId: string,
  photoBlob: Blob,
): Promise<void> {
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(photoBlob);
  });

  const formData = new FormData();
  formData.append('codigo', codigoId);
  formData.append('photo', base64);

  const response = await fetch('https://vrbcrmsystem.bubbleapps.io/version-test/api/1.1/wf/upload_photo', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer 9d461f01be8bc85cf85ae4aad0dc5a07`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload Error: ${response.status} - ${text}`);
  }
}

export async function completeWorkOrder(
  workOrderId: string,
  notes: string
): Promise<void> {
  await request(`/obj/WORKING ORDERS/${workOrderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'COMPLETED', notes_extra: notes }),
  });
}
