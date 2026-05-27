import type { WorkOrderStatus } from '../../types';

const statusConfig: Record<WorkOrderStatus, { label: string; color: string }> = {
  pending: { label: 'Não Iniciado', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'Em Andamento', color: 'bg-blue-50 text-blue-600' },
  completed: { label: 'Concluído', color: 'bg-green-50 text-green-600' },
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${config.color}`}>
      {config.label}
    </span>
  );
}
