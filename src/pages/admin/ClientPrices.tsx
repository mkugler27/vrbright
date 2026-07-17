import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';

interface Client {
  id: string;
  name: string;
  type: 'commercial' | 'residential';
}

interface ClientService {
  id: string;
  description: string;
  unit_price: number;
  apply_quantity: boolean;
  proposals?: {
    number: string;
  };
}

interface AuditLog {
  id: string;
  action: string;
  changed_by: string;
  details: string;
  created_at: string;
}

export function ClientPrices() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [services, setServices] = useState<ClientService[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Drawer & Edit states
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  
  // Searches
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, type')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setClients(data || []);
      
      // Auto-select first client if available
      if (data && data.length > 0) {
        setSelectedClientId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  // Fetch services when selected client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchClientServices(selectedClientId);
    } else {
      setServices([]);
    }
  }, [selectedClientId]);

  const fetchClientServices = async (clientId: string) => {
    try {
      setLoadingServices(true);
      const { data, error } = await supabase
        .from('client_services')
        .select('*, proposals(number)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error('Error fetching client services:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  const fetchClientLogs = async (clientId: string) => {
    try {
      setLoadingLogs(true);
      const { data, error } = await supabase
        .from('client_service_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err) {
      console.error('Error fetching client logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Check scrollbar
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
  }, [services]);

  const handleOpenLogsDrawer = () => {
    if (!selectedClientId) return;
    fetchClientLogs(selectedClientId);
    setShowLogsDrawer(true);
  };

  const handleStartEdit = (service: ClientService) => {
    setEditingServiceId(service.id);
    setEditPrice(service.unit_price);
  };

  const handleSavePrice = async (service: ClientService) => {
    if (editPrice === service.unit_price) {
      setEditingServiceId(null);
      return;
    }

    try {
      setLoadingServices(true);
      // 1) Update service price in db
      const { error: updateError } = await supabase
        .from('client_services')
        .update({ unit_price: editPrice })
        .eq('id', service.id);

      if (updateError) throw updateError;

      // 2) Write audit log
      const { error: logError } = await supabase
        .from('client_service_logs')
        .insert({
          client_id: selectedClientId,
          client_service_id: service.id,
          action: 'update_price',
          changed_by: 'Admin', // Pull actual logged-in admin email/name in prod
          details: `Manual price change for "${service.description.replace(/<[^>]*>/g, '')}" from $${service.unit_price.toFixed(2)} to $${editPrice.toFixed(2)}`
        });

      if (logError) throw logError;

      // 3) Update local state
      setServices(prev =>
        prev.map(s => (s.id === service.id ? { ...s, unit_price: editPrice } : s))
      );
      setEditingServiceId(null);
    } catch (err) {
      console.error('Error updating client service price:', err);
      alert('Failed to update price.');
    } finally {
      setLoadingServices(false);
    }
  };

  const handleDeleteService = async (serviceId: string, desc: string) => {
    if (!window.confirm(`Are you sure you want to remove this contracted service from the client?`)) return;

    try {
      setLoadingServices(true);
      const { error: deleteError } = await supabase
        .from('client_services')
        .delete()
        .eq('id', serviceId);

      if (deleteError) throw deleteError;

      // Log deletion
      await supabase
        .from('client_service_logs')
        .insert({
          client_id: selectedClientId,
          action: 'delete_service',
          changed_by: 'Admin',
          details: `Removed contracted service: "${desc.replace(/<[^>]*>/g, '')}"`
        });

      setServices(prev => prev.filter(s => s.id !== serviceId));
    } catch (err) {
      console.error('Error removing client service:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  // Filter clients by search
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Filter services by search (by description text or proposal number)
  const filteredServices = services.filter((s) => {
    const term = serviceSearch.toLowerCase();
    const matchesDesc = s.description.toLowerCase().includes(term);
    const matchesProp = s.proposals?.number?.toLowerCase().includes(term) || false;
    return matchesDesc || matchesProp;
  });

  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <div className="flex flex-col h-full space-y-6 relative select-none text-left">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 bg-transparent">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Client Contracted Prices</h1>
          <p className="text-xs text-slate-500 font-medium">Manage approved proposal pricing templates and contract agreements by customer.</p>
        </div>
      </div>

      {/* DASHBOARD GRID SYSTEM */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0">
        
        {/* LEFT COLUMN: CLIENTS SEARCH LIST */}
        <div className="md:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-2xs p-5 flex flex-col min-h-0">
          <div className="space-y-3 shrink-0">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">Clients</h2>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search clients..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full border border-slate-200 focus:border-primary rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all font-semibold"
              />
            </div>
          </div>

          {/* Client Buttons Scroll area */}
          <div className="flex-1 overflow-y-auto mt-4 space-y-1.5 pr-1">
            {loadingClients ? (
              <div className="text-center py-8 text-xs text-slate-400 font-bold">Loading clients...</div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 font-bold">No clients found</div>
            ) : (
              filteredClients.map((c) => {
                const active = c.id === selectedClientId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`w-full p-3 border rounded-2xl text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      active
                        ? 'bg-primary/5 border-primary/20 text-slate-800 font-extrabold shadow-2xs'
                        : 'bg-white border-slate-150 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="text-xs font-extrabold truncate">{c.name}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{c.type}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CONTRACTED PRICING VIEW */}
        <div className="md:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-2xs flex flex-col min-h-0 overflow-hidden">
          {selectedClient ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header Info */}
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="text-left">
                  <h3 className="text-base font-black text-slate-800 tracking-tight">{selectedClient.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{selectedClient.type} client contract list</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Search box for services */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search services or proposal..."
                      value={serviceSearch}
                      onChange={e => setServiceSearch(e.target.value)}
                      className="border border-slate-200 focus:border-primary rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all w-48 sm:w-56 font-semibold"
                    />
                  </div>
                  {/* History Logs button */}
                  <button
                    onClick={handleOpenLogsDrawer}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-350 text-slate-700 text-xs font-bold rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>View History</span>
                  </button>
                </div>
              </div>

              {/* services table */}
              <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden min-h-0">
                <div className="flex-1 flex flex-col min-w-[700px] min-h-0">
                  {/* Table Header */}
                  <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
                    <div
                      className="grid grid-cols-12 text-xs font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
                      style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
                    >
                      <div className="col-span-6">Service / Description</div>
                      <div className="col-span-2 text-center">Origin Proposal</div>
                      <div className="col-span-2 text-right">Unit Price</div>
                      <div className="col-span-2 text-right">Actions</div>
                    </div>
                  </div>

                  {/* Table Body */}
                  <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-sm">
                    {loadingServices ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="w-8 h-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                        <span className="text-xs text-slate-400 font-bold">Loading services...</span>
                      </div>
                    ) : filteredServices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <svg className="w-10 h-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-xs font-extrabold text-slate-500">No approved pricing found</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Services appear here once a proposal is marked as "Approved".</p>
                      </div>
                    ) : (
                      filteredServices.map((s) => {
                        const isEditing = editingServiceId === s.id;
                        return (
                          <div key={s.id} className="grid grid-cols-12 items-center hover:bg-slate-50/40 transition-colors py-4 px-6 text-left">
                            {/* Description */}
                            <div className="col-span-6 pr-6 truncate text-xs font-extrabold text-slate-800">
                              <div
                                className="truncate"
                                dangerouslySetInnerHTML={{ __html: s.description }}
                              />
                            </div>

                            {/* Origin Proposal */}
                            <div className="col-span-2 text-center">
                              {s.proposals?.number ? (
                                <span className="inline-block px-2.5 py-0.5 border border-slate-100 rounded-md bg-slate-50 text-[10px] font-black text-slate-500">
                                  {s.proposals.number}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">Direct Entry</span>
                              )}
                            </div>

                            {/* Unit Price */}
                            <div className="col-span-2 text-right pr-4 font-extrabold text-slate-800">
                              {isEditing ? (
                                <div className="relative inline-block w-24">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                                  <input
                                    type="number"
                                    value={editPrice}
                                    onChange={e => setEditPrice(Number(e.target.value))}
                                    className="w-full border border-slate-200 focus:border-primary rounded-lg pl-5 pr-1.5 py-0.5 text-xs text-slate-700 text-right focus:outline-none bg-white font-extrabold"
                                  />
                                </div>
                              ) : (
                                <span>${s.unit_price.toFixed(2)}</span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSavePrice(s)}
                                    className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-lg cursor-pointer"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setEditingServiceId(null)}
                                    className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg cursor-pointer"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleStartEdit(s)}
                                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteService(s.id, s.description)}
                                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 py-20">
              <svg className="w-12 h-12 text-slate-200 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="text-sm font-extrabold text-slate-500">No client selected</p>
              <p className="text-xs text-slate-400 mt-0.5">Choose a client from the left panel list to view and manage approved pricing.</p>
            </div>
          )}
        </div>

      </div>

      {/* AUDIT LOG TIMELINE SIDE DRAWER */}
      {showLogsDrawer && selectedClient && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-45 transition-opacity"
            onClick={() => setShowLogsDrawer(false)}
          />

          {/* Drawer content */}
          <div className="fixed right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200/80 shadow-2xl z-50 flex flex-col animate-slideLeft">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Price Change Log</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{selectedClient.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLogsDrawer(false)}
                className="p-1.5 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Logs list body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-left">
              {loadingLogs ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-xs text-slate-400 font-bold">Loading history...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-8">No price logs registered for this client.</p>
              ) : (
                <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-6">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="relative space-y-1">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white bg-slate-400 ring-4 ring-white" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 border border-slate-200/50 rounded px-1.5 py-0.25 uppercase tracking-wider">
                          {log.action.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-extrabold text-slate-400">
                          {new Date(log.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })} {new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed">{log.details}</p>
                      <p className="text-[9px] font-bold text-slate-400">Changed by: {log.changed_by}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0 text-center">
              <button
                onClick={() => setShowLogsDrawer(false)}
                className="w-full py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Logs Panel
              </button>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
