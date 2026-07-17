import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

interface Proposal {
  id: string;
  number: string;
  number_seq: number;
  client_id: string;
  client_type: 'commercial' | 'residential';
  type: 'price_list' | 'custom';
  title: string;
  status: 'pending' | 'approved' | 'declined';
  total_value: number;
  created_by: string;
  created_at: string;
  clients?: {
    name: string;
  };
}

export function AdminProposals() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  // Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterType, setFilterType] = useState<'custom' | 'price_list' | ''>('');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'declined' | ''>('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proposals')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProposals(data || []);
    } catch (err) {
      console.error('Error fetching proposals:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check scrollbar for column alignment
  useEffect(() => {
    const checkScrollbar = () => {
      if (scrollContainerRef.current) {
        const hasScroll = scrollContainerRef.current.scrollHeight > scrollContainerRef.current.clientHeight;
        setHasScrollbar(hasScroll);
      }
    };
    checkScrollbar();
    window.addEventListener('resize', checkScrollbar);
    return () => window.removeEventListener('resize', checkScrollbar);
  }, [proposals]);

  const handleStatusChange = async (proposalId: string, newStatus: 'pending' | 'approved' | 'declined') => {
    try {
      // Find the proposal
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) return;

      // Update proposal status
      const { error: updateError } = await supabase
        .from('proposals')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', proposalId);

      if (updateError) throw updateError;

      // If approved, trigger client services population
      if (newStatus === 'approved') {
        // 1) Fetch proposal items
        const { data: items, error: itemsError } = await supabase
          .from('proposal_items')
          .select('*')
          .eq('proposal_id', proposalId);

        if (itemsError) throw itemsError;

        if (items && items.length > 0) {
          // 2) Prepare records to insert into client_services
          const servicesToInsert = items.map(item => ({
            client_id: proposal.client_id,
            proposal_id: proposalId,
            service_id: item.service_id,
            description: item.description,
            unit_price: item.unit_price,
            apply_quantity: item.apply_quantity
          }));

          // Remove old client services linked to this proposal (safety check)
          await supabase
            .from('client_services')
            .delete()
            .eq('proposal_id', proposalId);

          // Insert new ones
          const { error: insertError } = await supabase
            .from('client_services')
            .insert(servicesToInsert);

          if (insertError) throw insertError;

          // Write audit log
          await supabase
            .from('client_service_logs')
            .insert({
              client_id: proposal.client_id,
              action: 'proposal_approved',
              changed_by: 'Admin', // In real app, pull user name from auth context
              details: `Approved Proposal ${proposal.number} adding ${items.length} contracted services`
            });
        }
      } else {
        // If changed to pending or declined, remove corresponding client_services
        await supabase
          .from('client_services')
          .delete()
          .eq('proposal_id', proposalId);
      }

      setProposals(prev =>
        prev.map(p => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
    } catch (err) {
      console.error('Error changing proposal status:', err);
    } finally {
      setActivePopoverId(null);
    }
  };

  // Filter Logic
  const filteredProposals = proposals.filter((p) => {
    // Start date filter
    if (filterStartDate) {
      const pDate = new Date(p.created_at);
      const sDate = new Date(filterStartDate);
      if (pDate < sDate) return false;
    }
    // End date filter
    if (filterEndDate) {
      const pDate = new Date(p.created_at);
      const eDate = new Date(filterEndDate);
      // Set end date to end of the day
      eDate.setHours(23, 59, 59, 999);
      if (pDate > eDate) return false;
    }
    // Title filter
    if (filterTitle && !p.title.toLowerCase().includes(filterTitle.toLowerCase()) && !p.number.toLowerCase().includes(filterTitle.toLowerCase())) {
      return false;
    }
    // Type filter
    if (filterType && p.type !== filterType) {
      return false;
    }
    // Status filter
    if (filterStatus && p.status !== filterStatus) {
      return false;
    }
    return true;
  });

  const clearAllFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterTitle('');
    setFilterType('');
    setFilterStatus('');
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      case 'declined':
        return 'text-rose-700 bg-rose-50 border-rose-100';
      default:
        return 'text-amber-700 bg-amber-50 border-amber-100';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 relative select-none text-left">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 bg-transparent">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Proposals</h1>
          <p className="text-xs text-slate-500 font-medium">Create and manage estimations, track contract status, and generate custom client PDFs.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold rounded-2xl shadow-2xs hover:shadow-xs active:scale-98 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            <span>Filters</span>
            {filteredProposals.length !== proposals.length && (
              <span className="w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            onClick={() => navigate('/admin/proposals/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>NEW PROPOSAL</span>
          </button>
        </div>
      </div>

      {/* TABLE VIEW CONTAINER */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-x-auto overflow-y-hidden flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-w-[950px] min-h-0">
          
          {/* Header Row */}
          <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
            <div
              className="grid grid-cols-12 text-xs font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
              style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
            >
              <div className="col-span-1">ID#</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-2">Title</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1">Created by</div>
              <div className="col-span-1">Value</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
          </div>

          {/* Body Rows */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                <span className="text-xs text-slate-400 font-bold">Loading proposals...</span>
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-bold text-slate-700">No proposals found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">No matching proposals exist. Create a new proposal or adjust your active filters.</p>
              </div>
            ) : (
              filteredProposals.map((p) => (
                <div key={p.id} className="grid grid-cols-12 items-center hover:bg-slate-50/40 transition-colors py-4 px-6">
                  {/* ID */}
                  <div className="col-span-1 font-bold text-slate-800">{p.number}</div>
                  
                  {/* Date */}
                  <div className="col-span-1 text-slate-500 font-medium">{new Date(p.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</div>
                  
                  {/* Customer */}
                  <div className="col-span-3 min-w-0 pr-4">
                    <p className="font-extrabold text-slate-800 truncate">{p.clients?.name || 'Unknown Client'}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.client_type}</p>
                  </div>
                  
                  {/* Title */}
                  <div className="col-span-2 text-slate-700 font-semibold truncate pr-4">{p.title || '—'}</div>
                  
                  {/* Type */}
                  <div className="col-span-1">
                    <span className={`inline-block border text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      p.type === 'price_list' ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-purple-700 bg-purple-50 border-purple-100'
                    }`}>
                      {p.type === 'price_list' ? 'Price List' : 'Custom'}
                    </span>
                  </div>
                  
                  {/* Created by */}
                  <div className="col-span-1 text-slate-500 font-medium truncate pr-2">{p.created_by.split('@')[0]}</div>
                  
                  {/* Value */}
                  <div className="col-span-1 font-extrabold text-slate-800">${p.total_value.toFixed(2)}</div>
                  
                  {/* Status */}
                  <div className="col-span-1 overflow-visible">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopoverId(activePopoverId === p.id ? null : p.id);
                        }}
                        className={`text-[11px] font-black px-2.5 py-0.5 rounded-md border cursor-pointer hover:shadow-xs transition-all flex items-center gap-1.5 ${getStatusBadgeColor(p.status)}`}
                      >
                        <span className="capitalize">{p.status}</span>
                        <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {activePopoverId === p.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopoverId(null);
                            }}
                          />
                          <div className="absolute left-0 mt-1.5 w-32 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-slideDown text-left">
                            <p className="text-[9px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Set Status</p>
                            {(['pending', 'approved', 'declined'] as const).map((statusVal) => (
                              <button
                                key={statusVal}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (p.status !== statusVal) {
                                    handleStatusChange(p.id, statusVal);
                                  } else {
                                    setActivePopoverId(null);
                                  }
                                }}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    statusVal === 'approved' ? 'bg-emerald-500' : statusVal === 'declined' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`} />
                                  <span className="capitalize">{statusVal}</span>
                                </div>
                                {p.status === statusVal && <span className="text-primary font-bold">✓</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => navigate(`/admin/proposals/${p.id}/edit`)}
                      className="p-1.5 hover:bg-slate-100 text-slate-650 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => window.open(`/admin/proposals/${p.id}/print`, '_blank')}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0a2.25 2.25 0 01-2.25 2.25H8.59a2.25 2.25 0 01-2.25-2.25M16.5 13.5v-2.25A2.25 2.25 0 0014.25 9h-4.5A2.25 2.25 0 007.5 11.25V13.5m9 0h-9m10.125-3.375a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>

      {/* FILTERS SIDE DRAWER */}
      <div
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 transition-opacity duration-300 ${
          showFilters ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setShowFilters(false)}
      />
      
      <div className={`fixed right-0 top-0 bottom-0 bg-white border-l border-slate-200/80 shadow-2xl z-50 flex flex-col transition-all duration-300 ease-in-out ${
        showFilters ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
      } overflow-hidden`}>
        <div className="w-80 h-full flex flex-col shrink-0">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              <h3 className="font-extrabold text-slate-800 text-base">Filters</h3>
            </div>
            <button
              onClick={() => setShowFilters(false)}
              className="p-1.5 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-650 rounded-xl cursor-pointer transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Filter Fields Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Start Date */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Start date</label>
                {filterStartDate && (
                  <button onClick={() => setFilterStartDate('')} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/40 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none bg-white transition-all"
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">End date</label>
                {filterEndDate && (
                  <button onClick={() => setFilterEndDate('')} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/40 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none bg-white transition-all"
              />
            </div>

            {/* Title / ID# Search */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Title / ID#</label>
                {filterTitle && (
                  <button onClick={() => setFilterTitle('')} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Search by title or code..."
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value)}
                className="w-full border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary/40 rounded-xl px-3.5 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all"
              />
            </div>

            {/* Type Pills */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Type</label>
                {filterType && (
                  <button onClick={() => setFilterType('')} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => setFilterType(filterType === 'custom' ? '' : 'custom')}
                  className={`py-1.5 rounded-lg text-xs font-bold text-center cursor-pointer transition-all ${
                    filterType === 'custom'
                      ? 'bg-white text-slate-800 shadow-xs font-extrabold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Custom
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType(filterType === 'price_list' ? '' : 'price_list')}
                  className={`py-1.5 rounded-lg text-xs font-bold text-center cursor-pointer transition-all ${
                    filterType === 'price_list'
                      ? 'bg-white text-slate-800 shadow-xs font-extrabold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Price List
                </button>
              </div>
            </div>

            {/* Status Pills */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Status</label>
                {filterStatus && (
                  <button onClick={() => setFilterStatus('')} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {(['pending', 'approved', 'declined'] as const).map((st) => {
                  const active = filterStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStatus(active ? '' : st)}
                      className={`w-full py-2.5 px-4 border rounded-xl text-left text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        active
                          ? 'bg-primary/5 border-primary/20 text-slate-800 font-black shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Clear All Footer */}
          <div className="p-6 border-t border-slate-100 bg-slate-50">
            <button
              onClick={clearAllFilters}
              className="w-full py-3 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7C4.68 9.547 4.632 10.768 4.632 12c0 1.232.047 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.092-1.209.138-2.43.138-3.662z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10.5l3 3m0 0l3-3m-3 3v-6" />
              </svg>
              <span>CLEAR FILTER</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
