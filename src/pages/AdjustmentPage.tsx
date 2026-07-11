import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../services/supabase';
import { saveAdjustment, getAdjustments, deleteAdjustment } from '../services/db';
import { enqueueAdjustment, processQueue, getPendingAdjustments, dequeueAdjustment } from '../services/syncQueue';
import { compressImage } from '../services/chatMedia';
import type { AdjustmentRequest } from '../types';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

// Helper to calculate ISO Week and Year
function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const tempDate = new Date(date.valueOf());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const week = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const year = tempDate.getFullYear();
  return { week, year };
}

// Helper to get ISO Week date range (Monday - Sunday) in "7/06/26 - 7/12/26" format
function getISOWeekRange(date: Date): string {
  const current = new Date(date.getTime());
  const day = current.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(current.getTime());
  monday.setDate(current.getDate() + distanceToMonday);

  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (dt: Date) => {
    const m = dt.getMonth() + 1; // no padding
    const d = String(dt.getDate()).padStart(2, '0'); // padded
    const y = String(dt.getFullYear()).slice(-2); // two-digit year
    return `${m}/${d}/${y}`;
  };

  return `${formatDate(monday)} - ${formatDate(sunday)}`;
}

interface WeekOption {
  code: string;
  range: string;
}

// Generate the last count weeks dynamically as objects
function generateRecentWeeks(count = 6): WeekOption[] {
  const list: WeekOption[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const { week, year } = getISOWeekAndYear(d);
    const padWeek = String(week).padStart(2, '0');
    const padYear = String(year).slice(-2); // two digits
    list.push({
      code: `${padWeek}/${padYear}`,
      range: getISOWeekRange(d)
    });
  }
  return list;
}

const QUICK_STORES = [
  'FLOOR DECOR',
  'GAS STATION',
  'LOWES',
  'OTHERS',
  'SHERWIN WILLIAMS',
  'THE HOME DEPOT',
];

interface WeekPopoverProps {
  weeks: WeekOption[];
  value: string;
  onChange: (code: string, range: string) => void;
}

function WeekPopover({ weeks, value, onChange }: WeekPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  const selectedOption = weeks.find((w) => w.code === value);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {selectedOption ? `Week ${selectedOption.code} (${selectedOption.range})` : 'Select invoice week'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-slideDown max-h-60 overflow-y-auto">
          {weeks.map((w) => (
            <button
              key={w.code}
              type="button"
              onClick={() => {
                onChange(w.code, w.range);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-5 py-3.5 text-left text-sm font-medium transition-colors hover:bg-gray-50 ${
                value === w.code ? 'text-primary-dark bg-primary/5' : 'text-gray-700'
              }`}
            >
              <span>Week {w.code} <span className="text-gray-400 font-normal">({w.range})</span></span>
              {value === w.code && (
                <svg className="w-4 h-4 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function AdjustmentPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [store, setStore] = useState('');
  const [customStore, setCustomStore] = useState('');
  const [isCustomStoreActive, setIsCustomStoreActive] = useState(false);
  const [invoiceCode, setInvoiceCode] = useState('');
  const [qualInvoiceData, setQualInvoiceData] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // General State
  const [adjustments, setAdjustments] = useState<AdjustmentRequest[]>([]);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals for receipts
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);
  const [activeReceiptBlob, setActiveReceiptBlob] = useState<Blob | null>(null);
  const [receiptModalTitle, setReceiptModalTitle] = useState('');

  // Deletion State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [adjustmentToDelete, setAdjustmentToDelete] = useState<AdjustmentRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const weeksList = useMemo(() => generateRecentWeeks(8), []);

  // Fetch adjustments
  const loadAdjustments = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      // 1) Load from local DB cache
      const cached = await getAdjustments();
      const filteredCached = cached.filter((a) => a.worker_email === user.email);
      setAdjustments(
        filteredCached.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
      const pendingQueue = await getPendingAdjustments();
      setQueueItems(pendingQueue);
      setLoading(false);

      // 2) If online, fetch fresh data from Supabase
      if (isOnline) {
        const { data, error } = await supabase
          .from('adjustments')
          .select('*')
          .eq('worker_email', user.email)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const fetched: AdjustmentRequest[] = data.map((d: any) => ({
            id: d.id,
            worker_email: d.worker_email,
            date: d.date,
            description: d.description,
            value: Number(d.value),
            store: d.store,
            invoice_code: d.invoice_code,
            qual_invoice_data: d.qual_invoice_data || undefined,
            image_url: d.image_url || undefined,
            paid: d.paid,
            payment_receipt_url: d.payment_receipt_url || undefined,
            bubble_id: d.bubble_id || undefined,
            created_at: d.created_at,
            synced: true,
          }));

          // Merge fetched items into IndexedDB cache (preserves local unsynced ones)
          for (const item of fetched) {
            await saveAdjustment(item);
          }

          // Reload from IndexedDB to get merged list
          const merged = await getAdjustments();
          const filteredMerged = merged.filter((a) => a.worker_email === user.email);
          setAdjustments(
            filteredMerged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          );
          const freshPending = await getPendingAdjustments();
          setQueueItems(freshPending);
        }
      }
    } catch (err: any) {
      console.error('Failed to load adjustments:', err);
      setErrorMsg('Failed to sync adjustments list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdjustments();
  }, [user?.email, isOnline]);

  // Clean up image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Handle image selection
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMsg('');
      const compressed = await compressImage(file);
      setImageBlob(compressed);

      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      const url = URL.createObjectURL(compressed);
      setImagePreviewUrl(url);
    } catch (err) {
      console.error('Error compressing image:', err);
      setErrorMsg('Failed to process image. Make sure it is a valid format.');
    }
  };

  // Handle Quick Select Store
  const handleStoreSelect = (selectedStore: string) => {
    if (selectedStore === 'OTHERS') {
      setIsCustomStoreActive(true);
      setStore('');
    } else {
      setIsCustomStoreActive(false);
      setStore(selectedStore);
      setCustomStore('');
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;

    const finalStore = isCustomStoreActive ? customStore.trim() : store;

    // Validation
    if (!invoiceCode) {
      setErrorMsg('Please select the invoice week.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please enter a description.');
      return;
    }
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      setErrorMsg('Please enter a valid amount.');
      return;
    }
    if (!finalStore) {
      setErrorMsg('Please specify the store.');
      return;
    }
    if (!imageBlob) {
      setErrorMsg('Please upload a receipt image.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const adjustmentId = generateUUID();
      const newAdjustment: AdjustmentRequest = {
        id: adjustmentId,
        worker_email: user.email,
        date,
        description: description.trim(),
        value: Number(value),
        store: finalStore,
        invoice_code: invoiceCode,
        qual_invoice_data: qualInvoiceData || undefined,
        paid: false,
        created_at: new Date().toISOString(),
        synced: false,
        local_image_blob: imageBlob,
      };

      // 1) Save local cache
      await saveAdjustment(newAdjustment);

      // 2) Enqueue inside syncQueue for offline-first syncing
      await enqueueAdjustment(newAdjustment);

      // 3) Update local UI list immediately (optimistic UI)
      setAdjustments((prev) => [newAdjustment, ...prev]);

      // Clear Form
      setDescription('');
      setValue('');
      setStore('');
      setCustomStore('');
      setIsCustomStoreActive(false);
      setInvoiceCode('');
      setQualInvoiceData('');
      setImageBlob(null);
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';

      setSuccessMsg('Adjustment saved! Syncing in background...');

      // 4) Proactively trigger sync processor
      if (isOnline) {
        processQueue().then(() => {
          loadAdjustments(); // Refresh list to get final URLs
        });
      }
    } catch (err: any) {
      console.error('Failed to submit adjustment:', err);
      setErrorMsg('Error saving adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAdjustment = async () => {
    if (!adjustmentToDelete) return;
    const adj = adjustmentToDelete;
    setDeleteConfirmOpen(false);
    setDeletingId(adj.id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (!adj.synced) {
        // 1) Offline/unsynced deletion: remove from queue and cache
        await dequeueAdjustment(adj.id);
        await deleteAdjustment(adj.id);
        setAdjustments((prev) => prev.filter((a) => a.id !== adj.id));
        setSuccessMsg('Adjustment deleted locally.');
      } else {
        // 2) Synced deletion: requires internet
        if (!isOnline) {
          setErrorMsg('You must be online to delete synced adjustments.');
          return;
        }

        // Delete receipt file from Supabase Storage if it exists
        if (adj.image_url) {
          const bucketName = 'adjustment-receipts';
          const urlParts = adj.image_url.split(`/${bucketName}/`);
          if (urlParts.length > 1) {
            const relativePath = urlParts[1];
            try {
              await supabase.storage.from(bucketName).remove([relativePath]);
            } catch (storageErr) {
              console.warn('Failed to delete receipt from Supabase storage:', storageErr);
            }
          }
        }

        const { error } = await supabase.from('adjustments').delete().eq('id', adj.id);
        if (error) throw error;

        await deleteAdjustment(adj.id);
        setAdjustments((prev) => prev.filter((a) => a.id !== adj.id));
        setSuccessMsg('Adjustment deleted successfully.');
      }
    } catch (err: any) {
      console.error('Failed to delete adjustment:', err);
      setErrorMsg('Failed to delete adjustment. Please try again.');
    } finally {
      setDeletingId(null);
      setAdjustmentToDelete(null);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 flex flex-col">
      {/* Title Header */}
      <div className="bg-white px-5 pt-6 pb-4 border-b border-gray-100/80 sticky top-0 z-10">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Adjustments</h1>
        <p className="text-sm text-gray-500 mt-1">Request and track out-of-pocket reimbursements</p>
      </div>

      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-6">
        {/* Form Card */}
        <div className="bg-white rounded-[28px] p-5 shadow-sm border border-gray-100/60">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-5 rounded bg-primary" />
            Request Adjustment
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-3.5 text-xs font-semibold text-red-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-3.5 text-xs font-semibold text-emerald-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {successMsg}
              </div>
            )}

            {/* Invoice Week Code Select */}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Invoice Week (invoice_code)
              </label>
              <WeekPopover
                weeks={weeksList}
                value={invoiceCode}
                onChange={(code, range) => {
                  setInvoiceCode(code);
                  setQualInvoiceData(range);
                }}
              />
            </div>

            {/* Date Pick */}
            <div className="space-y-1">
              <label htmlFor="adj-date" className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Date of purchase
              </label>
              <input
                id="adj-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="adj-desc" className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Description
              </label>
              <input
                id="adj-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Extra paint gallon, screws, rollers"
                required
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Value */}
            <div className="space-y-1">
              <label htmlFor="adj-value" className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Amount ($)
              </label>
              <input
                id="adj-value"
                type="number"
                step="0.01"
                min="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                required
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Store Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Store
              </label>
              
              {/* Quick options grid */}
              <div className="grid grid-cols-2 gap-2">
                {QUICK_STORES.map((s) => {
                  const isActive = (s === 'OTHERS' && isCustomStoreActive) || (s !== 'OTHERS' && store === s && !isCustomStoreActive);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStoreSelect(s)}
                      className={`py-3.5 px-3 rounded-2xl border text-xs font-bold text-center transition-all ${
                        isActive
                          ? 'border-primary bg-primary/5 text-primary-dark scale-[0.98]'
                          : 'border-gray-100 hover:border-gray-200 text-gray-600 bg-gray-50/50 active:scale-95'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* Custom Store Text Input */}
              {isCustomStoreActive && (
                <div className="pt-1 animate-slideDown">
                  <input
                    type="text"
                    value={customStore}
                    onChange={(e) => setCustomStore(e.target.value)}
                    placeholder="Enter store name..."
                    required
                    className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              )}
            </div>

            {/* Photo Upload Area */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block px-1">
                Receipt / Invoice Image
              </label>
              
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 hover:border-primary/50 rounded-[24px] p-5 flex flex-col items-center justify-center gap-2 bg-gray-50/30 active:scale-[0.99] transition-all"
              >
                {imagePreviewUrl ? (
                  <div className="relative w-full max-h-48 overflow-hidden rounded-2xl">
                    <img src={imagePreviewUrl} alt="Receipt preview" className="w-full h-full object-contain max-h-44" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold opacity-0 hover:opacity-100 transition-opacity">
                      Change Photo
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary-dark">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Click to upload or take receipt image</span>
                    <span className="text-[10px] text-gray-400 font-medium">JPEG, PNG · Compressed client-side</span>
                  </>
                )}
              </button>
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white py-4 rounded-2xl text-sm font-bold uppercase tracking-wider shadow-md shadow-primary/30 active:scale-95 active:shadow-none disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Adjustment
                </>
              )}
            </button>
          </form>
        </div>

        {/* History List */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-800 px-1 flex items-center justify-between">
            <span>Adjustment History</span>
            <span className="text-xs text-gray-400 font-medium">{adjustments.length} total</span>
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-100/50">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No adjustments registered yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {adjustments.map((adj) => {
                const formattedVal = Number(adj.value).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
                const formattedDate = new Date(adj.date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                const matchingQueueItem = queueItems.find(
                  (qi) => qi.adjustment_id === adj.id
                );

                return (
                  <div
                    key={adj.id}
                    className="bg-white rounded-[24px] p-4 shadow-sm border border-gray-100/60 flex items-center gap-3.5 hover:shadow-md transition-shadow"
                  >
                    {/* Image Thumbnail */}
                    <button
                      type="button"
                      onClick={() => {
                        if (adj.image_url) {
                          setActiveReceiptUrl(adj.image_url);
                          setActiveReceiptBlob(null);
                        } else if (adj.local_image_blob) {
                          setActiveReceiptBlob(adj.local_image_blob);
                          setActiveReceiptUrl(null);
                        }
                        setReceiptModalTitle(`${adj.store} - Receipt`);
                      }}
                      className="w-14 h-14 rounded-2xl bg-gray-100 flex-shrink-0 overflow-hidden relative active:scale-95 transition-transform"
                      title="View Receipt"
                    >
                      {adj.image_url ? (
                        <img src={adj.image_url} alt="Receipt thumbnail" className="w-full h-full object-cover" />
                      ) : adj.local_image_blob ? (
                        <img src={URL.createObjectURL(adj.local_image_blob)} alt="Local receipt thumbnail" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-400 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                      {!adj.synced && (
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </span>
                      )}
                    </button>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                          {adj.invoice_code}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400">{formattedDate}</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-[14px] truncate mt-1">{adj.store}</h3>
                      <p className="text-xs text-gray-500 truncate">{adj.description}</p>
                      {matchingQueueItem && matchingQueueItem.error && (
                        <p className="text-[10px] font-bold text-red-500 mt-1 truncate" title={matchingQueueItem.error}>
                          Sync Error: {matchingQueueItem.error}
                        </p>
                      )}
                    </div>

                    {/* Value & Payment status */}
                    <div className="text-right flex-shrink-0 flex flex-col items-end justify-center">
                      <p className="font-extrabold text-gray-900 text-base leading-none">${formattedVal}</p>
                      
                      {adj.paid ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (adj.payment_receipt_url) {
                              setActiveReceiptUrl(adj.payment_receipt_url);
                              setActiveReceiptBlob(null);
                              setReceiptModalTitle(`${adj.store} - Payment Proof`);
                            }
                          }}
                          className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors uppercase tracking-wider border border-emerald-200/50"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Paid
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            Pending
                          </span>
                          <button
                            type="button"
                            disabled={deletingId === adj.id}
                            onClick={() => {
                              setAdjustmentToDelete(adj);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1 rounded-lg text-red-500 hover:bg-red-50 active:scale-90 transition-transform cursor-pointer"
                            title="Delete Request"
                          >
                            {deletingId === adj.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Image Preview Modal */}
      {(activeReceiptUrl || activeReceiptBlob) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between p-4 backdrop-blur-md animate-fadeIn">
          {/* Modal Header */}
          <div className="flex items-center justify-between text-white pb-3 pt-2">
            <h3 className="font-bold text-base truncate pr-6">{receiptModalTitle}</h3>
            <button
              onClick={() => {
                setActiveReceiptUrl(null);
                setActiveReceiptBlob(null);
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform focus:outline-none"
              aria-label="Close image preview"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Image Box */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            {activeReceiptUrl ? (
              <img src={activeReceiptUrl} alt="Receipt Preview" className="max-w-full max-h-full object-contain rounded-2xl" />
            ) : activeReceiptBlob ? (
              <img src={URL.createObjectURL(activeReceiptBlob)} alt="Receipt Preview" className="max-w-full max-h-full object-contain rounded-2xl" />
            ) : null}
          </div>

          {/* Modal Footer placeholder */}
          <div className="h-6" />
        </div>
      )}

      {/* Confirmation Modal for Deletion */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete Request"
        message="Are you sure you want to delete this adjustment request? This will remove it locally and from the server."
        confirmLabel={deletingId ? "Deleting..." : "Delete"}
        isDestructive={true}
        onConfirm={handleDeleteAdjustment}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setAdjustmentToDelete(null);
        }}
      />
    </div>
  );
}
