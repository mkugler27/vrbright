import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

// US phone formatting utility
function formatUSPhone(value: string) {
  const clean = value.replace(/[^\d]/g, '');
  if (clean.length === 0) return '';
  if (clean.length <= 3) return `(${clean}`;
  if (clean.length <= 6) return `(${clean.slice(0, 3)}) ${clean.slice(3)}`;
  return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6, 10)}`;
}

// Inline image compression helper
async function compressImage(file: File, maxSizeKB = 500): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        let quality = 0.8;
        const checkQuality = () => {
          canvas.toBlob((blob) => {
            if (blob) {
              if (blob.size / 1024 > maxSizeKB && quality > 0.1) {
                quality -= 0.1;
                checkQuality();
              } else {
                resolve(new File([blob], file.name, { type: 'image/jpeg' }));
              }
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        };
        checkQuality();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// -------------------------------------------------------------
// CUSTOM DROPDOWN COMPONENT (To comply with the rule of no native selects)
// -------------------------------------------------------------
interface CustomDropdownProps {
  label?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function CustomDropdown({ label, value, options, onChange, placeholder = 'Select an option', className = '' }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium text-slate-800 text-left"
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1 animate-slideDown">
          {options.length === 0 ? (
            <div className="px-4 py-2.5 text-xs text-slate-400 font-medium">No options available</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50 ${
                  opt.value === value ? 'bg-primary/10 text-primary-dark font-semibold' : 'text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// MAIN CLIENT TYPES DEFINITIONS
// -------------------------------------------------------------
interface PropertyManagement {
  id: string;
  name: string;
}

interface ClientLabel {
  id?: string;
  image_url: string;
  notes: string;
}

interface Client {
  id?: string;
  type: 'commercial' | 'residential';
  name: string;
  active: boolean;
  address: string;
  phone: string;
  email: string;
  area: 'PALM BEACH' | 'BROWARD' | 'MIAMI-DADE' | 'SAINT LUCIE' | '';
  units: number;
  logo_url?: string;
  property_management_id?: string;
  details: string;

  // Commercial Specific
  pm_name?: string;
  pm_email?: string;
  pm_phone?: string;
  pm_is_main?: boolean;
  sup_name?: string;
  sup_email?: string;
  sup_phone?: string;
  sup_is_main?: boolean;

  // Residential Specific
  additional_name?: string;
  additional_email?: string;

  // Resolved relation
  property_management?: PropertyManagement;
}

// -------------------------------------------------------------
// SEARCH DROPDOWN FOR PROPERTY MANAGEMENT (With search input and inline Edit/Delete)
// -------------------------------------------------------------
interface PMSearchDropdownProps {
  value: string;
  options: PropertyManagement[];
  onChange: (value: string) => void;
  onEdit: (pm: PropertyManagement) => void;
  onDelete: (pm: PropertyManagement) => void;
  placeholder?: string;
}

function PMSearchDropdown({ value, options, onChange, onEdit, onDelete, placeholder = 'Select an option' }: PMSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.id === value);
  const filteredOptions = options.filter((opt) => opt.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium text-slate-800 text-left shadow-2xs"
      >
        <span>{selectedOption ? selectedOption.name : placeholder}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 animate-slideDown flex flex-col max-h-72">
          {/* Search bar inside dropdown */}
          <div className="px-3 pb-2 pt-1 border-b border-slate-100 flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
            />
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 font-semibold text-center">No options found</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.id}
                  className={`flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors group/item ${
                    opt.id === value ? 'bg-primary/5 text-primary-dark font-semibold' : 'text-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                    className="flex-1 text-left py-0.5 text-sm font-semibold truncate cursor-pointer"
                  >
                    {opt.name}
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onEdit(opt)}
                      title="Edit Name"
                      className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(opt)}
                      title="Delete PM"
                      className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
      )}
    </div>
  );
}

export function AdminClients() {
  // DB States
  const [clients, setClients] = useState<Client[]>([]);
  const [pms, setPms] = useState<PropertyManagement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchName, setSearchName] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, commercial, residential
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, active, inactive
  const [filterPM, setFilterPM] = useState('ALL');

  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const stored = localStorage.getItem('vrbright_clients_view_mode');
    return (stored as 'card' | 'list') || 'card';
  });

  useEffect(() => {
    localStorage.setItem('vrbright_clients_view_mode', viewMode);
  }, [viewMode]);

  // Form Modals states
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPMModalOpen, setIsPMModalOpen] = useState(false);
  const [currentClient, setCurrentClient] = useState<Partial<Client>>({});
  const [currentLabels, setCurrentLabels] = useState<ClientLabel[]>([]);
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
  
  // Label Form temp states (Commercial)
  const [tempLabelNotes, setTempLabelNotes] = useState('');
  const [uploadingLabel, setUploadingLabel] = useState(false);
  
  // Property management inline form state
  const [newPMName, setNewPMName] = useState('');
  const [savingPM, setSavingPM] = useState(false);

  // General loader/saves
  const [savingClient, setSavingClient] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Confirmation modal states
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [editingPM, setEditingPM] = useState<PropertyManagement | null>(null);
  const [pmToDelete, setPmToDelete] = useState<PropertyManagement | null>(null);

  // Area Options
  const areaOptions = [
    { label: 'PALM BEACH', value: 'PALM BEACH' },
    { label: 'BROWARD', value: 'BROWARD' },
    { label: 'MIAMI-DADE', value: 'MIAMI-DADE' },
    { label: 'SAINT LUCIE', value: 'SAINT LUCIE' },
  ];

  // Fetch data
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load Property Managements
      const { data: pmData, error: pmErr } = await supabase
        .from('property_managements')
        .select('*')
        .order('name', { ascending: true });
      if (pmErr) throw pmErr;
      setPms(pmData || []);

      // Load Clients
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*, property_management:property_managements(id, name)')
        .order('name', { ascending: true });
      if (clientErr) throw clientErr;
      setClients(clientData || []);
    } catch (err) {
      console.error('Failed to load clients data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Handle Logo Upload (Commercial)
  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const compressed = await compressImage(file);
      const fileExt = compressed.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_logo.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client_assets')
        .upload(filePath, compressed);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('client_assets')
        .getPublicUrl(filePath);

      setCurrentClient((prev) => ({ ...prev, logo_url: urlData.publicUrl }));
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Handle Label Image Upload (Commercial)
  const handleLabelImageUpload = async (file: File) => {
    if (!file) return;
    setUploadingLabel(true);
    try {
      const compressed = await compressImage(file);
      const fileExt = compressed.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_label.${fileExt}`;
      const filePath = `labels/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client_assets')
        .upload(filePath, compressed);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('client_assets')
        .getPublicUrl(filePath);

      // Add to local temp labels list
      setCurrentLabels((prev) => [
        ...prev,
        { image_url: urlData.publicUrl, notes: tempLabelNotes },
      ]);
      setTempLabelNotes(''); // Clear notes after upload
    } catch (err) {
      console.error('Label image upload error:', err);
      alert('Failed to upload label photo.');
    } finally {
      setUploadingLabel(false);
    }
  };

  // Delete label from form list
  const removeLabel = (index: number) => {
    setCurrentLabels((prev) => prev.filter((_, i) => i !== index));
    if (editingLabelIdx === index) {
      setEditingLabelIdx(null);
      setTempLabelNotes('');
    }
  };

  // Replace label image during edit
  const handleReplaceLabelPhoto = async (idx: number, file: File) => {
    if (!file) return;
    setUploadingLabel(true);
    try {
      const compressed = await compressImage(file);
      const fileExt = compressed.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_label.${fileExt}`;
      const filePath = `labels/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client_assets')
        .upload(filePath, compressed);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('client_assets')
        .getPublicUrl(filePath);

      setCurrentLabels((prev) =>
        prev.map((lbl, i) => (i === idx ? { ...lbl, image_url: urlData.publicUrl } : lbl))
      );
    } catch (err) {
      console.error('Replace label photo error:', err);
      alert('Failed to replace photo.');
    } finally {
      setUploadingLabel(false);
    }
  };

  // Open form for Create Client
  const handleNewClient = () => {
    setCurrentClient({
      type: 'commercial',
      active: true,
      name: '',
      address: '',
      phone: '',
      email: '',
      area: '',
      units: 0,
      details: '',
      pm_is_main: true,
      sup_is_main: false,
    });
    setCurrentLabels([]);
    setEditingLabelIdx(null);
    setTempLabelNotes('');
    setIsClientModalOpen(true);
  };

  // Open form for Edit Client
  const handleEditClient = async (client: Client) => {
    setCurrentClient(client);
    setEditingLabelIdx(null);
    setTempLabelNotes('');
    setIsClientModalOpen(true);

    // If commercial, load its labels
    if (client.type === 'commercial' && client.id) {
      try {
        const { data, error } = await supabase
          .from('client_labels')
          .select('*')
          .eq('client_id', client.id);
        if (error) throw error;
        setCurrentLabels(data || []);
      } catch (err) {
        console.error('Error fetching labels:', err);
      }
    }
  };

  // Delete Client Database Action
  const executeDeleteClient = async (client: Client) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (err) {
      console.error('Error deleting client:', err);
      alert('Failed to delete client.');
    }
  };

  // Save / Update Client
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClient.name || !currentClient.type) return;

    setSavingClient(true);
    try {
      let savedId = currentClient.id;

      if (currentClient.id) {
        // Update Client
        const { error } = await supabase
          .from('clients')
          .update({
            type: currentClient.type,
            name: currentClient.name,
            active: currentClient.active,
            address: currentClient.address,
            phone: currentClient.phone,
            email: currentClient.email,
            area: currentClient.area || null,
            units: currentClient.units || 0,
            logo_url: currentClient.logo_url || null,
            property_management_id: currentClient.property_management_id || null,
            details: currentClient.details,
            pm_name: currentClient.pm_name || null,
            pm_email: currentClient.pm_email || null,
            pm_phone: currentClient.pm_phone || null,
            pm_is_main: currentClient.pm_is_main || false,
            sup_name: currentClient.sup_name || null,
            sup_email: currentClient.sup_email || null,
            sup_phone: currentClient.sup_phone || null,
            sup_is_main: currentClient.sup_is_main || false,
            additional_name: currentClient.additional_name || null,
            additional_email: currentClient.additional_email || null,
          })
          .eq('id', currentClient.id);

        if (error) throw error;
      } else {
        // Create Client
        const { data, error } = await supabase
          .from('clients')
          .insert({
            type: currentClient.type,
            name: currentClient.name,
            active: currentClient.active,
            address: currentClient.address,
            phone: currentClient.phone,
            email: currentClient.email,
            area: currentClient.area || null,
            units: currentClient.units || 0,
            logo_url: currentClient.logo_url || null,
            property_management_id: currentClient.property_management_id || null,
            details: currentClient.details,
            pm_name: currentClient.pm_name || null,
            pm_email: currentClient.pm_email || null,
            pm_phone: currentClient.pm_phone || null,
            pm_is_main: currentClient.pm_is_main || false,
            sup_name: currentClient.sup_name || null,
            sup_email: currentClient.sup_email || null,
            sup_phone: currentClient.sup_phone || null,
            sup_is_main: currentClient.sup_is_main || false,
            additional_name: currentClient.additional_name || null,
            additional_email: currentClient.additional_email || null,
          })
          .select()
          .single();

        if (error) throw error;
        savedId = data.id;
      }

      // If commercial, handle labels sync
      if (currentClient.type === 'commercial' && savedId) {
        // Delete all old labels and re-insert the current list
        await supabase.from('client_labels').delete().eq('client_id', savedId);

        if (currentLabels.length > 0) {
          const insertPayload = currentLabels.map((lbl) => ({
            client_id: savedId,
            image_url: lbl.image_url,
            notes: lbl.notes,
          }));
          const { error: labelsErr } = await supabase
            .from('client_labels')
            .insert(insertPayload);
          if (labelsErr) throw labelsErr;
        }
      }

      await loadData();
      setIsClientModalOpen(false);
    } catch (err) {
      console.error('Error saving client:', err);
      alert('Failed to save client details.');
    } finally {
      setSavingClient(false);
    }
  };

  // Inline Property Management Save
  const handleSavePM = async () => {
    if (!newPMName.trim()) return;
    setSavingPM(true);
    try {
      if (editingPM) {
        // UPDATE Property Management
        const { error } = await supabase
          .from('property_managements')
          .update({ name: newPMName.trim() })
          .eq('id', editingPM.id);
        
        if (error) throw error;

        setPms((prev) =>
          prev
            .map((p) => (p.id === editingPM.id ? { ...p, name: newPMName.trim() } : p))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } else {
        // INSERT Property Management
        const { data, error } = await supabase
          .from('property_managements')
          .insert({ name: newPMName.trim() })
          .select()
          .single();
        
        if (error) throw error;

        setPms((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setCurrentClient((prev) => ({ ...prev, property_management_id: data.id }));
      }
      setNewPMName('');
      setEditingPM(null);
      setIsPMModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create/edit property management:', err);
      alert(err.code === '23505' ? 'This Property Management name already exists.' : 'Failed to save Property Management.');
    } finally {
      setSavingPM(false);
    }
  };

  // Delete Property Management
  const executeDeletePM = async (pm: PropertyManagement) => {
    try {
      const { error } = await supabase
        .from('property_managements')
        .delete()
        .eq('id', pm.id);
      
      if (error) throw error;

      setPms((prev) => prev.filter((p) => p.id !== pm.id));
      if (currentClient.property_management_id === pm.id) {
        setCurrentClient((prev) => ({ ...prev, property_management_id: '' }));
      }
      if (filterPM === pm.id) {
        setFilterPM('ALL');
      }
    } catch (err) {
      console.error('Error deleting property management:', err);
      alert('Failed to delete Property Management. Make sure it is not linked to active clients.');
    }
  };

  // Filter clients list
  const filteredClients = clients.filter((client) => {
    // Search by Name
    if (searchName && !client.name.toLowerCase().includes(searchName.toLowerCase())) return false;
    
    // Filter Type
    if (filterType !== 'ALL' && client.type !== filterType) return false;

    // Filter Status
    if (filterStatus !== 'ALL') {
      const wantActive = filterStatus === 'ACTIVE';
      if (client.active !== wantActive) return false;
    }

    // Filter Property Management
    if (filterPM !== 'ALL' && client.property_management_id !== filterPM) return false;

    return true;
  });

  // Aggregated Sum totals
  const totalUnits = filteredClients.reduce((acc, curr) => acc + (curr.units || 0), 0);
  const totalCommercialCount = filteredClients.filter((c) => c.type === 'commercial').length;
  const totalResidentialCount = filteredClients.filter((c) => c.type === 'residential').length;

  return (
    <div className="space-y-6">
      {/* Aggregated Counters widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between h-28">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Clients</span>
          <span className="text-3xl font-extrabold text-slate-800 leading-none">{filteredClients.length}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between h-28">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Commercial</span>
          <span className="text-3xl font-extrabold text-blue-600 leading-none">{totalCommercialCount}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between h-28">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Residential</span>
          <span className="text-3xl font-extrabold text-teal-600 leading-none">{totalResidentialCount}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-between h-28">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Units</span>
          <span className="text-3xl font-extrabold text-primary-dark leading-none">{totalUnits}</span>
        </div>
      </div>

      {/* Action Header & Filters bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-slate-800 text-base">Clients Management</h3>
            
            {/* View Mode Toggle Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'card' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Card Grid"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2 2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Detailed List"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={handleNewClient}
            className="px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary-dark transition-all duration-200 active:scale-95 text-center flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add New Client
          </button>
        </div>

        {/* Inputs and custom dropdown filter grids */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {/* Search name */}
          <div className="relative">
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Search by client name..."
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Type filter custom dropdown */}
          <CustomDropdown
            value={filterType}
            options={[
              { label: 'All Types', value: 'ALL' },
              { label: 'Commercial Only', value: 'commercial' },
              { label: 'Residential Only', value: 'residential' },
            ]}
            onChange={setFilterType}
          />

          {/* Status filter custom dropdown */}
          <CustomDropdown
            value={filterStatus}
            options={[
              { label: 'All Statuses', value: 'ALL' },
              { label: 'Active Only', value: 'ACTIVE' },
              { label: 'Inactive Only', value: 'INACTIVE' },
            ]}
            onChange={setFilterStatus}
          />

          {/* Property management filter custom dropdown */}
          <CustomDropdown
            value={filterPM}
            options={[
              { label: 'All PMs', value: 'ALL' },
              ...pms.map((pm) => ({ label: pm.name, value: pm.id })),
            ]}
            onChange={setFilterPM}
            placeholder="Filter by Property Management"
          />
        </div>
      </div>

      {/* Clients grid list */}
      {loading ? (
        <div className="text-center text-slate-400 text-sm py-12">Loading clients records...</div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xs">
          <p className="text-slate-400 text-sm font-medium">No client records found matching the active filters.</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <div key={client.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs relative flex flex-col justify-between gap-3.5 group hover:shadow-md transition-shadow">
              
              {/* Header card details */}
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* Logo/Avatar */}
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-xs">
                      {client.logo_url ? (
                        <img src={client.logo_url} alt={client.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-lg font-bold text-slate-400 uppercase">{client.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">{client.name}</h4>
                      <span className={`inline-block text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 ${
                        client.type === 'commercial' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-teal-50 text-teal-600 border border-teal-100'
                      }`}>
                        {client.type}
                      </span>
                    </div>
                  </div>

                  {/* Active/Inactive badge */}
                  <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                    client.active ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                  }`}>
                    {client.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Sub details */}
                <div className="space-y-1.5 text-xs text-slate-500 font-medium pt-0.5">
                  {client.address && (
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="line-clamp-2 leading-tight">{client.address} ({client.area})</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.824-1.28-5.116-3.573-6.4-6.4l1.293-.97a1.125 1.125 0 00.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      <span className="leading-none">{client.phone}</span>
                    </div>
                  )}
                  {client.type === 'commercial' && client.units > 0 && (
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="leading-none">{client.units} Units</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100/80">
                <div className="min-w-0">
                  {client.property_management ? (
                    <div className="flex items-center gap-1 text-blue-600 font-bold bg-blue-50/50 rounded-lg px-2 py-0.5 text-[10px] w-fit truncate max-w-[140px] sm:max-w-none" title={client.property_management.name}>
                      <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="truncate">PM: {client.property_management.name}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-350 italic font-semibold">No PM Linked</span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEditClient(client)}
                    title="Edit Customer"
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setClientToDelete(client)}
                    title="Delete Customer"
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Detailed List View (Table Mode) */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">Client Name</th>
                <th className="py-4 px-6">Address & Area</th>
                <th className="py-4 px-6">Contact Person</th>
                <th className="py-4 px-6 text-center">Units</th>
                <th className="py-4 px-6">Property Management</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
              {filteredClients.map((client) => {
                let contactName = '';
                let contactRole = '';
                if (client.type === 'commercial') {
                  if (client.pm_is_main) {
                    contactName = client.pm_name || '';
                    contactRole = 'Property Manager';
                  } else if (client.sup_is_main) {
                    contactName = client.sup_name || '';
                    contactRole = 'Supervisor';
                  } else {
                    contactName = client.pm_name || client.sup_name || '';
                    contactRole = client.pm_name ? 'Property Manager' : 'Supervisor';
                  }
                } else {
                  contactName = client.additional_name || '';
                  contactRole = 'Additional Contact';
                }

                return (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name & Logo & Status */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-2xs">
                          {client.logo_url ? (
                            <img src={client.logo_url} alt={client.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-sm font-bold text-slate-400 uppercase">{client.name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 line-clamp-1">{client.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                              client.type === 'commercial' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'
                            }`}>
                              {client.type}
                            </span>
                            <span className={`text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                              client.active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {client.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Address & Area */}
                    <td className="py-4 px-6">
                      <div className="line-clamp-1 text-slate-800">{client.address || 'N/A'}</div>
                      <div className="text-xs text-slate-400 mt-0.5 font-semibold">{client.area || 'No Area'}</div>
                    </td>

                    {/* Contact Person */}
                    <td className="py-4 px-6">
                      {contactName ? (
                        <div>
                          <div className="font-semibold text-slate-800 line-clamp-1">{contactName}</div>
                          <div className="text-xs text-slate-400 mt-0.5 font-bold uppercase tracking-wider">{contactRole}</div>
                        </div>
                      ) : (
                        <span className="text-slate-350 text-xs italic font-medium">No Contact</span>
                      )}
                    </td>

                    {/* Units */}
                    <td className="py-4 px-6 text-center">
                      {client.type === 'commercial' && client.units > 0 ? (
                        <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                          {client.units}
                        </span>
                      ) : (
                        <span className="text-slate-350">—</span>
                      )}
                    </td>

                    {/* Property Management */}
                    <td className="py-4 px-6">
                      {client.property_management ? (
                        <div className="text-blue-600 font-bold text-xs flex items-center gap-1.5 bg-blue-50/50 px-2 py-1 rounded-lg w-fit">
                          <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {client.property_management.name}
                        </div>
                      ) : (
                        <span className="text-slate-350">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditClient(client)}
                          title="Edit Customer"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setClientToDelete(client)}
                          title="Delete Customer"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------------------------------------
          ADD / EDIT CLIENT FULLSCREEN FORM MODAL
          ------------------------------------------------------------- */}
      {isClientModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] border border-slate-100 overflow-hidden animate-scaleIn">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-lg">
                {currentClient.id ? 'Edit Customer' : 'New Customer'}
              </h3>
              <button
                onClick={() => setIsClientModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-lg active:scale-90 transition-transform"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSaveClient} className="flex-grow overflow-y-auto p-6 space-y-6">
              {/* Type Switcher tabs */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
                <button
                  type="button"
                  onClick={() => setCurrentClient((prev) => ({ ...prev, type: 'commercial' }))}
                  className={`px-5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all ${
                    currentClient.type === 'commercial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Commercial
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentClient((prev) => ({ ...prev, type: 'residential' }))}
                  className={`px-5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all ${
                    currentClient.type === 'residential' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Residencial
                </button>
              </div>

              {/* Status / Active Toggle */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-600">Active Account:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentClient.active}
                    onChange={(e) => setCurrentClient((prev) => ({ ...prev, active: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Dynamically Rendered Form Section */}
              {currentClient.type === 'commercial' ? (
                // ==========================================
                // COMMERCIAL FORM SECTION
                // ==========================================
                <div className="space-y-4">
                  {/* Name & General Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Client Name / Condo Name</label>
                      <input
                        type="text"
                        value={currentClient.name || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Oakridge Condominium"
                        required
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">General Phone</label>
                      <input
                        type="text"
                        value={currentClient.phone || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, phone: formatUSPhone(e.target.value) }))}
                        placeholder="(201) 555-0123"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
                    <input
                      type="text"
                      value={currentClient.address || ''}
                      onChange={(e) => setCurrentClient((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="Type here..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>

                  {/* Area, Units & Logo Upload */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <CustomDropdown
                      label="Area"
                      value={currentClient.area || ''}
                      options={areaOptions}
                      onChange={(val) => setCurrentClient((prev) => ({ ...prev, area: val as any }))}
                    />

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Units</label>
                      <input
                        type="number"
                        value={currentClient.units ?? 0}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, units: parseInt(e.target.value) || 0 }))}
                        placeholder="e.g. 120"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Client Logo</label>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center justify-center h-[46px] px-4 border border-dashed border-slate-300 hover:border-primary rounded-xl cursor-pointer bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider w-full active:bg-slate-100 transition-colors">
                          <span>{uploadingLogo ? 'Uploading...' : 'Upload Logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleLogoUpload(file);
                            }}
                            className="hidden"
                          />
                        </label>
                        {currentClient.logo_url && (
                          <img src={currentClient.logo_url} alt="Logo" className="w-10 h-10 object-contain rounded-lg border border-slate-200 p-0.5 shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Property Management Picker */}
                  <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Property Management Connection</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPM(null);
                          setNewPMName('');
                          setIsPMModalOpen(true);
                        }}
                        className="text-xs font-bold text-primary-dark hover:underline flex items-center gap-0.5"
                      >
                        + New PM
                      </button>
                    </div>
                    <PMSearchDropdown
                      value={currentClient.property_management_id || ''}
                      options={pms}
                      onChange={(val) => setCurrentClient((prev) => ({ ...prev, property_management_id: val }))}
                      onEdit={(pm) => {
                        setEditingPM(pm);
                        setNewPMName(pm.name);
                        setIsPMModalOpen(true);
                      }}
                      onDelete={(pm) => {
                        setPmToDelete(pm);
                      }}
                      placeholder="Select Property Management Connection"
                    />
                  </div>

                  {/* Contacts Header */}
                  <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 pt-2">Contacts Information</h4>

                  {/* Property Manager Contacts */}
                  <div className="border border-slate-150 rounded-2xl p-4 space-y-3 bg-slate-50/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Property Manager Contact
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Main Contact:</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentClient.pm_is_main || false}
                            onChange={(e) =>
                              setCurrentClient((prev) => ({
                                ...prev,
                                pm_is_main: e.target.checked,
                                sup_is_main: e.target.checked ? false : prev.sup_is_main,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Manager Name"
                        value={currentClient.pm_name || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, pm_name: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                      <input
                        type="email"
                        placeholder="Manager Email"
                        value={currentClient.pm_email || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, pm_email: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                      <input
                        type="text"
                        placeholder="Manager Phone"
                        value={currentClient.pm_phone || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, pm_phone: formatUSPhone(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                    </div>
                  </div>

                  {/* Supervisor Contacts */}
                  <div className="border border-slate-150 rounded-2xl p-4 space-y-3 bg-slate-50/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Supervisor Contact
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Main Contact:</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentClient.sup_is_main || false}
                            onChange={(e) =>
                              setCurrentClient((prev) => ({
                                ...prev,
                                sup_is_main: e.target.checked,
                                pm_is_main: e.target.checked ? false : prev.pm_is_main,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[18px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Supervisor Name"
                        value={currentClient.sup_name || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, sup_name: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                      <input
                        type="email"
                        placeholder="Supervisor Email"
                        value={currentClient.sup_email || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, sup_email: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                      <input
                        type="text"
                        placeholder="Supervisor Phone"
                        value={currentClient.sup_phone || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, sup_phone: formatUSPhone(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                    </div>
                  </div>

                  {/* LABELS SECTION */}
                  <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 pt-2">Labels (Photos & Descriptions)</h4>
                  <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          {editingLabelIdx !== null ? 'Editing Label Description' : 'Label Photo Description'}
                        </label>
                        <input
                          type="text"
                          value={tempLabelNotes}
                          onChange={(e) => setTempLabelNotes(e.target.value)}
                          placeholder="e.g. Main painting brand used for exterior walls"
                          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-slate-800"
                        />
                      </div>
                      
                      {editingLabelIdx !== null ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentLabels((prev) =>
                                prev.map((lbl, i) => (i === editingLabelIdx ? { ...lbl, notes: tempLabelNotes } : lbl))
                              );
                              setTempLabelNotes('');
                              setEditingLabelIdx(null);
                            }}
                            className="flex-1 px-4 py-3.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl active:scale-[0.98] transition-all text-center flex items-center justify-center"
                          >
                            Update Text
                          </button>
                          <label className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3.5 border border-dashed border-slate-300 hover:border-primary rounded-xl cursor-pointer bg-white text-xs font-bold text-slate-500 uppercase tracking-wider active:bg-slate-100 transition-colors">
                            <span>Replace Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleReplaceLabelPhoto(editingLabelIdx, file);
                              }}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setTempLabelNotes('');
                              setEditingLabelIdx(null);
                            }}
                            className="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl active:scale-[0.98] transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="flex items-center justify-center gap-2 px-4 py-3.5 border border-dashed border-slate-300 hover:border-primary rounded-xl cursor-pointer bg-white text-xs font-bold text-slate-500 uppercase tracking-wider w-full active:bg-slate-100 transition-colors">
                            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{uploadingLabel ? 'Uploading...' : 'Add Photo & Save Label'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleLabelImageUpload(file);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Labels List */}
                    {currentLabels.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        {currentLabels.map((lbl, idx) => (
                          <div key={idx} className="bg-white rounded-xl p-3 border border-slate-150 flex gap-3 relative group shadow-2xs">
                            <img src={lbl.image_url} alt="Label" className="w-16 h-16 object-cover rounded-lg border border-slate-100 shrink-0 bg-slate-50" />
                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                              <p className="text-xs text-slate-600 font-medium leading-relaxed line-clamp-3">{lbl.notes || 'No description'}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLabelIdx(idx);
                                    setTempLabelNotes(lbl.notes);
                                  }}
                                  className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                                >
                                  Edit
                                </button>
                                <span className="text-[10px] text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => removeLabel(idx)}
                                  className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // ==========================================
                // RESIDENCIAL FORM SECTION
                // ==========================================
                <div className="space-y-4">
                  {/* Name & Email */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Customer Name</label>
                      <input
                        type="text"
                        value={currentClient.name || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. John Doe"
                        required
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                      <input
                        type="email"
                        value={currentClient.email || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="e.g. john@email.com"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
                    <input
                      type="text"
                      value={currentClient.address || ''}
                      onChange={(e) => setCurrentClient((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="Type here..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>

                  {/* Area & Phone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CustomDropdown
                      label="Area"
                      value={currentClient.area || ''}
                      options={areaOptions}
                      onChange={(val) => setCurrentClient((prev) => ({ ...prev, area: val as any }))}
                    />
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number</label>
                      <input
                        type="text"
                        value={currentClient.phone || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, phone: formatUSPhone(e.target.value) }))}
                        placeholder="(201) 555-0123"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Additional Customer Information */}
                  <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 pt-2">Additional Customer Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-semibold text-slate-600">Contact Name</label>
                      <input
                        type="text"
                        value={currentClient.additional_name || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, additional_name: e.target.value }))}
                        placeholder="Additional contact name"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-semibold text-slate-600">Contact Email</label>
                      <input
                        type="email"
                        value={currentClient.additional_email || ''}
                        onChange={(e) => setCurrentClient((prev) => ({ ...prev, additional_email: e.target.value }))}
                        placeholder="Additional contact email"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-350"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Details Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Details (Type / Instructions)</label>
                <textarea
                  value={currentClient.details || ''}
                  onChange={(e) => setCurrentClient((prev) => ({ ...prev, details: e.target.value }))}
                  placeholder="Notes, references, or specific instructions..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="flex-grow px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="flex-grow px-4 py-3 text-white bg-primary hover:bg-primary-dark text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-md shadow-primary/10 flex items-center justify-center gap-2"
                >
                  {savingClient ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving Client...
                    </>
                  ) : (
                    'Save Client'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          INLINE PROPERTY MANAGEMENT CREATE/EDIT MODAL
          ------------------------------------------------------------- */}
      {isPMModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-100 animate-scaleIn">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-slate-800 text-sm">
                {editingPM ? 'Edit Property Management' : 'Add Property Management'}
              </h4>
              <button
                onClick={() => {
                  setNewPMName('');
                  setEditingPM(null);
                  setIsPMModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Company Name</label>
              <input
                type="text"
                value={newPMName}
                onChange={(e) => setNewPMName(e.target.value)}
                placeholder="e.g. First Service Residential"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setNewPMName('');
                  setEditingPM(null);
                  setIsPMModalOpen(false);
                }}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePM}
                disabled={savingPM || !newPMName.trim()}
                className="flex-1 px-4 py-2.5 text-white bg-primary hover:bg-primary-dark text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {savingPM ? 'Saving...' : 'Save PM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog for Client Deletion */}
      <ConfirmationModal
        isOpen={clientToDelete !== null}
        title="Delete Customer"
        message={`Are you sure you want to delete ${clientToDelete?.name}? This action will permanently remove this customer and all associated labels.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={async () => {
          if (clientToDelete) {
            await executeDeleteClient(clientToDelete);
            setClientToDelete(null);
          }
        }}
        onCancel={() => setClientToDelete(null)}
      />

      {/* Custom Confirmation Dialog for Property Management Deletion */}
      <ConfirmationModal
        isOpen={pmToDelete !== null}
        title="Delete Property Management"
        message={`Are you sure you want to delete ${pmToDelete?.name}? This action will permanently remove this management company. Any clients connected to this company will lose their connection.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={async () => {
          if (pmToDelete) {
            await executeDeletePM(pmToDelete);
            setPmToDelete(null);
          }
        }}
        onCancel={() => setPmToDelete(null)}
      />
    </div>
  );
}
