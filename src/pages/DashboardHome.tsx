import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  defaultAnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOpenWOCount } from '../hooks/useOpenWOCount';
import { useUnreadCount } from '../context/UnreadContext';

interface ModuleCardData {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge?: number;
  badgeIcon?: React.ReactNode;
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
    to: '/adjustments', title: 'Adjustment', description: 'Request reimbursement',
    color: 'bg-amber-50 text-amber-600',
    icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" /></svg>,
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
const MOUNT_COUNT_KEY = 'vrbright_home_mounts';

function SortableModuleCard({ mod, onClick, visible, isDraggingThis }: { mod: ModuleCardData; onClick: () => void; visible: boolean; isDraggingThis: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: mod.to,
    animateLayoutChanges: (args) => {
      if (args.wasDragging) return false;
      return defaultAnimateLayoutChanges(args);
    },
  });

  // transform style on the BUTTON (for drag) — no animation conflict here
  const buttonStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDraggingThis ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={buttonStyle} className="touch-none select-none">
      <button
        onClick={(e) => {
          if (!isDraggingThis && visible) onClick();
          e.preventDefault();
        }}
        {...attributes}
        {...listeners}
        className={`relative w-full bg-white rounded-[24px] p-3.5 shadow-sm border text-left ${isDraggingThis ? 'opacity-90 shadow-2xl ring-2 ring-primary cursor-grabbing' : 'border-gray-100/50 active:scale-[0.97] cursor-grab hover:shadow-md'}`}
        style={{ pointerEvents: visible ? 'auto' : 'none' }}
      >
        {/* Cascade animation lives on inner content, not the dragged element */}
        <div
          className={visible ? 'animate-cascade-card' : 'opacity-0'}
          style={{ animationDelay: visible ? '0ms' : '0ms' }}
        >
          <div className={`w-11 h-11 rounded-2xl ${mod.color} flex items-center justify-center mb-2.5 pointer-events-none transition-transform ${isDraggingThis ? 'scale-110' : ''}`}>
            {mod.icon}
          </div>
          {mod.badgeIcon ? (
            <span className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center pointer-events-none">
              {mod.badgeIcon}
            </span>
          ) : mod.badge !== undefined && mod.badge !== 0 ? (
            <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center pointer-events-none shadow-sm">
              {mod.badge}
            </span>
          ) : null}
          <h3 className="font-semibold text-gray-800 text-sm leading-tight pointer-events-none">{mod.title}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 pointer-events-none">{mod.description}</p>
        </div>
      </button>
    </div>
  );
}

export function DashboardHome() {
  const navigate = useNavigate();
  const openWOCount = useOpenWOCount();
  const { count: unreadCount } = useUnreadCount();
  const [cards, setCards] = useState<ModuleCardData[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const order = JSON.parse(stored) as string[];
        const loadedCards = order
          .map((to) => DEFAULT_CARDS.find((c) => c.to === to))
          .filter(Boolean) as ModuleCardData[];

        // Append any new cards defined in DEFAULT_CARDS that aren't in the stored layout yet
        const missingCards = DEFAULT_CARDS.filter(
          (dc) => !loadedCards.some((lc) => lc.to === dc.to)
        );
        return [...loadedCards, ...missingCards];
      }
    } catch {
      // fall through
    }
    return DEFAULT_CARDS;
  });

  // Cascade: reveal cards one-by-one on subsequent home visits
  const [cascadeIndex, setCascadeIndex] = useState(-1);

  useEffect(() => {
    const raw = localStorage.getItem(MOUNT_COUNT_KEY);
    const count = raw ? parseInt(raw, 10) : 0;
    localStorage.setItem(MOUNT_COUNT_KEY, String(count + 1));
    if (count > 0) {
      setCascadeIndex(0);
    } else {
      setCascadeIndex(cards.length);
    }
  }, []);

  useEffect(() => {
    if (cascadeIndex < 0 || cascadeIndex >= cards.length) return;
    if (cascadeIndex === 0) {
      setCascadeIndex(1);
      return;
    }
    const timer = setTimeout(() => setCascadeIndex((i) => i + 1), 70);
    return () => clearTimeout(timer);
  }, [cascadeIndex, cards.length]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.map((c) => c.to)));
  }, [cards]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cards.findIndex((c) => c.to === active.id);
    const newIndex = cards.findIndex((c) => c.to === over.id);
    setCards(arrayMove(cards, oldIndex, newIndex));
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-0.5">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-4">Hold and drag to reorder</p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        autoScroll={false}
        modifiers={[restrictToWindowEdges]}
      >
        <SortableContext items={cards.map((c) => c.to)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 px-1 pb-4">
            {cards.map((mod, i) => {
              const isWOCard = mod.to === '/wo';
              const isChatCard = mod.to === '/chat';
              const enriched: ModuleCardData = isWOCard
                ? { ...mod, badge: openWOCount }
                : isChatCard && unreadCount > 0
                ? {
                    ...mod,
                    badgeIcon: (
                      <div className="relative inline-flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-sm animate-pulse-subtle">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      </div>
                    ),
                  }
                : mod;
              return (
                <SortableModuleCard
                  key={mod.to}
                  mod={enriched}
                  onClick={() => navigate(mod.to)}
                  visible={cascadeIndex < 0 || i < cascadeIndex}
                  isDraggingThis={activeId === mod.to}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}