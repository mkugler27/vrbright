import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { CompositeServicesView } from './CompositeServicesView';

type CatalogTab = 'composite' | 'types' | 'sizes' | 'services' | 'jobs' | 'type_lists';

interface CatalogItem {
  id: string;
  description: string;
  deleted: boolean;
  created_at: string;
}

const TABS: { key: CatalogTab; label: string; singular: string; tableName: string; placeholder: string }[] = [
  {
    key: 'composite',
    label: 'Composite Services',
    singular: 'Composite Service',
    tableName: 'price_list_items',
    placeholder: 'Search by composite description...',
  },
  {
    key: 'types',
    label: 'Types',
    singular: 'Type',
    tableName: 'price_list_types',
    placeholder: 'e.g. Standard, Premium, Custom',
  },
  {
    key: 'sizes',
    label: 'Sizes',
    singular: 'Size',
    tableName: 'price_list_sizes',
    placeholder: 'e.g. Small, Medium, Large, 10x10',
  },
  {
    key: 'services',
    label: 'Services',
    singular: 'Service',
    tableName: 'price_list_services',
    placeholder: 'e.g. Painting, Cleaning, Repair',
  },
  {
    key: 'jobs',
    label: 'Jobs',
    singular: 'Job',
    tableName: 'price_list_jobs',
    placeholder: 'e.g. Wall painting, Floor polishing',
  },
  {
    key: 'type_lists',
    label: 'Type Lists',
    singular: 'Type List',
    tableName: 'price_list_type_lists',
    placeholder: 'e.g. Residential list, Commercial list',
  },
];

export function AdminPriceList() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('composite');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<{ id?: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CatalogItem | null>(null);

  const currentTabConfig = TABS.find((t) => t.key === activeTab)!;

  const isDuplicate = currentItem
    ? items.some(
        (item) =>
          item.description.trim().toLowerCase() === currentItem.description.trim().toLowerCase() &&
          item.id !== currentItem.id
      )
    : false;

  // Scrollbar checking
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  const checkScrollbar = () => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      setHasScrollbar(scrollHeight > clientHeight);
    }
  };

  useEffect(() => {
    // Small delay to ensure browser has rendered DOM
    const timer = setTimeout(checkScrollbar, 50);
    return () => clearTimeout(timer);
  }, [items, searchQuery, loading, showDeleted]);

  useEffect(() => {
    window.addEventListener('resize', checkScrollbar);
    return () => window.removeEventListener('resize', checkScrollbar);
  }, []);

  useEffect(() => {
    if (activeTab !== 'composite') {
      fetchItems();
    }
  }, [activeTab, showDeleted]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase.from(currentTabConfig.tableName).select('*').order('description');

      if (!showDeleted) {
        query = query.eq('deleted', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error(`Error fetching ${activeTab}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewItem = () => {
    setCurrentItem({ description: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditItem = (item: CatalogItem) => {
    setCurrentItem({ id: item.id, description: item.description });
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem || !currentItem.description.trim() || isDuplicate) {
      return;
    }

    setSaving(true);
    try {
      const payload: any = currentItem.id
        ? { id: currentItem.id, description: currentItem.description.trim() }
        : { description: currentItem.description.trim(), deleted: false };

      const { error } = await supabase.from(currentTabConfig.tableName).upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      setIsModalOpen(false);
      fetchItems();
    } catch (err: any) {
      console.error('Error saving item:', err);
      alert(err.message || 'Error occurred while saving item');
    } finally {
      setSaving(false);
    }
  };

  const triggerSoftDelete = (item: CatalogItem) => {
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from(currentTabConfig.tableName)
        .update({ deleted: true })
        .eq('id', itemToDelete.id);

      if (error) throw error;
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      alert(err.message || 'Error occurred while deleting item');
    }
  };

  const handleRestoreItem = async (item: CatalogItem) => {
    try {
      const { error } = await supabase
        .from(currentTabConfig.tableName)
        .update({ deleted: false })
        .eq('id', item.id);

      if (error) throw error;
      fetchItems();
    } catch (err: any) {
      console.error('Error restoring item:', err);
      alert(err.message || 'Error occurred while restoring item');
    }
  };

  const filteredItems = items.filter((item) =>
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] space-y-6">
      {/* Page Header */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Price List Catalogs</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Manage fundamental attributes for service composition
          </p>
        </div>
        {activeTab !== 'composite' && (
          <button
            onClick={handleOpenNewItem}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add {currentTabConfig.singular}
          </button>
        )}
      </div>

      {/* Filter and Tab Navigation Card */}
      <div className="shrink-0 bg-white rounded-3xl border border-slate-100 p-4 shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Tab switchers */}
          <div className="lg:col-span-6 flex flex-wrap gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSearchQuery('');
                }}
                className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary-dark border border-primary/20'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="lg:col-span-4 relative">
            <svg
              className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={`Search ${currentTabConfig.label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-semibold text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Show Deleted Toggle */}
          <div className="lg:col-span-2 flex items-center justify-end gap-2.5 px-2">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Show Deleted:</span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
              <div className="absolute left-0 -top-1 w-5.5 h-5.5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[18px] peer-checked:bg-primary-dark peer-checked:border-primary-dark"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Main Listing View */}
      {activeTab === 'composite' ? (
        <CompositeServicesView showDeleted={showDeleted} searchQuery={searchQuery} />
      ) : loading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-xs min-h-0 py-20 gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-bold">Loading catalog data...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl p-16 border border-slate-100 text-center min-h-0 space-y-4">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h4 className="font-extrabold text-slate-700 text-base">No Items Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
              No registered items match your search in this catalog.
            </p>
          </div>
        </div>
      ) : (
        /* GRID MODE */
        <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-xs overflow-x-auto overflow-y-hidden flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-w-[700px] min-h-0">
            {/* Header Row */}
            <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
              <div 
                className="grid grid-cols-12 text-[10px] font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
                style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
              >
                <div className="col-span-6">Description</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Created At</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
            </div>

            {/* Body Rows */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 items-center hover:bg-slate-50/50 transition-colors py-4.5 px-6">
                  {/* Description */}
                  <div className="col-span-6 pr-4">
                    <span className={`text-sm font-extrabold text-slate-700 ${item.deleted ? 'line-through text-slate-400' : ''}`}>
                      {item.description}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    {item.deleted ? (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-red-50 text-red-500 rounded-lg border border-red-100">
                        Deleted (Soft)
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Created At */}
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.deleted ? (
                        <button
                          onClick={() => handleRestoreItem(item)}
                          title="Restore Item"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenEditItem(item)}
                            title="Edit Item"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => triggerSoftDelete(item)}
                            title="Delete Item"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CREATE/EDIT MODAL */}
      {isModalOpen && currentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            onClick={() => setIsModalOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
          />

          {/* Modal Card */}
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-slide-up mx-4 border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-800 text-lg">
                  {currentItem.id ? `Edit ${currentTabConfig.singular}` : `Add New ${currentTabConfig.singular}`}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  Define item attributes catalog description
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveItem} className="flex flex-col overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto shrink-0">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={currentItem.description}
                    onChange={(e) => setCurrentItem((prev) => prev && { ...prev, description: e.target.value })}
                    placeholder={currentTabConfig.placeholder}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:bg-white transition-all font-medium text-slate-800 ${
                      isDuplicate
                        ? 'border-red-300 focus:ring-red-500'
                        : 'border-slate-200 focus:ring-primary'
                    }`}
                  />
                  {isDuplicate && (
                    <p className="text-[11px] text-red-500 font-bold mt-1.5 animate-slideDown flex items-center gap-1">
                      <span>⚠️ This {currentTabConfig.singular.toLowerCase()} description already exists!</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-grow px-4 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || isDuplicate || !currentItem.description.trim()}
                  className="flex-grow px-4 py-3 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            onClick={() => setIsDeleteModalOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
          />

          {/* Modal Card */}
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative z-10 flex flex-col overflow-hidden animate-slide-up mx-4 border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-800 text-base">
                  Confirm Delete
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  This action can be undone
                </p>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 text-sm text-slate-600 leading-relaxed space-y-3 shrink-0">
              <p>
                Are you sure you want to delete <span className="font-extrabold text-slate-800">"{itemToDelete.description}"</span>?
              </p>
              <p className="text-xs text-slate-400">
                It will be hidden from new services, but will be kept in the database for historical and traceability purposes.
              </p>
            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-grow px-4 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-grow px-4 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-2xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
