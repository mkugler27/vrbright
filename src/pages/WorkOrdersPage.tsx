import { useNavigate } from 'react-router-dom';
import { useWorkOrders } from '../hooks/useWorkOrders';
import { StatusBadge } from '../components/ui/StatusBadge';

export function WorkOrdersPage() {
  const { workOrders, loading, refresh } = useWorkOrders();
  const navigate = useNavigate();

  const today = new Date().toISOString().split('T')[0];
  const todayOrders = workOrders.filter(
    (wo) => wo.scheduled_date?.startsWith(today) || wo.status === 'in_progress'
  );
  const otherOrders = workOrders.filter(
    (wo) => !wo.scheduled_date?.startsWith(today) && wo.status !== 'in_progress'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Trabalhos do Dia</h2>
        <button
          onClick={refresh}
          className="text-primary-dark text-sm font-semibold active:scale-95 transition-transform"
        >
          Atualizar
        </button>
      </div>

      {todayOrders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-14 h-14 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Nenhum trabalho para hoje</p>
        </div>
      )}

      <div className="space-y-3">
        {todayOrders.map((wo) => (
          <button
            key={wo.id}
            onClick={() => navigate(`/wo/${wo.id}`)}
            className="w-full bg-white rounded-2xl p-4 shadow-md border border-gray-100/50 text-left active:scale-[0.98] transition-all duration-150 flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="font-semibold text-gray-800 text-sm truncate">{wo.title}</h3>
                <StatusBadge status={wo.status} />
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {wo.address} {wo.unit && `- ${wo.unit}`}
              </p>
              {!wo.synced && (
                <span className="inline-block mt-1.5 text-[11px] text-warning font-semibold">● Não sincronizado</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {otherOrders.length > 0 && (
        <>
          <h2 className="text-xl font-bold text-gray-800 pt-2">Outros</h2>
          <div className="space-y-3">
            {otherOrders.map((wo) => (
              <button
                key={wo.id}
                onClick={() => navigate(`/wo/${wo.id}`)}
                className="w-full bg-white rounded-2xl p-4 shadow-md border border-gray-100/50 text-left active:scale-[0.98] transition-all duration-150 flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-800 text-sm truncate">{wo.title}</h3>
                    <StatusBadge status={wo.status} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">{wo.address}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
