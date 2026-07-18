import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { RichTextEditor } from '../../components/ui/RichTextEditor';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Client {
  id: string;
  name: string;
  type: 'commercial' | 'residential';
}

interface ServiceTemplate {
  id: string;
  description: string;
}

interface DetailTemplate {
  id: string;
  title: string;
  content: string;
}

interface ProposalItemState {
  id: string; // client-side temp id or db uuid
  service_id: string | null;
  description: string;
  quantity: number | '';
  unit_price: number;
  apply_quantity: boolean;
  subtotal: number;
}

interface ProposalDetailState {
  id: string;
  template_id: string | null;
  title: string;
  content: string;
}

interface ProposalPhotoState {
  id: string;
  image_url: string;
  description: string;
  file?: File;
}

interface Template {
  id: string;
  title: string;
  items?: any[];
  details?: any[];
}

// Custom PointerSensor that ignores interactive elements to keep default input behavior & text selection intact
export class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('button') ||
          target.closest('a') ||
          target.closest('.rich-text-editor') ||
          target.closest('[contenteditable="true"]')
        ) {
          return false;
        }
        return true;
      },
    },
  ];
}

// DND Kit Sensors
export function ProposalForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Wizard / Setup States
  const [showSetup, setShowSetup] = useState(!isEdit);
  const [setupClientType, setSetupClientType] = useState<'commercial' | 'residential'>('commercial');
  const [setupPricingType, setSetupPricingType] = useState<'price_list' | 'custom'>('price_list');

  // Main Proposal States
  const [proposalNumber, setProposalNumber] = useState('');
  const [proposalSeq, setProposalSeq] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientType, setClientType] = useState<'commercial' | 'residential'>('commercial');
  const [pricingType, setPricingType] = useState<'price_list' | 'custom'>('price_list');
  const [status, setStatus] = useState<'pending' | 'approved' | 'declined'>('pending');
  const [totalValue, setTotalValue] = useState(0);

  // Lists
  const [items, setItems] = useState<ProposalItemState[]>([]);
  const [details, setDetails] = useState<ProposalDetailState[]>([]);
  const [photos, setPhotos] = useState<ProposalPhotoState[]>([]);

  // Database lists for selectors
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceTemplate[]>([]);
  const [detailTemplates, setDetailTemplates] = useState<DetailTemplate[]>([]);
  const [activeTemplates, setActiveTemplates] = useState<Template[]>([]);

  // Modals & Loaders
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Edit custom service item state
  const [customEditId, setCustomEditId] = useState<string | null>(null);
  const [customHtml, setCustomHtml] = useState('');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [globalApplyQuantity, setGlobalApplyQuantity] = useState(true);

  // Template import checkboxes
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateItemChecks, setTemplateItemChecks] = useState<Record<string, boolean>>({});

  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showAlert = (message: string, title = 'Notice', isDestructive = false) => {
    setAlertConfig({
      isOpen: true,
      title,
      message,
      isDestructive,
    });
  };

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(SmartPointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchInitialData();
  }, [id, clientType]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // Fetch Clients
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, name, type')
        .eq('active', true)
        .eq('type', clientType)
        .order('name');
      setClients(clientsData || []);

      // Fetch Services templates (composite service list items)
      const { data: servicesData } = await supabase
        .from('price_list_items')
        .select('id, description')
        .eq('active', true)
        .eq('deleted', false)
        .order('description');
      setServices(servicesData || []);

      // Fetch reusable Details templates
      const { data: detailsData } = await supabase
        .from('proposal_details_templates')
        .select('*')
        .order('title');
      setDetailTemplates(detailsData || []);

      // Fetch active templates
      const { data: templatesData } = await supabase
        .from('proposal_templates')
        .select('*, items:proposal_template_items(*)')
        .eq('active', true)
        .order('title');
      setActiveTemplates(templatesData || []);

      // If Edit mode, load Proposal details
      if (isEdit) {
        // Fetch proposal
        const { data: prop, error: propErr } = await supabase
          .from('proposals')
          .select('*')
          .eq('id', id)
          .single();

        if (propErr) throw propErr;

        setProposalNumber(prop.number);
        setProposalSeq(prop.number_seq);
        setTitle(prop.title);
        setClientId(prop.client_id || '');
        setClientType(prop.client_type);
        setPricingType(prop.type);
        setStatus(prop.status);
        setTotalValue(prop.total_value);

        // Fetch proposal items (order by sequence)
        const { data: propItems } = await supabase
          .from('proposal_items')
          .select('*')
          .eq('proposal_id', id)
          .order('sequence');

        const initialGlobalApply = propItems && propItems.length > 0 ? propItems.some(i => i.apply_quantity) : true;
        setGlobalApplyQuantity(initialGlobalApply);

        setItems(
          (propItems || []).map((item) => ({
            id: item.id,
            service_id: item.service_id,
            description: item.description,
            quantity: item.quantity !== null ? item.quantity : '',
            unit_price: item.unit_price,
            apply_quantity: item.apply_quantity,
            subtotal: item.subtotal,
          }))
        );

        // Fetch proposal attached details (order by sequence)
        const { data: propDetails } = await supabase
          .from('proposal_details')
          .select('*')
          .eq('proposal_id', id)
          .order('sequence');

        setDetails(
          (propDetails || []).map((det) => ({
            id: det.id,
            template_id: det.template_id,
            title: det.title,
            content: det.content,
          }))
        );

        // Fetch proposal photos
        const { data: propPhotos } = await supabase
          .from('proposal_photos')
          .select('*')
          .eq('proposal_id', id);

        setPhotos(
          (propPhotos || []).map((ph) => ({
            id: ph.id,
            image_url: ph.image_url,
            description: ph.description || '',
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching proposal setup data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate sequential proposal number
  const handleStartSetup = async () => {
    try {
      setLoading(true);
      setClientType(setupClientType);
      setPricingType(setupPricingType);

      // Fetch max sequential number for this year
      const year = new Date().getFullYear().toString().slice(-2); // e.g. '26'
      const { data, error } = await supabase
        .from('proposals')
        .select('number_seq')
        .order('number_seq', { ascending: false })
        .limit(1);

      let nextSeq = 101; // Start at 101 for better presentation
      if (!error && data && data.length > 0) {
        nextSeq = data[0].number_seq + 1;
      }

      setProposalSeq(nextSeq);
      setProposalNumber(`${nextSeq}/${year}`);
      setShowSetup(false);
    } catch (err) {
      console.error('Error initiating proposal:', err);
    } finally {
      setLoading(false);
    }
  };

  // Re-calculate total value when items change
  useEffect(() => {
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    setTotalValue(total);
  }, [items]);

  // Image compressor utility using standard HTML Canvas
  const compressImageFile = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Limit dimensions to max 1200px
          const MAX_SIZE = 1200;
          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas blob conversion failed'));
              }
            },
            'image/jpeg',
            0.8
          );
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // File Upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploadingPhotos(true);

    try {
      const uploadedPhotos: ProposalPhotoState[] = [];
      const filesArray = Array.from(e.target.files);

      for (const file of filesArray) {
        // 1) Compress image
        const compressedBlob = await compressImageFile(file);
        const fileName = `${crypto.randomUUID()}.jpg`;

        // 2) Upload to Supabase bucket
        const { error: uploadError } = await supabase.storage
          .from('proposal_photos')
          .upload(fileName, compressedBlob, {
            contentType: 'image/jpeg',
          });

        if (uploadError) throw uploadError;

        // 3) Get public URL
        const { data: urlData } = supabase.storage
          .from('proposal_photos')
          .getPublicUrl(fileName);

        uploadedPhotos.push({
          id: crypto.randomUUID(),
          image_url: urlData.publicUrl,
          description: '',
        });
      }

      setPhotos((prev) => [...prev, ...uploadedPhotos]);
    } catch (err) {
      console.error('Error uploading photos:', err);
      showAlert('Failed to upload photos. Please try again.', 'Error', true);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handleUpdatePhotoDesc = (photoId: string, desc: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, description: desc } : p))
    );
  };

  // Details attachment handlers
  const handleAttachDetail = (template: DetailTemplate) => {
    const isAlreadyAttached = details.some((d) => d.template_id === template.id);
    if (isAlreadyAttached) {
      showAlert('This detail block is already attached.', 'Alert');
      return;
    }

    setDetails((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        template_id: template.id,
        title: template.title,
        content: template.content,
      },
    ]);
    setShowDetailsModal(false);
  };

  const handleRemoveDetail = (detailId: string) => {
    setDetails((prev) => prev.filter((d) => d.id !== detailId));
  };

  const handleUpdateDetailContent = (detailId: string, content: string) => {
    setDetails((prev) =>
      prev.map((d) => (d.id === detailId ? { ...d, content } : d))
    );
  };

  const handleToggleGlobalApplyQuantity = (checked: boolean) => {
    setGlobalApplyQuantity(checked);
    setItems((prev) =>
      prev.map((item) => {
        const qtyVal = checked ? (item.quantity === '' ? 1 : Number(item.quantity)) : '';
        const priceVal = item.unit_price;
        const subtotal = checked ? Number(qtyVal) * priceVal : priceVal;
        return {
          ...item,
          apply_quantity: checked,
          quantity: qtyVal,
          subtotal,
        };
      })
    );
  };

  // Price List item selection handler
  const handleAddPriceListItem = async (serviceId: string) => {
    if (!serviceId) return;

    // Check if service already added
    if (items.some((i) => i.service_id === serviceId)) {
      showAlert('This service is already added to the proposal.', 'Alert');
      return;
    }

    try {
      setLoading(true);
      // Fetch service template
      const { data: sItem, error } = await supabase
        .from('price_list_items')
        .select('*')
        .eq('id', serviceId)
        .single();

      if (error) throw error;

      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          service_id: sItem.id,
          description: sItem.description,
          quantity: globalApplyQuantity ? 1 : '',
          unit_price: 0, // Admin inputs custom contracted price
          apply_quantity: globalApplyQuantity,
          subtotal: 0,
        },
      ]);
    } catch (err) {
      console.error('Error adding price list item:', err);
    } finally {
      setLoading(false);
    }
  };

  // Custom Item Modal Add/Edit save handler
  const handleSaveCustomItem = () => {
    if (!customHtml.trim()) {
      showAlert('Description cannot be empty.', 'Validation Error');
      return;
    }

    if (customEditId) {
      // Editing existing custom item
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === customEditId) {
            const qtyVal = globalApplyQuantity ? (item.quantity === '' ? 1 : Number(item.quantity)) : '';
            const priceVal = customPrice;
            const subtotal = globalApplyQuantity ? Number(qtyVal) * priceVal : priceVal;

            return {
              ...item,
              description: customHtml,
              unit_price: priceVal,
              apply_quantity: globalApplyQuantity,
              quantity: qtyVal,
              subtotal,
            };
          }
          return item;
        })
      );
    } else {
      // Creating new custom item
      const qtyVal = globalApplyQuantity ? 1 : '';
      const subtotal = globalApplyQuantity ? 1 * customPrice : customPrice;

      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          service_id: null,
          description: customHtml,
          quantity: qtyVal,
          unit_price: customPrice,
          apply_quantity: globalApplyQuantity,
          subtotal,
        },
      ]);
    }

    // Reset and close
    setCustomEditId(null);
    setCustomHtml('');
    setCustomPrice(0);
    setShowCustomModal(false);
  };

  const handleOpenEditCustom = (item: ProposalItemState) => {
    setCustomEditId(item.id);
    setCustomHtml(item.description);
    setCustomPrice(item.unit_price);
    setShowCustomModal(true);
  };

  // Item input updates (Quantity, Price)
  const handleUpdateItemInput = (
    itemId: string,
    field: 'quantity' | 'unit_price',
    value: any
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          let qty = item.quantity;
          let price = item.unit_price;

          if (field === 'quantity') {
            qty = value === '' ? '' : Number(value);
          } else if (field === 'unit_price') {
            price = value === '' ? 0 : Number(value);
          }

          const multiplier = globalApplyQuantity ? (qty === '' ? 1 : Number(qty)) : 1;
          const subtotal = multiplier * price;

          return {
            ...item,
            quantity: qty,
            unit_price: price,
            apply_quantity: globalApplyQuantity,
            subtotal,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Drag and Drop Sort Handler for Services
  const handleDragEndItems = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // Template Import handler
  const handleOpenTemplateImport = (temp: Template) => {
    setSelectedTemplate(temp);
    const checks: Record<string, boolean> = {};
    if (temp.items) {
      temp.items.forEach((item) => {
        checks[item.id] = true;
      });
    }
    setTemplateItemChecks(checks);
  };

  const handleImportTemplate = () => {
    if (!selectedTemplate) return;

    const itemsToImport = (selectedTemplate.items || [])
      .filter((i) => templateItemChecks[i.id])
      .map((i) => ({
        id: crypto.randomUUID(),
        service_id: i.service_id,
        description: i.description,
        quantity: globalApplyQuantity ? (i.quantity !== null ? i.quantity : 1) : '',
        unit_price: i.unit_price,
        apply_quantity: globalApplyQuantity,
        subtotal: globalApplyQuantity
          ? (i.quantity !== null ? i.quantity : 1) * i.unit_price
          : i.unit_price,
      }));

    setItems((prev) => [...prev, ...itemsToImport]);

    // Close and reset
    setSelectedTemplate(null);
    setShowTemplateModal(false);
  };

  // Submit / Save Proposal
  const handleSaveProposal = async () => {
    if (!clientId) {
      showAlert('Please select a customer.', 'Validation Error');
      return;
    }

    if (items.length === 0) {
      showAlert('Please add at least one service item.', 'Validation Error');
      return;
    }

    try {
      setLoading(true);

      const proposalData = {
        number: proposalNumber,
        number_seq: proposalSeq,
        client_id: clientId,
        client_type: clientType,
        type: pricingType,
        title,
        status,
        total_value: totalValue,
        created_by: 'Admin', // Pull user context in production
        updated_at: new Date().toISOString(),
      };

      let proposalId = id;

      if (isEdit) {
        // Update Proposal
        const { error: propError } = await supabase
          .from('proposals')
          .update(proposalData)
          .eq('id', id);

        if (propError) throw propError;
      } else {
        // Insert Proposal
        const { data: newProp, error: propError } = await supabase
          .from('proposals')
          .insert({
            ...proposalData,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (propError) throw propError;
        proposalId = newProp.id;
      }

      // 1) Delete old child records (items, details, photos) if editing
      if (isEdit) {
        await supabase.from('proposal_items').delete().eq('proposal_id', id);
        await supabase.from('proposal_details').delete().eq('proposal_id', id);
        await supabase.from('proposal_photos').delete().eq('proposal_id', id);
      }

      // 2) Write current Proposal Items
      const itemsToInsert = items.map((item, idx) => ({
        proposal_id: proposalId,
        service_id: item.service_id,
        description: item.description,
        quantity: globalApplyQuantity ? (item.quantity === '' ? 1 : item.quantity) : null,
        unit_price: item.unit_price,
        apply_quantity: globalApplyQuantity,
        subtotal: item.subtotal,
        sequence: idx + 1,
      }));

      const { error: itemsError } = await supabase
        .from('proposal_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // 3) Write current Proposal Details
      const detailsToInsert = details.map((det, idx) => ({
        proposal_id: proposalId,
        template_id: det.template_id,
        title: det.title,
        content: det.content,
        sequence: idx + 1,
      }));

      if (detailsToInsert.length > 0) {
        const { error: detailsError } = await supabase
          .from('proposal_details')
          .insert(detailsToInsert);

        if (detailsError) throw detailsError;
      }

      // 4) Write current Proposal Photos
      const photosToInsert = photos.map((ph) => ({
        proposal_id: proposalId,
        image_url: ph.image_url,
        description: ph.description,
      }));

      if (photosToInsert.length > 0) {
        const { error: photosError } = await supabase
          .from('proposal_photos')
          .insert(photosToInsert);

        if (photosError) throw photosError;
      }

      // 5) Sync Client Services if Approved
      if (status === 'approved') {
        // Clear previous client services linked to this proposal
        await supabase
          .from('client_services')
          .delete()
          .eq('proposal_id', proposalId);

        // Insert new ones
        const clientServicesToInsert = items.map((item) => ({
          client_id: clientId,
          proposal_id: proposalId,
          service_id: item.service_id,
          description: item.description,
          unit_price: item.unit_price,
          apply_quantity: globalApplyQuantity,
        }));

        const { error: syncError } = await supabase
          .from('client_services')
          .insert(clientServicesToInsert);

        if (syncError) throw syncError;

        // Audit Log
        await supabase.from('client_service_logs').insert({
          client_id: clientId,
          action: 'proposal_approved',
          changed_by: 'Admin',
          details: `Approved Proposal ${proposalNumber} adding ${items.length} contracted services`,
        });
      } else {
        // If status changed away from Approved, remove services
        await supabase
          .from('client_services')
          .delete()
          .eq('proposal_id', proposalId);
      }

      navigate('/admin/proposals');
    } catch (err) {
      console.error('Error saving proposal:', err);
      showAlert('Failed to save proposal. Check console for error logs.', 'Error', true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent relative">
      
      {/* 1. INITIAL WIZARD SETUP OVERLAY */}
      {showSetup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-8 max-w-md w-full space-y-6 animate-slide-up text-left">
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">New Proposal Setup</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">Specify proposal characteristics below to start editing.</p>
            </div>

            {/* Client Type Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Client Type</label>
              <div className="grid grid-cols-2 gap-2.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => setSetupClientType('commercial')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                    setupClientType === 'commercial' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Commercial
                </button>
                <button
                  type="button"
                  onClick={() => setSetupClientType('residential')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                    setupClientType === 'residential' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Residential
                </button>
              </div>
            </div>

            {/* Pricing Type Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Pricing Type</label>
              <div className="grid grid-cols-2 gap-2.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => setSetupPricingType('price_list')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                    setupPricingType === 'price_list' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Price List
                </button>
                <button
                  type="button"
                  onClick={() => setSetupPricingType('custom')}
                  className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                    setupPricingType === 'custom' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/admin/proposals')}
                className="flex-1 py-3 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-2xl cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSetup}
                className="flex-1 py-3 px-4 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl cursor-pointer shadow-md shadow-primary/20 transition-all"
              >
                Start Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER ACTION BAR */}
      <div className="flex items-center justify-between pb-5 shrink-0 bg-transparent border-b border-slate-200/50">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            {isEdit ? `Edit Proposal` : `New Proposal`}
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            Proposal ID: <span className="text-slate-700 font-black">{proposalNumber || 'Drafting...'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/admin/proposals')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProposal}
            disabled={loading}
            className="px-5 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-2xl shadow-md shadow-primary/20 hover:shadow-lg active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            <span>SAVE PROPOSAL</span>
          </button>
        </div>
      </div>

      {/* FORM WORKSPACE BODY */}
      <div className="flex-1 overflow-y-auto pt-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT: GENERAL DETAILS CARD */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* General Info */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">General Info</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client selection */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Customer</label>
                  <SearchableDropdown
                    value={clientId}
                    onChange={(val) => setClientId(val)}
                    placeholder="Select client..."
                    options={clients.map((c) => ({ label: c.name, value: c.id }))}
                    className="w-full"
                  />
                </div>

                {/* Proposal status */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">Status</label>
                  <SearchableDropdown
                    value={status}
                    onChange={(val) => setStatus(val as any)}
                    placeholder="Select status..."
                    options={[
                      { label: 'Pending', value: 'pending' },
                      { label: 'Approved', value: 'approved' },
                      { label: 'Declined', value: 'declined' },
                    ]}
                    className="w-full"
                  />
                </div>

                {/* Title */}
                <div className="col-span-1 md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-500">Proposal Title</label>
                  <input
                    type="text"
                    placeholder="Enter proposal title..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-slate-200 focus:border-primary rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            {/* SERVICES ITEMS CARD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-4">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Services List</h2>
                  <div className="flex items-center gap-2 bg-transparent select-none">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">APPLY QUANT</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={globalApplyQuantity}
                        onChange={(e) => handleToggleGlobalApplyQuantity(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
                      <div className="absolute left-0 -top-[3px] w-5 h-5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[20px] peer-checked:bg-primary peer-checked:border-primary"></div>
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl active:scale-98 transition-all cursor-pointer"
                  >
                    Import Template
                  </button>
                  {pricingType === 'custom' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomEditId(null);
                        setCustomHtml('');
                        setCustomPrice(0);
                        setShowCustomModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-xl active:scale-98 transition-all cursor-pointer"
                    >
                      Add Custom Item
                    </button>
                  ) : (
                    <SearchableDropdown
                      value=""
                      placeholder="+ Add Service..."
                      options={services.map((s) => ({ label: s.description, value: s.id }))}
                      onChange={(val) => {
                        if (val) handleAddPriceListItem(val);
                      }}
                      className="w-80 text-left"
                    />
                  )}
                </div>
              </div>

              {/* Items Sortable List */}
              {items.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center">
                  <svg className="w-10 h-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <p className="text-xs font-extrabold text-slate-500">No services added yet</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Use the selectors above to insert items or import templates.</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndItems}>
                  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {items.map((item, idx) => (
                        <SortableRow
                          key={item.id}
                          id={item.id}
                          item={item}
                          index={idx + 1}
                          onEditCustom={handleOpenEditCustom}
                          onRemove={handleRemoveItem}
                          onUpdateField={handleUpdateItemInput}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Items Sum Subtotal */}
              {items.length > 0 && (
                <div className="border-t border-slate-100 pt-4 flex justify-end items-center gap-3">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Total Value:</span>
                  <span className="text-lg font-black text-slate-800">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: DETAILS SNAPSHOTS & PHOTOS GALLERY */}
          <div className="space-y-6 lg:sticky lg:top-0 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto pr-1.5 scrollbar-thin">
            
            {/* DETAILS ATTACHMENT CARD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Proposal Details</h2>
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(true)}
                  className="text-xs font-black text-primary hover:underline cursor-pointer"
                >
                  + Attach text
                </button>
              </div>

              {details.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold py-3 text-center">No details text blocks attached.</p>
              ) : (
                <div className="space-y-4">
                  {details.map((det) => (
                    <div key={det.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative space-y-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveDetail(det.id)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <p className="text-xs font-black text-slate-700 pr-6 uppercase tracking-wider">{det.title}</p>
                      <textarea
                        value={det.content}
                        onChange={(e) => handleUpdateDetailContent(det.id, e.target.value)}
                        className="w-full text-xs text-slate-500 font-medium bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-primary resize-none h-24"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PHOTO GALLERY ATTACHMENTS CARD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <div className="border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Photo Attachments</h2>
              </div>

              {/* Drag/Drop Image Input */}
              <div className="border-2 border-dashed border-slate-200 hover:border-primary rounded-2xl p-5 text-center transition-colors relative cursor-pointer group bg-slate-50/50">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                  <svg className="w-8 h-8 text-slate-400 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <p className="text-xs font-black text-slate-700">Upload multiple photos</p>
                  <p className="text-[10px] text-slate-400">Images will be automatically compressed.</p>
                </div>
              </div>

              {/* Upload Loader */}
              {uploadingPhotos && (
                <div className="flex items-center justify-center py-4 gap-2 border border-slate-100 bg-slate-50/50 rounded-2xl">
                  <span className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-xs text-primary font-bold">Compressing & uploading photos...</span>
                </div>
              )}

              {/* Photos List */}
              {photos.length > 0 && (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {photos.map((photo) => (
                    <div key={photo.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex gap-3 relative">
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(photo.id)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <img
                        src={photo.image_url}
                        alt="attachment"
                        className="w-16 h-16 object-cover border border-slate-200 rounded-xl bg-white shrink-0"
                      />
                      <div className="flex-1 pr-6 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Photo Caption</label>
                        <input
                          type="text"
                          placeholder="Add caption details..."
                          value={photo.description}
                          onChange={(e) => handleUpdatePhotoDesc(photo.id, e.target.value)}
                          className="w-full text-xs text-slate-600 font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* 2. RICH TEXT MODAL (FOR CUSTOM SERVICES) */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 max-w-2xl w-full space-y-5 animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                {customEditId ? 'Edit Custom Description' : 'Add Custom Description'}
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Rich Text Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Description</label>
              <RichTextEditor value={customHtml} onChange={setCustomHtml} />
            </div>

            {/* Unit Price */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Unit Price / Value</label>
              <input
                type="number"
                placeholder="0.00"
                value={customPrice || ''}
                onChange={(e) => setCustomPrice(Number(e.target.value))}
                className="w-full border border-slate-200 focus:border-primary rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none bg-white transition-all font-semibold"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomItem}
                className="py-2.5 px-5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-xl shadow-md shadow-primary/20 hover:shadow-lg transition-all cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ATTACH DETAILS MODAL */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 max-w-lg w-full space-y-4 animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider">Select Detail Block</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailTemplates.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No details templates registered.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {detailTemplates.map((temp) => (
                  <button
                    key={temp.id}
                    type="button"
                    onClick={() => handleAttachDetail(temp)}
                    className="w-full p-4 border border-slate-200 hover:border-primary/50 hover:bg-slate-50/50 rounded-2xl text-left transition-all space-y-1.5 cursor-pointer flex flex-col"
                  >
                    <span className="text-sm font-extrabold text-slate-700 uppercase tracking-wider">{temp.title}</span>
                    <span className="text-[12px] text-slate-400 font-medium line-clamp-2 leading-relaxed">{temp.content}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. IMPORT TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 max-w-xl w-full space-y-4 animate-slide-up text-left flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">Import Template</h3>
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setShowTemplateModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Template Selector / Checklist view */}
            <div className="flex-1 overflow-y-auto py-2 space-y-4">
              {!selectedTemplate ? (
                activeTemplates.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No active templates found.</p>
                ) : (
                  <div className="space-y-2">
                    {activeTemplates.map((temp) => (
                      <button
                        key={temp.id}
                        type="button"
                        onClick={() => handleOpenTemplateImport(temp)}
                        className="w-full p-4 border border-slate-200 hover:border-primary/50 hover:bg-slate-50/50 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-black text-slate-700 uppercase tracking-wider">{temp.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                            {temp.items?.length || 0} services
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className="text-xs font-black text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    <span>Back to Templates</span>
                  </button>

                  <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-wider">{selectedTemplate.title}</p>
                    {/* Select/Unselect All */}
                    <button
                      type="button"
                      onClick={() => {
                        const allChecked = Object.values(templateItemChecks).every(Boolean);
                        const newChecks: Record<string, boolean> = {};
                        selectedTemplate.items?.forEach((i) => {
                          newChecks[i.id] = !allChecked;
                        });
                        setTemplateItemChecks(newChecks);
                      }}
                      className="text-[10px] font-black text-primary hover:underline cursor-pointer"
                    >
                      {Object.values(templateItemChecks).every(Boolean) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {/* Checklist of Services */}
                  <div className="space-y-2 border border-slate-100 rounded-2xl p-4 bg-white max-h-[250px] overflow-y-auto">
                    {selectedTemplate.items?.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!templateItemChecks[item.id]}
                          onChange={(e) =>
                            setTemplateItemChecks((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 text-primary border-slate-300 focus:ring-primary rounded cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Supports html descriptions for Custom template items */}
                          <div
                            className="text-xs font-extrabold text-slate-800 truncate"
                            dangerouslySetInnerHTML={{ __html: item.description }}
                          />
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                            Price: ${item.unit_price.toFixed(2)}{' '}
                            {item.apply_quantity && `| Qty: ${item.quantity}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplate(null);
                  setShowTemplateModal(false);
                }}
                className="py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={handleImportTemplate}
                  className="py-2.5 px-5 bg-primary hover:bg-primary/95 text-white text-xs font-black rounded-xl shadow-md shadow-primary/20 hover:shadow-lg transition-all cursor-pointer"
                >
                  Import Selected
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmLabel="OK"
        showCancel={false}
        onConfirm={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
        isDestructive={alertConfig.isDestructive}
      />
    </div>
  );
}

// SORTABLE ROW COMPONENT
interface SortableRowProps {
  id: string;
  item: ProposalItemState;
  index: number;
  onEditCustom: (item: ProposalItemState) => void;
  onRemove: (itemId: string) => void;
  onUpdateField: (itemId: string, field: 'quantity' | 'unit_price', value: any) => void;
}

function SortableRow({
  id,
  item,
  index,
  onEditCustom,
  onRemove,
  onUpdateField,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 bg-slate-50/70 border border-slate-200/60 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
        isDragging ? 'shadow-lg border-primary/20 scale-[1.01]' : 'hover:border-slate-300/80'
      }`}
    >
      {/* Drag & Number indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          {...attributes}
          {...listeners}
          className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-grab active:cursor-grabbing"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5" />
          </svg>
        </div>
        <span className="w-5.5 h-5.5 rounded-full bg-slate-200 text-slate-700 font-black text-[11px] flex items-center justify-center shrink-0">
          {index}
        </span>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0 pr-4">
        {item.service_id ? (
          // Price List Item Description (plain text)
          <p className="text-sm font-black text-slate-800 leading-relaxed truncate">{item.description}</p>
        ) : (
          // Custom Rich Text Description (rendered HTML)
          <div className="flex items-center gap-2">
            <div
              className="text-sm font-black text-slate-855 leading-relaxed truncate max-w-md"
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
            <button
              type="button"
              onClick={() => onEditCustom(item)}
              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all cursor-pointer shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Input parameters */}
      <div className="flex flex-wrap items-center gap-4 shrink-0 md:justify-end">
        {/* Quantity (if applies) */}
        {item.apply_quantity && (
          <div className="w-20 flex flex-col gap-0.5">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Qty</span>
            <input
              type="number"
              placeholder="1"
              value={item.quantity}
              onChange={(e) => onUpdateField(item.id, 'quantity', e.target.value)}
              className="w-full border border-slate-200 focus:border-primary rounded-xl px-3 py-1.5 text-sm text-slate-800 text-left focus:outline-none bg-white font-extrabold"
            />
          </div>
        )}

        {/* Unit Price */}
        <div className="w-32 flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Unit Price</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={item.unit_price || ''}
              onChange={(e) => onUpdateField(item.id, 'unit_price', e.target.value)}
              className="w-full border border-slate-200 focus:border-primary rounded-xl pl-6 pr-3 py-1.5 text-sm text-slate-800 text-left focus:outline-none bg-white font-extrabold"
            />
          </div>
        </div>

        {/* Item Subtotal value */}
        <div className="min-w-[80px] text-left flex flex-col gap-0.5 pr-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Subtotal</span>
          <span className="text-sm font-black text-slate-800">${item.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="p-1.5 hover:bg-slate-200/80 rounded-xl text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

    </div>
  );
}
