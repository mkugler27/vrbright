import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

interface Template {
  id: string;
  title: string;
  active: boolean;
  items_count?: number;
}

export function AdminTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      // Fetch templates
      const { data: temps, error: tempErr } = await supabase
        .from('proposal_templates')
        .select('*')
        .order('title');

      if (tempErr) throw tempErr;

      // For each template, count items
      const updatedTemps = await Promise.all(
        (temps || []).map(async (t) => {
          const { count } = await supabase
            .from('proposal_template_items')
            .select('*', { count: 'exact', head: true })
            .eq('template_id', t.id);
          return {
            ...t,
            items_count: count || 0,
          };
        })
      );

      setTemplates(updatedTemps);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check scrollbar for alignments
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
  }, [templates]);

  const toggleTemplateActive = async (temp: Template) => {
    try {
      const nextActive = !temp.active;
      const { error } = await supabase
        .from('proposal_templates')
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', temp.id);

      if (error) throw error;

      setTemplates((prev) =>
        prev.map((t) => (t.id === temp.id ? { ...t, active: nextActive } : t))
      );
    } catch (err) {
      console.error('Error toggling template active status:', err);
    } finally {
      setActivePopoverId(null);
    }
  };

  const handleDeleteTemplate = async (tempId: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('proposal_templates')
        .delete()
        .eq('id', tempId);

      if (error) throw error;

      setTemplates((prev) => prev.filter((t) => t.id !== tempId));
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 relative select-none text-left">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 bg-transparent">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Proposal Templates</h1>
          <p className="text-xs text-slate-500 font-medium">Create standardized proposal baselines to speed up the bidding process.</p>
        </div>
        <button
          onClick={() => navigate('/admin/proposals/templates/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>NEW TEMPLATE</span>
        </button>
      </div>

      {/* TABLE VIEW CONTAINER */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-x-auto overflow-y-hidden flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-w-[700px] min-h-0">
          
          {/* Header Row */}
          <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
            <div
              className="grid grid-cols-12 text-xs font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
              style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
            >
              <div className="col-span-6">Template Title</div>
              <div className="col-span-2 text-center">Services Count</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
          </div>

          {/* Body Rows */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                <span className="text-xs text-slate-400 font-bold">Loading templates...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-sm font-bold text-slate-700">No templates found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">No matching proposal templates exist. Click "New Template" to get started.</p>
              </div>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="grid grid-cols-12 items-center hover:bg-slate-50/40 transition-colors py-4 px-6">
                  {/* Title */}
                  <div className="col-span-6 font-extrabold text-slate-800 truncate pr-6">{t.title}</div>
                  
                  {/* Services count */}
                  <div className="col-span-2 text-center font-bold text-slate-600">{t.items_count}</div>
                  
                  {/* Status Toggle */}
                  <div className="col-span-2 overflow-visible">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopoverId(activePopoverId === t.id ? null : t.id);
                        }}
                        className={`text-[11px] font-black px-2.5 py-0.5 rounded-md border cursor-pointer hover:shadow-xs transition-all flex items-center gap-1.5 ${
                          t.active
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50'
                            : 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200/50'
                        }`}
                      >
                        <span>{t.active ? 'Active' : 'Inactive'}</span>
                        <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {activePopoverId === t.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopoverId(null);
                            }}
                          />
                          <div className="absolute left-0 mt-1.5 w-32 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-slideDown text-left">
                            <p className="text-[9px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Status</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!t.active) {
                                  toggleTemplateActive(t);
                                } else {
                                  setActivePopoverId(null);
                                }
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Active</span>
                              </div>
                              {t.active && <span className="text-emerald-500 font-bold">✓</span>}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (t.active) {
                                  toggleTemplateActive(t);
                                } else {
                                  setActivePopoverId(null);
                                }
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span>Inactive</span>
                              </div>
                              {!t.active && <span className="text-slate-500 font-bold">✓</span>}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 text-right flex items-center justify-end gap-1">
                    <button
                      onClick={() => navigate(`/admin/proposals/templates/${t.id}/edit`)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
