import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { RichTextEditor } from '../../components/ui/RichTextEditor';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';

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

interface ServiceTemplate {
  id: string;
  description: string;
}

interface DetailTemplate {
  id: string;
  title: string;
  content: string;
}

interface TemplateItemState {
  id: string;
  service_id: string | null;
  description: string;
  quantity: number | '';
  unit_price: number;
  apply_quantity: boolean;
  subtotal: number;
}

interface TemplateDetailState {
  id: string;
  template_detail_id: string | null;
  title: string;
  content: string;
}

export function TemplateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Main Template States
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<TemplateItemState[]>([]);
  const [details, setDetails] = useState<TemplateDetailState[]>([]);

  // Selectors list
  const [services, setServices] = useState<ServiceTemplate[]>([]);
  const [detailTemplates, setDetailTemplates] = useState<DetailTemplate[]>([]);

  // Modals & Loaders
  const [loading, setLoading] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Edit custom service item state
  const [customEditId, setCustomEditId] = useState<string | null>(null);
  const [customHtml, setCustomHtml] = useState('');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customApplyQuant, setCustomApplyQuant] = useState(true);

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // Fetch Services templates
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

      // Load Template if Edit Mode
      if (isEdit) {
        const { data: temp, error: tempErr } = await supabase
          .from('proposal_templates')
          .select('*')
          .eq('id', id)
          .single();

        if (tempErr) throw tempErr;

        setTitle(temp.title);

        // Fetch template items
        const { data: tempItems } = await supabase
          .from('proposal_template_items')
          .select('*')
          .eq('template_id', id)
          .order('sequence');

        setItems(
          (tempItems || []).map((item) => ({
            id: item.id,
            service_id: item.service_id,
            description: item.description,
            quantity: item.quantity !== null ? item.quantity : '',
            unit_price: item.unit_price,
            apply_quantity: item.apply_quantity,
            subtotal: item.apply_quantity
              ? (item.quantity !== null ? item.quantity : 1) * item.unit_price
              : item.unit_price,
          }))
        );

        // Fetch template details
        const { data: tempDetails } = await supabase
          .from('proposal_template_details')
          .select('*')
          .eq('template_id', id)
          .order('sequence');

        setDetails(
          (tempDetails || []).map((det) => ({
            id: det.id,
            template_detail_id: det.template_detail_id,
            title: det.title,
            content: det.content,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching template setup data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add Price List Item
  const handleAddPriceListItem = async (serviceId: string) => {
    if (!serviceId) return;

    if (items.some((i) => i.service_id === serviceId)) {
      alert('This service is already added.');
      return;
    }

    try {
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
          quantity: 1,
          unit_price: 0,
          apply_quantity: true,
          subtotal: 0,
        },
      ]);
    } catch (err) {
      console.error('Error adding price list item:', err);
    }
  };

  // Add/Edit custom rich text item save
  const handleSaveCustomItem = () => {
    if (!customHtml.trim()) {
      alert('Description cannot be empty.');
      return;
    }

    if (customEditId) {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === customEditId) {
            const qtyVal = customApplyQuant ? (item.quantity === '' ? 1 : Number(item.quantity)) : '';
            const priceVal = customPrice;
            const subtotal = customApplyQuant ? Number(qtyVal) * priceVal : priceVal;

            return {
              ...item,
              description: customHtml,
              unit_price: priceVal,
              apply_quantity: customApplyQuant,
              quantity: qtyVal,
              subtotal,
            };
          }
          return item;
        })
      );
    } else {
      const qtyVal = customApplyQuant ? 1 : '';
      const subtotal = customApplyQuant ? 1 * customPrice : customPrice;

      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          service_id: null,
          description: customHtml,
          quantity: qtyVal,
          unit_price: customPrice,
          apply_quantity: customApplyQuant,
          subtotal,
        },
      ]);
    }

    // Reset and close
    setCustomEditId(null);
    setCustomHtml('');
    setCustomPrice(0);
    setCustomApplyQuant(true);
    setShowCustomModal(false);
  };

  const handleOpenEditCustom = (item: TemplateItemState) => {
    setCustomEditId(item.id);
    setCustomHtml(item.description);
    setCustomPrice(item.unit_price);
    setCustomApplyQuant(item.apply_quantity);
    setShowCustomModal(true);
  };

  // Update item field inputs
  const handleUpdateItemInput = (
    itemId: string,
    field: 'quantity' | 'unit_price' | 'apply_quantity',
    value: any
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          let qty = item.quantity;
          let price = item.unit_price;
          let applyQuant = item.apply_quantity;

          if (field === 'quantity') {
            qty = value === '' ? '' : Number(value);
          } else if (field === 'unit_price') {
            price = Number(value);
          } else if (field === 'apply_quantity') {
            applyQuant = !!value;
            qty = applyQuant ? (qty === '' ? 1 : qty) : '';
          }

          const multiplier = applyQuant ? (qty === '' ? 1 : Number(qty)) : 1;
          const subtotal = multiplier * price;

          return {
            ...item,
            quantity: qty,
            unit_price: price,
            apply_quantity: applyQuant,
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

  const handleDragEndItems = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // Details template attach
  const handleAttachDetail = (template: DetailTemplate) => {
    const isAlreadyAttached = details.some((d) => d.template_detail_id === template.id);
    if (isAlreadyAttached) {
      alert('This detail block is already attached.');
      return;
    }

    setDetails((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        template_detail_id: template.id,
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

  // Submit Save Template
  const handleSaveTemplate = async () => {
    if (!title.trim()) {
      alert('Template Title is required.');
      return;
    }

    if (items.length === 0) {
      alert('Please add at least one service item.');
      return;
    }

    try {
      setLoading(true);

      const templateData = {
        title,
        updated_at: new Date().toISOString(),
      };

      let templateId = id;

      if (isEdit) {
        // Update template
        const { error: tempErr } = await supabase
          .from('proposal_templates')
          .update(templateData)
          .eq('id', id);

        if (tempErr) throw tempErr;
      } else {
        // Insert template
        const { data: newTemp, error: tempErr } = await supabase
          .from('proposal_templates')
          .insert({
            ...templateData,
            created_at: new Date().toISOString(),
            active: true,
          })
          .select('id')
          .single();

        if (tempErr) throw tempErr;
        templateId = newTemp.id;
      }

      // Delete old child records if editing
      if (isEdit) {
        await supabase.from('proposal_template_items').delete().eq('template_id', id);
        await supabase.from('proposal_template_details').delete().eq('template_id', id);
      }

      // Insert template items
      const itemsToInsert = items.map((item, idx) => ({
        template_id: templateId,
        service_id: item.service_id,
        description: item.description,
        quantity: item.quantity === '' ? null : item.quantity,
        unit_price: item.unit_price,
        apply_quantity: item.apply_quantity,
        sequence: idx + 1,
      }));

      const { error: itemsError } = await supabase
        .from('proposal_template_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Insert template details
      const detailsToInsert = details.map((det, idx) => ({
        template_id: templateId,
        template_detail_id: det.template_detail_id,
        title: det.title,
        content: det.content,
        sequence: idx + 1,
      }));

      if (detailsToInsert.length > 0) {
        const { error: detailsError } = await supabase
          .from('proposal_template_details')
          .insert(detailsToInsert);

        if (detailsError) throw detailsError;
      }

      navigate('/admin/proposals/templates');
    } catch (err: any) {
      console.error('Error saving template:', err);
      if (err.code === '23505') {
        alert('A template with this title already exists. Please choose a unique title.');
      } else {
        alert('Failed to save template. Check browser console logs.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent relative select-none">
      
      {/* HEADER BAR */}
      <div className="flex items-center justify-between pb-5 shrink-0 bg-transparent border-b border-slate-200/50">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            {isEdit ? `Edit Template` : `New Template`}
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">Define reusable proposal baselines.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/admin/proposals/templates')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTemplate}
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
            <span>SAVE TEMPLATE</span>
          </button>
        </div>
      </div>

      {/* FORM WORKSPACE BODY */}
      <div className="flex-1 overflow-y-auto pt-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT: TEMPLATE INFO AND SERVICES */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Title Info Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">General Info</h2>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Template Title</label>
                <input
                  type="text"
                  placeholder="Enter unique template title (e.g. Standard Exterior Painting)..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-200 focus:border-primary rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none bg-white transition-all"
                />
              </div>
            </div>

            {/* SERVICES BUILDER CARD */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Template Services</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomEditId(null);
                      setCustomHtml('');
                      setCustomPrice(0);
                      setCustomApplyQuant(true);
                      setShowCustomModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold rounded-xl active:scale-98 transition-all cursor-pointer"
                  >
                    Add Custom Item
                  </button>
                  <SearchableDropdown
                    value=""
                    placeholder="+ Add Service..."
                    options={services.map((s) => ({ label: s.description, value: s.id }))}
                    onChange={(val) => {
                      if (val) handleAddPriceListItem(val);
                    }}
                    className="w-52 text-left"
                  />
                </div>
              </div>

              {/* Items List */}
              {items.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center">
                  <svg className="w-10 h-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-xs font-extrabold text-slate-500">No template services added yet</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Add composite services or custom text blocks above.</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndItems}>
                  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {items.map((item, idx) => (
                        <SortableTemplateRow
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
            </div>

          </div>

          {/* RIGHT: DETAILS SNAPSHOTS CARD */}
          <div className="space-y-6">
            
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Template Details</h2>
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(true)}
                  className="text-xs font-black text-primary hover:underline cursor-pointer"
                >
                  + Attach text
                </button>
              </div>

              {details.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold py-3 text-center">No details templates attached.</p>
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

          </div>

        </div>
      </div>

      {/* RICH TEXT MODAL (FOR CUSTOM ITEMS) */}
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

            <div className="grid grid-cols-2 gap-4">
              {/* Unit Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Unit Price</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={customPrice || ''}
                  onChange={(e) => setCustomPrice(Number(e.target.value))}
                  className="w-full border border-slate-200 focus:border-primary rounded-xl px-3.5 py-2 text-sm text-slate-700 focus:outline-none bg-white transition-all"
                />
              </div>

              {/* Apply Quant Toggle */}
              <div className="flex items-center justify-between pt-6">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">APPLY QUANT</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={customApplyQuant}
                    onChange={(e) => setCustomApplyQuant(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
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

      {/* ATTACH DETAILS MODAL */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 max-w-md w-full space-y-4 animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">Select Detail Block</h3>
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
              <p className="text-xs text-slate-400 py-4 text-center">No details templates registered.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {detailTemplates.map((temp) => (
                  <button
                    key={temp.id}
                    type="button"
                    onClick={() => handleAttachDetail(temp)}
                    className="w-full p-4 border border-slate-200 hover:border-primary/50 hover:bg-slate-50/50 rounded-2xl text-left transition-all space-y-1.5 cursor-pointer flex flex-col"
                  >
                    <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">{temp.title}</span>
                    <span className="text-[10px] text-slate-400 font-medium line-clamp-2 leading-relaxed">{temp.content}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// SORTABLE ROW COMPONENT FOR TEMPLATES
interface SortableTemplateRowProps {
  id: string;
  item: TemplateItemState;
  index: number;
  onEditCustom: (item: TemplateItemState) => void;
  onRemove: (itemId: string) => void;
  onUpdateField: (itemId: string, field: 'quantity' | 'unit_price' | 'apply_quantity', value: any) => void;
}

function SortableTemplateRow({
  id,
  item,
  index,
  onEditCustom,
  onRemove,
  onUpdateField,
}: SortableTemplateRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 hover:border-slate-200 rounded-2xl gap-4 select-none relative"
    >
      {/* drag handle & index */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div {...attributes} {...listeners} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5" />
          </svg>
        </div>
        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 font-extrabold text-[10px] flex items-center justify-center shrink-0">
          {index}
        </span>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0 pr-4">
        {item.service_id ? (
          <p className="text-xs font-extrabold text-slate-800 leading-relaxed truncate">{item.description}</p>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="text-xs font-extrabold text-slate-800 leading-relaxed truncate max-w-md"
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

      {/* Inputs */}
      <div className="flex flex-wrap items-center gap-4 shrink-0 md:justify-end">
        {/* Toggle APPLY QUANT */}
        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 border border-slate-100 rounded-xl">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">APPLY QUANT</span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={item.apply_quantity}
              onChange={(e) => onUpdateField(item.id, 'apply_quantity', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        {/* Qty (if applicable) */}
        {item.apply_quantity && (
          <div className="w-16 flex flex-col gap-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Qty</span>
            <input
              type="number"
              placeholder="1"
              value={item.quantity}
              onChange={(e) => onUpdateField(item.id, 'quantity', e.target.value)}
              className="w-full border border-slate-200 focus:border-primary rounded-xl px-2 py-1 text-xs text-slate-700 text-center focus:outline-none bg-white font-extrabold"
            />
          </div>
        )}

        {/* Unit Price */}
        <div className="w-20 flex flex-col gap-0.5">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Unit Price</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={item.unit_price || ''}
              onChange={(e) => onUpdateField(item.id, 'unit_price', e.target.value)}
              className="w-full border border-slate-200 focus:border-primary rounded-xl pl-5 pr-2 py-1 text-xs text-slate-700 text-center focus:outline-none bg-white font-extrabold"
            />
          </div>
        </div>

        {/* Subtotal */}
        <div className="min-w-[60px] text-right flex flex-col gap-0.5 pr-2">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Subtotal</span>
          <span className="text-xs font-black text-slate-800">${item.subtotal.toFixed(2)}</span>
        </div>

        {/* Remove */}
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
