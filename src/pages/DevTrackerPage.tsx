import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../services/supabase';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { CustomDropdown } from '../components/ui/CustomDropdown';

interface DevTask {
  id: string;
  created_at: string;
  author_name: string;
  author_email: string;
  description: string;
  category: 'bug' | 'change' | 'observation' | 'roadmap_feedback';
  delivery_week: number | null;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

const CATEGORY_CONFIG = {
  bug: { label: 'Bug', bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  change: { label: 'Change Request', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  observation: { label: 'Observation', bg: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  roadmap_feedback: { label: 'Roadmap Feedback', bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
};

const STATUS_CONFIG = {
  waiting: { label: 'Aguardando', bg: 'bg-slate-100 text-slate-500 border-slate-200/60' },
  started: { label: 'Iniciado', bg: 'bg-blue-50 text-blue-600 border-blue-100' },
  completed: { label: 'Finalizado', bg: 'bg-green-50 text-green-600 border-green-100' },
};

const ROADMAP_WEEKS = [
  { week: 1, title: 'W1-W2: Base Supabase & Cadastros' },
  { week: 3, title: 'W3-W4: Propostas & Impressão' },
  { week: 5, title: 'W5-W6: Calendário & WOs' },
  { week: 7, title: 'W7: Admin Worklist' },
  { week: 8, title: 'W8: Homologação do Worker App' },
  { week: 9, title: 'W9: Módulo do Supervisor' },
  { week: 10, title: 'W10: Folha de Pagamento' },
  { week: 11, title: 'W11: Módulo Financeiro' },
  { week: 12, title: 'W12: Integração Telegram' },
  { week: 13, title: 'W13-W14: Migração Bubble & Go-Live' },
];

const ROADMAP_DELIVERIES_DETAIL = [
  {
    milestone: 'Entrega 1',
    weeks: 'Semanas 1 e 2',
    title: 'Estruturação no Supabase & Cadastros Base',
    focus: 'Consolidar as tabelas no Supabase (Clientes, Usuários, Preços, Templates) e conectar o fluxo de Ajustes do pintor.',
    components: ['AdminClients.tsx', 'ClientPrices.tsx', 'AdminUsers.tsx', 'AdminTemplates.tsx', 'AdjustmentPage.tsx'],
    deliverables: [
      'Modelagem de banco e dados seed de teste',
      'CRUD administrativo básico rodando no Supabase',
      'Worker solicitando reajuste e gravando na tabela do Supabase'
    ]
  },
  {
    milestone: 'Entrega 2',
    weeks: 'Semanas 3 e 4',
    title: 'Elaboração e Geração de Propostas (Proposals)',
    focus: 'Ciclo comercial de orçamentos e layouts de impressão/PDF integrados ao Supabase.',
    components: ['AdminProposals.tsx', 'ProposalForm.tsx', 'ProposalPrint.tsx'],
    deliverables: [
      'Interface para criação de propostas com preços automáticos do cliente',
      'Template de PDF/Impressão premium de proposta com separador de milhares',
      'Gerenciador de status do fluxo comercial'
    ]
  },
  {
    milestone: 'Entrega 3',
    weeks: 'Semanas 5 e 6',
    title: 'Calendário e Criação/Distribuição de WOs (AdminCalendar)',
    focus: 'Central de alocação de serviços e agendamentos diretos via calendário.',
    components: ['AdminCalendar.tsx'],
    deliverables: [
      'Painel de agendamento mensal e semanal',
      'Suporte para 3 regras de negócios: Normal WO, Extension Job e Complaint (retrabalho)',
      'Interface de distribuição e escala de pintores'
    ]
  },
  {
    milestone: 'Entrega 4',
    weeks: 'Semana 7',
    title: 'Worklist Administrativo (AdminWorklist)',
    focus: 'Painel backoffice centralizado para controle de status e acompanhamento de equipes em tempo real.',
    components: ['AdminWorklist.tsx'],
    deliverables: [
      'Tabela de triagem de WOs com filtros por cliente, pintor e status',
      'Ações de reatribuição e atualização de prioridades em tempo real'
    ]
  },
  {
    milestone: 'Entrega 5',
    weeks: 'Semana 8',
    title: 'Homologação do Worker App (WOs, Chat e Offline)',
    focus: 'Homologar o fluxo das páginas de campo já estruturadas com a sincronia de rede offline (IndexedDB).',
    components: ['WOPage.tsx', 'ChatPage.tsx', 'db.ts', 'syncQueue.ts'],
    deliverables: [
      'Execução de serviço offline-first e fila de sincronização',
      'Chat interno e upload de mídias usando Supabase Storage',
      'Polimento de usabilidade de campo'
    ]
  },
  {
    milestone: 'Entrega 6',
    weeks: 'Semana 9',
    title: 'Portal do Supervisor (App do Worker)',
    focus: 'Módulo de vistoria técnica e aprovação de serviços em campo para supervisores.',
    components: ['Supervisor routes', '/supervisors'],
    deliverables: [
      'Visão geral das ordens prontas para vistoria',
      'Funcionalidade de aprovação de fechamento ou devolução de retrabalho com anotações'
    ]
  },
  {
    milestone: 'Entrega 7',
    weeks: 'Semana 10',
    title: 'Fechamento de Medições e Folha de Pagamento',
    focus: 'Agregação de serviços fechados e cálculo de taxas operacionais dos prestadores.',
    components: ['Payroll dashboards', 'worker values calculation'],
    deliverables: [
      'Cálculo automático de repasse (total_GERAL_WORKER) por WO aprovada',
      'Geração de extratos consolidados de pagamento fechados'
    ]
  },
  {
    milestone: 'Entrega 8',
    weeks: 'Semana 11',
    title: 'Módulo Financeiro Administrativo (AdminFinance)',
    focus: 'Módulo financeiro centralizado conectando faturamento bruto a repasses.',
    components: ['AdminFinance.tsx'],
    deliverables: [
      'Gestão de Contas a Receber (Propostas e WOs finalizadas)',
      'Gestão de Contas a Pagar (Folhas de repasses fechados)',
      'Indicadores de faturamento e fluxo de caixa operacional'
    ]
  },
  {
    milestone: 'Entrega 9',
    weeks: 'Semana 12',
    title: 'Módulo de Integração com o Telegram',
    focus: 'Automação de avisos instantâneos e agilidade na comunicação.',
    components: ['Telegram service integration'],
    deliverables: [
      'Envio automático de alertas de novas WOs e pedidos de retoque para os pintores',
      'Notificações críticas para administradores (novas propostas aceitas, atrasos)'
    ]
  },
  {
    milestone: 'Entrega 10',
    weeks: 'Semanas 13 e 14',
    title: 'Importação de Dados do Bubble & Go-Live (Supabase)',
    focus: 'Migração da base de dados legado de produção do Bubble e go-live final.',
    components: ['AdminDashboard.tsx', 'ETL migration scripts'],
    deliverables: [
      'Carga histórica e migração higienizada dos dados do Bubble para o Supabase',
      'Dashboard com indicadores analíticos e performance consolidada',
      'Configurações de segurança e políticas RLS de produção no Supabase'
    ]
  }
];

export function DevTrackerPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Tab State: 'feedbacks' or 'roadmap'
  const [activeTab, setActiveTab] = useState<'roadmap' | 'feedbacks'>('roadmap');

  // Roadmap Statuses state (persisted in localStorage)
  const [roadmapStatuses, setRoadmapStatuses] = useState<Record<string, 'waiting' | 'started' | 'completed'>>(() => {
    try {
      const stored = localStorage.getItem('vrbright_roadmap_statuses');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    // Default initial statuses
    return {
      'Entrega 1': 'started'
    };
  });

  // Form State
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DevTask['category']>('observation');
  const [deliveryWeek, setDeliveryWeek] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Custom Dropdowns open state
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const weekRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
      if (weekRef.current && !weekRef.current.contains(e.target as Node)) {
        setWeekDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const { data, error } = await supabase
        .from('dev_tracker')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'P0001' || error.message.includes('does not exist')) {
          console.warn("Table dev_tracker does not exist. Using fallback mock data.");
          setTasks(getMockTasks());
        } else {
          throw error;
        }
      } else {
        setTasks(data || []);
      }
    } catch (err: any) {
      console.error("Error loading dev tracker:", err);
      setErrorMsg(err.message || 'Error connecting to database');
      setTasks(getMockTasks());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleToggleComplete = async (taskId: string, currentCompleted: boolean) => {
    const newCompleted = !currentCompleted;
    
    // Update local state instantly (Optimistic UI)
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          completed: newCompleted,
          completed_by: newCompleted ? (user?.nome || 'Dev') : null,
          completed_at: newCompleted ? new Date().toISOString() : null
        };
      }
      return t;
    }));

    try {
      const { error } = await supabase
        .from('dev_tracker')
        .update({
          completed: newCompleted,
          completed_by: newCompleted ? (user?.nome || 'Dev') : null,
          completed_at: newCompleted ? new Date().toISOString() : null
        })
        .eq('id', taskId);

      if (error) throw error;
    } catch (err) {
      console.error("Failed to update status on Supabase, reverting:", err);
      fetchTasks();
    }
  };

  const handleStatusChange = (milestone: string, newStatus: 'waiting' | 'started' | 'completed') => {
    const updated = { ...roadmapStatuses, [milestone]: newStatus };
    setRoadmapStatuses(updated);
    localStorage.setItem('vrbright_roadmap_statuses', JSON.stringify(updated));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    const newTaskPayload = {
      author_name: user?.nome || 'Anonymous',
      author_email: user?.email || 'anonymous@vrbright.com',
      description,
      category,
      delivery_week: deliveryWeek,
      completed: false,
    };

    try {
      const { data, error } = await supabase
        .from('dev_tracker')
        .insert([newTaskPayload])
        .select();

      if (error) {
        if (error.message.includes('does not exist')) {
          const tempTask: DevTask = {
            id: Math.random().toString(),
            created_at: new Date().toISOString(),
            completed_by: null,
            completed_at: null,
            ...newTaskPayload
          };
          setTasks(prev => [tempTask, ...prev]);
          setDescription('');
        } else {
          throw error;
        }
      } else {
        if (data && data[0]) {
          setTasks(prev => [data[0], ...prev]);
        } else {
          fetchTasks();
        }
        setDescription('');
      }
    } catch (err: any) {
      console.error("Error creating dev task:", err);
      alert("Error saving: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  function getMockTasks(): DevTask[] {
    return [
      {
        id: '1',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        author_name: 'Admin',
        author_email: 'admin@vrbright.com',
        description: 'Verify column types for client_prices on Supabase',
        category: 'observation',
        delivery_week: 1,
        completed: true,
        completed_by: 'Dev',
        completed_at: new Date().toISOString(),
      },
      {
        id: '2',
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        author_name: 'Pintor João',
        author_email: 'joao@vrbright.com',
        description: 'Need to show visual warning when photos fail to upload offline',
        category: 'bug',
        delivery_week: 8,
        completed: false,
        completed_by: null,
        completed_at: null,
      },
      {
        id: '3',
        created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
        author_name: 'Supervisor Carlos',
        author_email: 'carlos@vrbright.com',
        description: 'Add clear filters for active proposals on proposals list page',
        category: 'change',
        delivery_week: 4,
        completed: false,
        completed_by: null,
        completed_at: null,
      }
    ];
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-primary inline-block"></span>
            Módulo DEV
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Espaço de desenvolvimento: Acompanhamento detalhado do escopo e canal de feedbacks.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {isOnline ? 'Banco de Dados Conectado' : 'Modo Offline Ativo'}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-gray-200 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('roadmap')}
          className={`px-5 py-3 text-sm font-black transition-all border-b-2 rounded-t-xl ${
            activeTab === 'roadmap'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          🗺️ Escopo do Roadmap (14 Semanas)
        </button>
        <button
          onClick={() => setActiveTab('feedbacks')}
          className={`px-5 py-3 text-sm font-black transition-all border-b-2 rounded-t-xl ${
            activeTab === 'feedbacks'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          💬 Quadro de Feedbacks ({tasks.length})
        </button>
      </div>

      {/* ROADMAP TAB */}
      {activeTab === 'roadmap' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-black text-slate-800 mb-2">Visão Geral do Planejamento</h2>
            <p className="text-sm text-slate-500">
              O projeto está estruturado em 10 entregas progressivas rodando integralmente no Supabase. Modifique o status de cada entrega diretamente no dropdown de cada card abaixo.
            </p>
          </div>

          <div className="grid gap-6">
            {ROADMAP_DELIVERIES_DETAIL.map((delivery) => {
              const currentStatus = roadmapStatuses[delivery.milestone] || 'waiting';
              const statusConf = STATUS_CONFIG[currentStatus];

              return (
                <div 
                  key={delivery.milestone} 
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  {/* Header line decoration */}
                  <div className="absolute top-0 left-0 w-2.5 h-full bg-primary" />

                  <div className="pl-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="bg-primary/10 text-primary-dark font-black text-xs px-2.5 py-1 rounded-md border border-primary/20">
                          {delivery.milestone}
                        </span>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                          {delivery.weeks}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConf.bg}`}>
                          {statusConf.label}
                        </span>
                      </div>
                      
                      {/* Custom Dropdown to Change Status */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                        <CustomDropdown
                          value={currentStatus}
                          options={[
                            { label: 'Aguardando', value: 'waiting' },
                            { label: 'Iniciado', value: 'started' },
                            { label: 'Finalizado', value: 'completed' },
                          ]}
                          onChange={(val) => handleStatusChange(delivery.milestone, val as any)}
                          className="w-40"
                        />
                      </div>
                    </div>

                    <h3 className="text-base font-black text-slate-800 mb-2">{delivery.title}</h3>
                    <p className="text-sm text-slate-600 mb-4">{delivery.focus}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Componentes Associados</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {delivery.components.map(comp => (
                            <span key={comp} className="text-xs font-bold text-slate-600 bg-slate-100/80 px-2 py-1 rounded-lg">
                              {comp}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Entregáveis Chave</h4>
                        <ul className="space-y-1.5 text-xs text-slate-600">
                          {delivery.deliverables.map(deliv => (
                            <li key={deliv} className="flex items-start gap-2">
                              <span className="text-primary mt-0.5 font-bold">✔</span>
                              <span>{deliv}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FEEDBACKS TAB */}
      {activeTab === 'feedbacks' && (
        <div className="space-y-6 animate-fadeIn">
          {/* SQL Warning Alert */}
          {!loading && tasks.length > 0 && tasks[0].id.includes('.') && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Tabela do Supabase não encontrada!
              </p>
              {errorMsg && <p className="mb-2 text-xs text-amber-700 bg-amber-100/50 p-2 rounded-lg border border-amber-200/40">Erro original: {errorMsg}</p>}
              Os dados abaixo são de demonstração temporária (Mock). Para habilitar a gravação real no banco de dados, execute a query SQL abaixo no seu Console do Supabase:
              <pre className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs mt-2 overflow-x-auto select-all">
{`create table dev_tracker (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  author_name text not null,
  author_email text not null,
  description text not null,
  category text not null check (category in ('bug', 'change', 'observation', 'roadmap_feedback')),
  delivery_week integer,
  completed boolean default false not null,
  completed_by text,
  completed_at timestamp with time zone
);`}
              </pre>
            </div>
          )}

          {/* New Suggestion/Bug Form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Adicionar Observação / Relatar Bug</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Descrição</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Digite a alteração, bug, ideia ou observação..."
                  className="w-full min-h-[100px] p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm resize-y"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category Custom Popover Dropdown */}
                <div ref={catRef} className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</label>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCatDropdownOpen(!catDropdownOpen);
                      setWeekDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 border border-gray-150 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_CONFIG[category].dot}`} />
                      <span>{CATEGORY_CONFIG[category].label}</span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${catDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {catDropdownOpen && (
                    <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-slideDown p-1.5">
                      {(Object.keys(CATEGORY_CONFIG) as DevTask['category'][]).map(catKey => (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => {
                            setCategory(catKey);
                            setCatDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-colors ${
                            category === catKey ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_CONFIG[catKey].dot}`} />
                          <span className="flex-1">{CATEGORY_CONFIG[catKey].label}</span>
                          {category === catKey && (
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delivery Week Custom Popover Dropdown */}
                <div ref={weekRef} className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Semana do Roadmap (Opcional)</label>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWeekDropdownOpen(!weekDropdownOpen);
                      setCatDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 border border-gray-150 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  >
                    <span>
                      {deliveryWeek ? `Semana ${deliveryWeek} - ${ROADMAP_WEEKS.find(w => w.week === deliveryWeek)?.title.split(': ')[1]}` : 'Sem vínculo de semana'}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${weekDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {weekDropdownOpen && (
                    <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-slideDown p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryWeek(null);
                          setWeekDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-colors ${
                          deliveryWeek === null ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Sem vínculo
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                      <div className="max-h-56 overflow-y-auto">
                        {ROADMAP_WEEKS.map(weekObj => (
                          <button
                            key={weekObj.week}
                            type="button"
                            onClick={() => {
                              setDeliveryWeek(weekObj.week);
                              setWeekDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-colors ${
                              deliveryWeek === weekObj.week ? 'bg-primary/10 text-primary-dark' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate">{weekObj.title}</span>
                            {deliveryWeek === weekObj.week && (
                              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting ? 'Salvando...' : 'Adicionar Relato'}
                </Button>
              </div>
            </form>
          </div>

          {/* Task List */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Histórico de Alterações e Feedbacks</h2>
            
            {loading ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm text-gray-400">
                <svg className="w-8 h-8 animate-spin mx-auto text-primary mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Carregando itens...
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm text-gray-500 text-sm">
                Nenhum feedback registrado ainda.
              </div>
            ) : (
              <div className="grid gap-4">
                {tasks.map(task => {
                  const catConf = CATEGORY_CONFIG[task.category];
                  const weekLabel = task.delivery_week 
                    ? ROADMAP_WEEKS.find(w => w.week === task.delivery_week)?.title.split(': ')[0]
                    : null;
                  
                  return (
                    <div
                      key={task.id}
                      className={`bg-white rounded-2xl border p-5 shadow-sm transition-all duration-200 ${
                        task.completed ? 'border-green-100 bg-green-50/10' : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-3 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${catConf.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${catConf.dot}`} />
                              {catConf.label}
                            </span>
                            
                            {weekLabel && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                {weekLabel}
                              </span>
                            )}
                            
                            {task.completed ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Concluído
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                Pendente
                              </span>
                            )}
                          </div>

                          <p className={`text-sm text-gray-800 break-words ${task.completed ? 'line-through text-gray-400' : ''}`}>
                            {task.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                            <span>Por: <strong className="text-gray-600 font-semibold">{task.author_name}</strong> ({task.author_email})</span>
                            <span>•</span>
                            <span>{new Date(task.created_at).toLocaleDateString()} às {new Date(task.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          
                          {task.completed && task.completed_by && (
                            <div className="text-[11px] text-green-600 bg-green-50/50 p-2 rounded-lg inline-block border border-green-100/50">
                              Resolvido por <strong>{task.completed_by}</strong> em {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : ''}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                          <Switch
                            checked={task.completed}
                            onChange={() => handleToggleComplete(task.id, task.completed)}
                            label={task.completed ? 'Concluído' : 'Marcar Concluído'}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
