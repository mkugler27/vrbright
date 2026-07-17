import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';

interface DetailTemplate {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export function AdminDetails() {
  const [templates, setTemplates] = useState<DetailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Drawer states
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proposal_details_templates')
        .select('*')
        .order('title');

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching details templates:', err);
    } finally {
      setLoading(false);
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
  }, [templates]);

  const handleOpenNew = () => {
    setEditingId(null);
    setTitleInput('');
    setContentInput('');
    setShowDrawer(true);
  };

  const handleOpenEdit = (temp: DetailTemplate) => {
    setEditingId(temp.id);
    setTitleInput(temp.title);
    setContentInput(temp.content);
    setShowDrawer(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !contentInput.trim()) {
      alert('Title and Content are required.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        title: titleInput.trim(),
        content: contentInput.trim(),
      };

      if (editingId) {
        // Update
        const { error } = await supabase
          .from('proposal_details_templates')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('proposal_details_templates')
          .insert(payload);

        if (error) throw error;
      }

      setShowDrawer(false);
      fetchTemplates();
    } catch (err) {
      console.error('Error saving template:', err);
      alert('Failed to save template.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tempId: string, tempTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete details block "${tempTitle}"?`)) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('proposal_details_templates')
        .delete()
        .eq('id', tempId);

      if (error) throw error;
      setTemplates((prev) => prev.filter((t) => t.id !== tempId));
    } catch (err) {
      console.error('Error deleting details template:', err);
      alert('Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full space-y-6 relative text-left">
      {/* HEADER SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 bg-transparent">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Proposal Details</h1>
          <p className="text-xs text-slate-500 font-medium">Manage reusable detail paragraphs and standard terms attached to proposals.</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>NEW DETAIL BLOCK</span>
        </button>
      </div>

      {/* FILTER SEARCH BAR */}
      <div className="shrink-0 bg-white rounded-3xl p-5 border border-slate-100 shadow-2xs space-y-4">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search details templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-200 focus:border-primary rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all font-semibold"
          />
        </div>
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
              <div className="col-span-3">Title</div>
              <div className="col-span-7">Content / Text Preview</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
          </div>

          {/* Body Rows */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                <span className="text-xs text-slate-400 font-bold">Loading details...</span>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <p className="text-sm font-bold text-slate-700">No details templates found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">No matching details exist. Click "New Detail Block" to create one.</p>
              </div>
            ) : (
              filteredTemplates.map((t) => (
                <div key={t.id} className="grid grid-cols-12 items-center hover:bg-slate-50/40 transition-colors py-4 px-6 text-left">
                  {/* Title */}
                  <div className="col-span-3 font-extrabold text-slate-800 truncate pr-6 uppercase tracking-wider text-xs">{t.title}</div>
                  
                  {/* Content snippet */}
                  <div className="col-span-7 text-xs text-slate-500 font-medium truncate pr-8 leading-relaxed">
                    {t.content}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 text-right flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(t)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.title)}
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

      {/* SMOOTH COLLAPSE / EXPAND SIDE DRAWER */}
      <div
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 transition-opacity duration-300 ${
          showDrawer ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setShowDrawer(false)}
      />

      <div className={`fixed right-0 top-0 bottom-0 bg-white border-l border-slate-200/80 shadow-2xl z-50 flex flex-col transition-all duration-350 ease-in-out ${
        showDrawer ? 'w-96 opacity-100' : 'w-0 opacity-0 pointer-events-none'
      } overflow-hidden`}>
        <div className="w-96 h-full flex flex-col shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                {editingId ? 'Edit Detail Block' : 'New Detail Block'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Define reusable details</p>
            </div>
            <button
              onClick={() => setShowDrawer(false)}
              className="p-1.5 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-650 rounded-xl cursor-pointer transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Detail Block Title</label>
                <input
                  type="text"
                  placeholder="e.g. PAYMENT TERMS"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full border border-slate-200 focus:border-primary rounded-xl px-3.5 py-2 text-sm text-slate-700 focus:outline-none bg-white transition-all font-semibold"
                />
              </div>

              {/* Content */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Content Text</label>
                <textarea
                  placeholder="Enter content details paragraph..."
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                  className="w-full border border-slate-200 focus:border-primary rounded-xl p-3.5 text-sm text-slate-700 focus:outline-none bg-white transition-all h-60 resize-none font-medium leading-relaxed"
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all cursor-pointer"
              >
                Save Template
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}
