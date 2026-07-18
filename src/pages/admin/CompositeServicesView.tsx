import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

interface CatalogItem {
  id: string;
  description: string;
  deleted: boolean;
  created_at: string;
}

interface PriceListItem {
  id: string;
  type_id: string | null;
  size_id: string | null;
  service_id: string | null;
  custom_text: string | null;
  job_id: string | null;
  type_list_id: string | null;
  description: string;
  worker_value: number;
  price_value?: number;
  show_in_proposal: boolean;
  show_in_wo: boolean;
  active: boolean;
  deleted: boolean;
  show_worker_value?: boolean;
  created_at: string;
  // Joins
  price_list_types?: { description: string } | null;
  price_list_sizes?: { description: string } | null;
  price_list_services?: { description: string } | null;
  price_list_jobs?: { description: string } | null;
  price_list_type_lists?: { description: string } | null;
}

interface CompositeServicesViewProps {
  showDeleted: boolean;
  searchQuery: string;
}

export function CompositeServicesView({ showDeleted, searchQuery }: CompositeServicesViewProps) {
  // Main items list
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog Lists (for dropdown selections and filters)
  const [types, setTypes] = useState<CatalogItem[]>([]);
  const [sizes, setSizes] = useState<CatalogItem[]>([]);
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [jobs, setJobs] = useState<CatalogItem[]>([]);
  const [typeLists, setTypeLists] = useState<CatalogItem[]>([]);

  // Filter Dropdown States
  const [filterType, setFilterType] = useState('ALL');
  const [filterSize, setFilterSize] = useState('ALL');
  const [filterService, setFilterService] = useState('ALL');
  const [filterJob, setFilterJob] = useState('ALL');
  const [filterTypeList, setFilterTypeList] = useState('ALL');
  const [filterArea, setFilterArea] = useState('ALL'); // ALL, proposal, wo, both

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Field States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedTypeList, setSelectedTypeList] = useState<string>('');
  const [workerValue, setWorkerValue] = useState<string>('0.00');
  const [showInProposal, setShowInProposal] = useState(true);
  const [showInWO, setShowInWO] = useState(true);
  const [active, setActive] = useState(true);
  const [showWorkerValue, setShowWorkerValue] = useState(true);

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PriceListItem | null>(null);

  // Scrollbar checking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  const checkScrollbar = () => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      setHasScrollbar(scrollHeight > clientHeight);
    }
  };

  // Run scrollbar checks when data/view changes
  useEffect(() => {
    const timer = setTimeout(checkScrollbar, 50);
    return () => clearTimeout(timer);
  }, [items, searchQuery, loading, filterType, filterSize, filterService, filterJob, filterTypeList, filterArea]);

  useEffect(() => {
    window.addEventListener('resize', checkScrollbar);
    return () => window.removeEventListener('resize', checkScrollbar);
  }, []);

  // Fetch all catalogs and main items
  useEffect(() => {
    fetchCatalogs();
    fetchCompositeItems();
  }, [showDeleted]);

  const fetchCatalogs = async () => {
    try {
      const [tRes, sRes, svRes, jRes, tlRes] = await Promise.all([
        supabase.from('price_list_types').select('*').eq('deleted', false).order('description'),
        supabase.from('price_list_sizes').select('*').eq('deleted', false).order('description'),
        supabase.from('price_list_services').select('*').eq('deleted', false).order('description'),
        supabase.from('price_list_jobs').select('*').eq('deleted', false).order('description'),
        supabase.from('price_list_type_lists').select('*').eq('deleted', false).order('description'),
      ]);

      if (tRes.error) throw tRes.error;
      if (sRes.error) throw sRes.error;
      if (svRes.error) throw svRes.error;
      if (jRes.error) throw jRes.error;
      if (tlRes.error) throw tlRes.error;

      setTypes(tRes.data || []);
      setSizes(sRes.data || []);
      setServices(svRes.data || []);
      setJobs(jRes.data || []);
      setTypeLists(tlRes.data || []);
    } catch (err) {
      console.error('Error fetching catalog fields:', err);
    }
  };

  const fetchCompositeItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('price_list_items')
        .select(`
          *,
          price_list_types(description),
          price_list_sizes(description),
          price_list_services(description),
          price_list_jobs(description),
          price_list_type_lists(description)
        `);

      if (!showDeleted) {
        query = query.eq('deleted', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching composite items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate live preview description
  const computedDescription = (() => {
    const typeDesc = types.find((t) => t.id === selectedType)?.description || '';
    const sizeDesc = sizes.find((s) => s.id === selectedSize)?.description || '';
    const serviceDesc = services.find((s) => s.id === selectedService)?.description || '';
    const freeText = customText.trim();

    return [typeDesc, sizeDesc, serviceDesc, freeText]
      .map((str) => str.trim())
      .filter(Boolean)
      .join(' - ');
  })();

  // Duplicate Check
  const isDuplicate = (() => {
    if (!computedDescription.trim()) return false;
    return items.some(
      (item) =>
        item.description.trim().toLowerCase() === computedDescription.trim().toLowerCase() &&
        item.id !== editingId
    );
  })();

  const handleOpenAddModal = () => {
    setEditingId(null);
    setSelectedType('');
    setSelectedSize('');
    setSelectedService('');
    setCustomText('');
    setSelectedJob('');
    setSelectedTypeList('');
    setWorkerValue('0.00');
    setShowInProposal(true);
    setShowInWO(true);
    setActive(true);
    setShowWorkerValue(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: PriceListItem) => {
    setEditingId(item.id);
    setSelectedType(item.type_id || '');
    setSelectedSize(item.size_id || '');
    setSelectedService(item.service_id || '');
    setCustomText(item.custom_text || '');
    setSelectedJob(item.job_id || '');
    setSelectedTypeList(item.type_list_id || '');
    setWorkerValue(item.worker_value.toFixed(2));
    setShowInProposal(item.show_in_proposal);
    setShowInWO(item.show_in_wo);
    setActive(item.active);
    setShowWorkerValue(item.show_worker_value ?? true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!computedDescription.trim()) {
      setErrorMessage('Description cannot be empty. Please select attributes or input text.');
      return;
    }
    if (!selectedJob) {
      setErrorMessage('Please select a Job.');
      return;
    }
    if (!selectedTypeList) {
      setErrorMessage('Please select a Type List.');
      return;
    }
    if (!showInProposal && !showInWO) {
      setErrorMessage('Please choose at least one Area (Proposal or WO).');
      return;
    }
    if (isDuplicate) {
      setErrorMessage('A composite service with this description already exists.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        type_id: selectedType || null,
        size_id: selectedSize || null,
        service_id: selectedService || null,
        custom_text: customText.trim() || null,
        job_id: selectedJob || null,
        type_list_id: selectedTypeList || null,
        description: computedDescription,
        worker_value: parseFloat(workerValue) || 0,
        show_in_proposal: showInProposal,
        show_in_wo: showInWO,
        show_worker_value: showWorkerValue,
        active: active,
        deleted: false,
      };

      let error;
      if (editingId) {
        const { error: err } = await supabase
          .from('price_list_items')
          .update(payload)
          .eq('id', editingId);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('price_list_items')
          .insert([payload]);
        error = err;
      }

      if (error) throw error;

      setIsModalOpen(false);
      fetchCompositeItems();
    } catch (err: any) {
      console.error('Error saving composite item:', err);
      setErrorMessage(err.message || 'Error occurred while saving item.');
    } finally {
      setSaving(false);
    }
  };

  const triggerSoftDelete = (item: PriceListItem) => {
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('price_list_items')
        .update({ deleted: true })
        .eq('id', itemToDelete.id);

      if (error) throw error;
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      fetchCompositeItems();
    } catch (err: any) {
      console.error('Error deleting item:', err);
    }
  };

  const handleRestoreItem = async (item: PriceListItem) => {
    try {
      const { error } = await supabase
        .from('price_list_items')
        .update({ deleted: false })
        .eq('id', item.id);

      if (error) throw error;
      fetchCompositeItems();
    } catch (err: any) {
      console.error('Error restoring item:', err);
    }
  };



  // Filter Items
  const filteredItems = items.filter((item) => {
    if (searchQuery && !item.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterType !== 'ALL' && item.type_id !== filterType) return false;
    if (filterSize !== 'ALL' && item.size_id !== filterSize) return false;
    if (filterService !== 'ALL' && item.service_id !== filterService) return false;
    if (filterJob !== 'ALL' && item.job_id !== filterJob) return false;
    if (filterTypeList !== 'ALL' && item.type_list_id !== filterTypeList) return false;
    if (filterArea !== 'ALL') {
      if (filterArea === 'proposal' && !item.show_in_proposal) return false;
      if (filterArea === 'wo' && !item.show_in_wo) return false;
    }
    return true;
  });

  // Sort by Job Category first (ascending) and then by Service Description (ascending)
  const sortedFilteredItems = [...filteredItems].sort((a, b) => {
    const jobA = a.price_list_jobs?.description || '';
    const jobB = b.price_list_jobs?.description || '';
    const jobCompare = jobA.localeCompare(jobB);
    if (jobCompare !== 0) return jobCompare;

    const descA = a.description || '';
    const descB = b.description || '';
    return descA.localeCompare(descB);
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      {/* SubHeader Filters Section */}
      <div className="shrink-0 bg-white rounded-3xl border border-slate-100 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-wider">
            Filter Services Catalog
          </h2>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <span>+ Compose Service</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Filter Type */}
          <SearchableDropdown
            label="Type"
            value={filterType}
            onChange={setFilterType}
            placeholder="All Types"
            searchPlaceholder="Search Type..."
            options={[{ label: 'All Types', value: 'ALL' }, ...types.map((t) => ({ label: t.description, value: t.id }))]}
          />

          {/* Filter Size */}
          <SearchableDropdown
            label="Size"
            value={filterSize}
            onChange={setFilterSize}
            placeholder="All Sizes"
            searchPlaceholder="Search Size..."
            options={[{ label: 'All Sizes', value: 'ALL' }, ...sizes.map((s) => ({ label: s.description, value: s.id }))]}
          />

          {/* Filter Service */}
          <SearchableDropdown
            label="Service"
            value={filterService}
            onChange={setFilterService}
            placeholder="All Services"
            searchPlaceholder="Search Service..."
            options={[{ label: 'All Services', value: 'ALL' }, ...services.map((sv) => ({ label: sv.description, value: sv.id }))]}
          />

          {/* Filter Job */}
          <SearchableDropdown
            label="Job Category"
            value={filterJob}
            onChange={setFilterJob}
            placeholder="All Jobs"
            searchPlaceholder="Search Job..."
            options={[{ label: 'All Jobs', value: 'ALL' }, ...jobs.map((j) => ({ label: j.description, value: j.id }))]}
          />

          {/* Filter Type List */}
          <SearchableDropdown
            label="Type List"
            value={filterTypeList}
            onChange={setFilterTypeList}
            placeholder="All Type Lists"
            searchPlaceholder="Search Type List..."
            options={[{ label: 'All Type Lists', value: 'ALL' }, ...typeLists.map((tl) => ({ label: tl.description, value: tl.id }))]}
          />

          {/* Filter Area visibility */}
          <SearchableDropdown
            label="Area"
            value={filterArea}
            onChange={setFilterArea}
            placeholder="All Areas"
            searchPlaceholder="Search Area..."
            options={[
              { label: 'All Areas', value: 'ALL' },
              { label: 'Proposals Only', value: 'proposal' },
              { label: 'WOs Only', value: 'wo' },
            ]}
          />
        </div>
      </div>

      {/* Main Listing Grid/Table */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-xs min-h-0 py-20 gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-bold">Loading composite services...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl p-16 border border-slate-100 text-center min-h-0 space-y-4">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h4 className="font-extrabold text-slate-700 text-base">No Composite Services Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
              No registered composite services match the search or filter settings.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-xs overflow-x-auto overflow-y-hidden flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-w-[900px] min-h-0">
            {/* Header Row */}
            <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
              <div
                className="grid grid-cols-12 text-[10px] font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
                style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
              >
                <div className="col-span-2">Job Category</div>
                <div className="col-span-4">Service Description</div>
                <div className="col-span-2">Type List</div>
                <div className="col-span-1 text-right">Work Price</div>
                <div className="col-span-1 text-center">Areas</div>
                <div className="col-span-1 text-center">Show Worker</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
            </div>

            {/* Body Rows */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {sortedFilteredItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 items-center hover:bg-slate-50/50 transition-colors py-4.5 px-6">
                  {/* Job Category */}
                  <div className="col-span-2 pr-4 text-slate-850 font-extrabold truncate">
                    {item.price_list_jobs?.description || <span className="text-slate-350 italic">No Job</span>}
                  </div>

                  {/* Service Description */}
                  <div className="col-span-4 pr-4">
                    <div className="flex flex-col">
                      <span className={`text-sm font-extrabold text-slate-800 line-clamp-2 ${item.deleted ? 'line-through text-slate-400' : ''}`}>
                        {(() => {
                          const prefixPart = [
                            item.price_list_types?.description || '',
                            item.price_list_sizes?.description || '',
                            item.price_list_services?.description || '',
                          ].map((s) => s.trim()).filter(Boolean).join(' - ');

                          return (
                            <>
                              {prefixPart}
                              {prefixPart && item.custom_text && ' - '}
                              {item.custom_text && (
                                <span className="text-blue-600 font-extrabold">
                                  {item.custom_text}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Type List */}
                  <div className="col-span-2 pr-4 text-slate-600 font-bold truncate">
                    {item.price_list_type_lists?.description || <span className="text-slate-350 italic">No Type List</span>}
                  </div>

                  {/* Rates */}
                  <div className="col-span-1 pr-4 text-right">
                    <span className="text-slate-800 font-extrabold">
                      ${item.worker_value.toFixed(2)}
                    </span>
                  </div>

                  {/* Areas badging */}
                  <div className="col-span-1 text-center flex flex-col items-center justify-center gap-1">
                    {item.show_in_proposal && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md border border-blue-100">
                        Proposal
                      </span>
                    )}
                    {item.show_in_wo && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">
                        WO
                      </span>
                    )}
                    {!item.show_in_proposal && !item.show_in_wo && (
                      <span className="text-[9px] font-bold text-slate-300 italic">None</span>
                    )}
                  </div>

                  {/* Show Worker */}
                  <div className="col-span-1 text-center flex justify-center">
                    {item.show_worker_value !== false ? (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
                        Yes
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md border border-slate-100">
                        No
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.deleted ? (
                        <button
                          onClick={() => handleRestoreItem(item)}
                          title="Restore Service"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                        </button>
                      ) : (
                        <>
                          {/* Edit service */}
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            title="Edit Service"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                          {/* Delete service */}
                          <button
                            onClick={() => triggerSoftDelete(item)}
                            title="Delete Service"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      {/* CREATE/EDIT COMPOSITE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            onClick={() => setIsModalOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
          />

          {/* Modal Card */}
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl relative z-10 flex flex-col max-h-[92vh] overflow-hidden animate-slide-up mx-4 border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-800 text-lg">
                  {editingId ? 'Edit Composite Service' : 'Compose New Service'}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  Select attributes and configure price list items
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
              <div className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1">
                {/* Error Alert */}
                {errorMessage && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 text-xs text-red-600 font-semibold flex items-start gap-2 animate-shake">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Description Builders (Type - Size - Service) */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4.5 space-y-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    Description Composition (Sequence-dependent)
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Selected Type */}
                    <div className="md:col-span-3">
                      <SearchableDropdown
                        label="Type"
                        value={selectedType}
                        onChange={setSelectedType}
                        placeholder="-- Optional Type --"
                        searchPlaceholder="Search Type..."
                        options={[{ label: '-- Empty --', value: '' }, ...types.map((t) => ({ label: t.description, value: t.id }))]}
                      />
                    </div>

                    {/* Selected Size */}
                    <div className="md:col-span-3">
                      <SearchableDropdown
                        label="Size"
                        value={selectedSize}
                        onChange={setSelectedSize}
                        placeholder="-- Optional Size --"
                        searchPlaceholder="Search Size..."
                        options={[{ label: '-- Empty --', value: '' }, ...sizes.map((s) => ({ label: s.description, value: s.id }))]}
                      />
                    </div>

                    {/* Selected Service Attribute */}
                    <div className="md:col-span-6">
                      <SearchableDropdown
                        label="Service"
                        value={selectedService}
                        onChange={setSelectedService}
                        placeholder="-- Optional Service --"
                        searchPlaceholder="Search Service..."
                        options={[{ label: '-- Empty --', value: '' }, ...services.map((sv) => ({ label: sv.description, value: sv.id }))]}
                      />
                    </div>
                  </div>

                  {/* Free text field */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Free Text / Custom Detail (Last)
                    </label>
                    <input
                      type="text"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="e.g. Servico exclusivo, Qualquer serviço"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>

                  {/* Live Preview Display */}
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex flex-col gap-1 mt-2">
                    <span className="text-[9px] font-black text-primary-dark uppercase tracking-wider">
                      Automatic Description Preview:
                    </span>
                    <span className="text-sm font-extrabold text-slate-800 leading-tight">
                      {computedDescription || (
                        <span className="text-slate-350 italic font-medium">Description will be composed automatically here...</span>
                      )}
                    </span>
                    {isDuplicate && (
                      <span className="text-[10px] text-red-500 font-bold mt-1 animate-pulse">
                        ⚠️ Warning: A service with this description already exists!
                      </span>
                    )}
                  </div>
                </div>

                {/* Categories & Value Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Job selector */}
                  <SearchableDropdown
                    label="Job Category *"
                    value={selectedJob}
                    onChange={setSelectedJob}
                    placeholder="-- Choose Job Category --"
                    searchPlaceholder="Search Job..."
                    options={jobs.map((j) => ({ label: j.description, value: j.id }))}
                    direction="up"
                  />

                  {/* Type List selector */}
                  <SearchableDropdown
                    label="Type List Category *"
                    value={selectedTypeList}
                    onChange={setSelectedTypeList}
                    placeholder="-- Choose Type List --"
                    searchPlaceholder="Search Type List..."
                    options={typeLists.map((tl) => ({ label: tl.description, value: tl.id }))}
                    direction="up"
                  />

                  {/* Worker Pay rate */}
                  <div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Worker Pay Value ($) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={workerValue}
                          onChange={(e) => setWorkerValue(e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all"
                        />
                      </div>
                      <div className="flex flex-col items-center shrink-0 pb-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 select-none leading-none">
                          Show value
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={showWorkerValue}
                            onChange={(e) => setShowWorkerValue(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
                          <div className="absolute left-0 -top-1 w-5.5 h-5.5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[14px] peer-checked:bg-primary-dark peer-checked:border-primary-dark"></div>
                        </label>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">
                      Rate paid to work team members for payroll.
                    </p>
                  </div>
                </div>

                {/* Flags Checkbox */}
                <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                  {/* Areas checklists */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Area Visibility (Must choose at least one)
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showInProposal}
                          onChange={(e) => setShowInProposal(e.target.checked)}
                          className="w-4 h-4 text-primary bg-slate-100 border-slate-200 rounded-sm focus:ring-primary"
                        />
                        <span>Proposal</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showInWO}
                          onChange={(e) => setShowInWO(e.target.checked)}
                          className="w-4 h-4 text-primary bg-slate-100 border-slate-200 rounded-sm focus:ring-primary"
                        />
                        <span>Work Order (WO)</span>
                      </label>
                    </div>
                  </div>
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
                  disabled={saving || isDuplicate || !computedDescription.trim()}
                  className="flex-grow px-4 py-3 bg-primary hover:bg-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the composite service "${itemToDelete?.description || ''}"? It will be hidden from new Proposals and WOs, but will be kept in database history.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
      />
    </div>
  );
}
