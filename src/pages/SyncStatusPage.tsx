import { useSync } from '../context/SyncContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Button } from '../components/ui/Button';
import { getDB } from '../services/db';

export function SyncStatusPage() {
  const { queue, isSyncing, triggerSync, refreshQueue } = useSync();
  const isOnline = useOnlineStatus();

  const handleClearAll = async () => {
    const db = await getDB();
    await db.clear('photos');
    await db.clear('syncQueue');
    await refreshQueue();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Sincronização</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-gray-500">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600">Itens na fila</span>
          <span className="text-lg font-semibold text-gray-800">{queue.length}</span>
        </div>
        <div className="space-y-2">
          <Button
            onClick={triggerSync}
            disabled={!isOnline || isSyncing || queue.length === 0}
            className="w-full"
            size="sm"
          >
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
          </Button>
          <Button variant="danger" size="sm" onClick={handleClearAll} className="w-full">
            Limpar fotos e fila
          </Button>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-600">Fila de envio</h3>
          {queue.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg p-3 border border-gray-100 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  {actionLabel(item.action)}
                </span>
                {item.attempts > 0 && (
                  <span className="text-xs text-warning">
                    Tentativa {item.attempts}/{item.max_attempts}
                  </span>
                )}
              </div>
              {item.error && (
                <p className="text-xs text-danger mt-1">{item.error}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.created_at).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}

      {queue.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>Tudo sincronizado</p>
        </div>
      )}
    </div>
  );
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    update_status: 'Atualizar status',
    update_notes: 'Atualizar observações',
    upload_photo: 'Enviar foto',
    complete_wo: 'Finalizar WO',
  };
  return labels[action] || action;
}
