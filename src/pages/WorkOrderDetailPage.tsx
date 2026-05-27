import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { WorkOrder, Photo, WorkOrderStatus, SyncQueueItem } from '../types';
import { getWorkOrder, saveWorkOrder, getPhotosByWorkOrder, savePhoto, addToSyncQueue, deletePhoto } from '../services/db';
import { updateWorkOrderStatus, updateWorkOrderNotes, uploadPhoto } from '../services/api';
import { compressImage, createThumbnail } from '../services/imageCompressor';
import { Button } from '../components/ui/Button';
import { useSync } from '../context/SyncContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const STATUS_OPTIONS: { value: WorkOrderStatus; label: string; bubbleValue: string }[] = [
  { value: 'pending', label: 'Não Iniciado', bubbleValue: 'NOT STARTED' },
  { value: 'in_progress', label: 'Em Andamento', bubbleValue: 'IN PROGRESS' },
  { value: 'completed', label: 'Concluído', bubbleValue: 'COMPLETED' },
];

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshQueue, isSyncing } = useSync();
  const isOnline = useOnlineStatus();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const order = await getWorkOrder(id);
    if (order) {
      setWo(order);
      setNotes(order.notes || '');
    }
    const pics = await getPhotosByWorkOrder(id);
    setPhotos(pics);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isSyncing) loadData();
  }, [isSyncing, loadData]);

  const handleStatusChange = async (newStatus: WorkOrderStatus) => {
    if (!wo || newStatus === wo.status) return;

    const bubbleStatus = STATUS_OPTIONS.find((s) => s.value === newStatus)!.bubbleValue;
    const updated: WorkOrder = { ...wo, status: newStatus, updated_at: new Date().toISOString(), synced: false };
    await saveWorkOrder(updated);
    setWo(updated);

    if (isOnline) {
      try {
        await updateWorkOrderStatus(wo.bubble_id, bubbleStatus);
        await saveWorkOrder({ ...updated, synced: true });
        setWo({ ...updated, synced: true });
      } catch (err) {
        console.error('Failed to update status:', err);
        const syncItem: SyncQueueItem = {
          id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          action: 'update_status',
          work_order_id: wo.id,
          payload: { status: bubbleStatus },
          attempts: 0,
          max_attempts: 5,
          created_at: new Date().toISOString(),
        };
        await addToSyncQueue(syncItem);
        await refreshQueue();
      }
    } else {
      const syncItem: SyncQueueItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        action: 'update_status',
        work_order_id: wo.id,
        payload: { status: bubbleStatus },
        attempts: 0,
        max_attempts: 5,
        created_at: new Date().toISOString(),
      };
      await addToSyncQueue(syncItem);
      await refreshQueue();
    }
  };

  const handleSaveNotes = async () => {
    if (!wo) return;
    setSaving(true);

    const updated: WorkOrder = { ...wo, notes, updated_at: new Date().toISOString(), synced: false };
    await saveWorkOrder(updated);
    setWo(updated);

    if (isOnline) {
      try {
        await updateWorkOrderNotes(wo.bubble_id, notes);
        await saveWorkOrder({ ...updated, synced: true });
        setWo({ ...updated, synced: true });
      } catch (err) {
        console.error('Failed to update notes:', err);
        const syncItem: SyncQueueItem = {
          id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          action: 'update_notes',
          work_order_id: wo.id,
          payload: { notes },
          attempts: 0,
          max_attempts: 5,
          created_at: new Date().toISOString(),
        };
        await addToSyncQueue(syncItem);
        await refreshQueue();
      }
    } else {
      const syncItem: SyncQueueItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        action: 'update_notes',
        work_order_id: wo.id,
        payload: { notes },
        attempts: 0,
        max_attempts: 5,
        created_at: new Date().toISOString(),
      };
      await addToSyncQueue(syncItem);
      await refreshQueue();
    }

    setSaving(false);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !id || !wo) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        const thumbnail = await createThumbnail(file);

        const photo: Photo = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          work_order_id: id,
          blob: compressed,
          thumbnail,
          caption: '',
          taken_at: new Date().toISOString(),
          synced: false,
        };

        await savePhoto(photo);

        if (isOnline) {
          try {
            await uploadPhoto(wo.codigo_id, compressed);
            photo.synced = true;
            await savePhoto(photo);
          } catch (err) {
            console.error('Failed to upload photo:', err);
            const syncItem: SyncQueueItem = {
              id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              action: 'upload_photo',
              work_order_id: id,
              payload: { photo_id: photo.id },
              attempts: 0,
              max_attempts: 5,
              created_at: new Date().toISOString(),
            };
            await addToSyncQueue(syncItem);
          }
        } else {
          const syncItem: SyncQueueItem = {
            id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            action: 'upload_photo',
            work_order_id: id,
            payload: { photo_id: photo.id },
            attempts: 0,
            max_attempts: 5,
            created_at: new Date().toISOString(),
          };
          await addToSyncQueue(syncItem);
        }
      }

      await refreshQueue();
      await loadData();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="p-4 text-center text-gray-500">
        Work Order não encontrada
      </div>
    );
  }

  return (
    <div className="p-5 pb-8 space-y-5">
      <button onClick={() => navigate('/')} className="text-primary-dark text-sm font-semibold flex items-center gap-1 active:scale-95 transition-transform">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </button>

      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100/50">
        <h2 className="text-lg font-bold text-gray-800 mb-1">{wo.title}</h2>
        <p className="text-sm text-gray-500 flex items-center gap-1.5 mb-3">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {wo.address} {wo.unit && `- ${wo.unit}`}
        </p>
        {wo.total_worker > 0 && (
          <p className="text-sm text-gray-600">Valor: <span className="font-semibold text-gray-800">${wo.total_worker}</span></p>
        )}
        {!wo.synced && (
          <span className="inline-block mt-2 text-[11px] text-warning font-semibold">● Pendente de sincronização</span>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100/50">
        <h3 className="font-semibold text-gray-800 mb-3">Status</h3>
        <select
          value={wo.status}
          onChange={(e) => handleStatusChange(e.target.value as WorkOrderStatus)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100/50">
        <h3 className="font-semibold text-gray-800 mb-3">Observações</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Adicione observações sobre o trabalho..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
        />
        {notes !== (wo.notes || '') && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveNotes}
            disabled={saving}
            className="mt-3"
          >
            {saving ? 'Salvando...' : 'Salvar Observações'}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100/50">
        <h3 className="font-semibold text-gray-800 mb-3">Fotos</h3>
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm">
              <img
                src={URL.createObjectURL(photo.thumbnail || photo.blob)}
                alt={photo.caption || 'Foto do trabalho'}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 flex items-center gap-1">
                {photo.synced ? (
                  <div className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="bg-warning text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
                <span className="bg-black/50 backdrop-blur text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                  {(photo.blob.size / 1024).toFixed(0)}KB
                </span>
              </div>
              <button
                onClick={async () => {
                  await deletePhoto(photo.id);
                  await loadData();
                }}
                className="absolute top-1 right-1 bg-black/50 backdrop-blur text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 cursor-pointer active:bg-gray-50 transition-colors">
          <svg className="w-5 h-5 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-600">
            {uploading ? 'Processando...' : 'Tirar Foto'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handlePhotoCapture}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
