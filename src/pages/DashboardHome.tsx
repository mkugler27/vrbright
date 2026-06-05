import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  defaultAnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ModuleCardData {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const DEFAULT_CARDS: ModuleCardData[] = [
  {
    to: '/wo', title: 'Working Orders', description: "Today's jobs",
    color: 'bg-primary/10 text-primary-dark',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  },
  {
    to: '/chat', title: 'Chat', description: 'Messages & groups',
    color: 'bg-blue-50 text-blue-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
  },
  {
    to: '/finance', title: 'Finance', description: 'Earnings & pending',
    color: 'bg-green-50 text-green-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    to: '/team', title: 'Team', description: 'All workers',
    color: 'bg-purple-50 text-purple-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  },
  {
    to: '/clients', title: 'Clients', description: 'Condominiums',
    color: 'bg-orange-50 text-orange-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  },
  {
    to: '/pre-proposal', title: 'Pre-Proposal', description: 'Quotes & estimates',
    color: 'bg-yellow-50 text-yellow-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    to: '/supervisors', title: 'Supervisors', description: 'Inspections',
    color: 'bg-pink-50 text-pink-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  },
];

const STORAGE_KEY = 'vrbright_home_order';

function SortableModuleCard({ mod, onClick }: { mod: ModuleCardData; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mod.to,
    animateLayoutChanges: (args) => {
      // Animate when items swap positions (not just on drag)
      if (args.isSorting || args.wasDragging) {
        return defaultAnimateLayoutChanges(args);
      }
      return true;
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : (transition || 'transform 250ms cubic-bezier(0.2, 0, 0, 1)'),
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        if (!isDragging) onClick();
        e.preventDefault();
      }}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-[28px] p-4 shadow-sm border text-left touch-none select-none ${
        isDragging
          ? 'opacity-90 shadow-2xl ring-2 ring-primary cursor-grabbing'
          : 'border-gray-100/50 active:scale-[0.97] cursor-grab hover:shadow-md'
      }`}
    >
      <div className={`w-12 h-12 rounded-2xl ${mod.color} flex items-center justify-center mb-3 pointer-events-none transition-transform ${isDragging ? 'scale-110' : ''}`}>
        {mod.icon}
      </div>
      <h3 className="font-semibold text-gray-800 text-sm pointer-events-none">{mod.title}</h3>
      <p className="text-xs text-gray-500 mt-0.5 pointer-events-none">{mod.description}</p>
    </button>
  );
}

export function DashboardHome() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ModuleCardData[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const order = JSON.parse(stored) as string[];
        // Reorder DEFAULT_CARDS based on stored order
        return order
          .map((to) => DEFAULT_CARDS.find((c) => c.to === to))
          .filter(Boolean) as ModuleCardData[];
      }
    } catch {
      // fall through
    }
    return DEFAULT_CARDS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.map((c) => c.to)));
  }, [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cards.findIndex((c) => c.to === active.id);
    const newIndex = cards.findIndex((c) => c.to === over.id);
    setCards(arrayMove(cards, oldIndex, newIndex));
  };

  return (
    <div className="p-5">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-5">Hold and drag to reorder</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.to)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((mod) => (
              <SortableModuleCard
                key={mod.to}
                mod={mod}
                onClick={() => navigate(mod.to)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}