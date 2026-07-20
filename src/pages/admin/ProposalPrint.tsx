import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

interface CompanySettings {
  name: string;
  address: string;
  contact_name: string;
  email: string;
  phone: string;
  zip_code: string;
  logo_url: string | null;
}

interface Client {
  name: string;
  address: string;
  phone: string;
  email: string;
  pm_name: string;
  pm_phone: string;
  pm_email: string;
}

interface Proposal {
  id: string;
  number: string;
  title: string;
  client_type: string;
  type: string;
  total_value: number;
  created_at: string;
  clients: Client | null;
}

interface ProposalItem {
  id: string;
  service_id: string | null;
  description: string;
  quantity: number | null;
  unit_price: number;
  apply_quantity: boolean;
  subtotal: number;
  sequence: number;
}

interface ProposalDetail {
  id: string;
  title: string;
  content: string;
  sequence: number;
}

interface ProposalPhoto {
  id: string;
  image_url: string;
  description: string;
}

export function ProposalPrint() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [details, setDetails] = useState<ProposalDetail[]>([]);
  const [photos, setPhotos] = useState<ProposalPhoto[]>([]);
  
  // Loaded from Settings CRUD table
  const [company, setCompany] = useState<CompanySettings>({
    name: 'VR BRIGHT PAINTING & REMODELING',
    address: '1121 S. Military Trail #303',
    contact_name: 'RENAN',
    email: 'renan@vrbrightpainting.com',
    phone: '(754) 269-2915',
    zip_code: '33442',
    logo_url: '/vr1logo.png', // Fallback local logo
  });

  useEffect(() => {
    fetchProposalData();
  }, [id]);

  const fetchProposalData = async () => {
    try {
      setLoading(true);

      // 1) Fetch Company Settings
      const { data: compData } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      if (compData) {
        setCompany(compData);
      }

      // 2) Fetch Proposal with Client nested
      const { data: prop, error: propErr } = await supabase
        .from('proposals')
        .select('*, clients(*)')
        .eq('id', id)
        .single();

      if (propErr) throw propErr;
      setProposal(prop);

      // 3) Fetch Items
      const { data: itemsData } = await supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_id', id)
        .order('sequence');
      setItems(itemsData || []);

      // 4) Fetch Details
      const { data: detailsData } = await supabase
        .from('proposal_details')
        .select('*')
        .eq('proposal_id', id)
        .order('sequence');
      setDetails(detailsData || []);

      // 5) Fetch Photos
      const { data: photosData } = await supabase
        .from('proposal_photos')
        .select('*')
        .eq('proposal_id', id);
      setPhotos(photosData || []);

      // 6) Auto trigger print dialog after page rendering completes
      setTimeout(() => {
        window.print();
      }, 800);

    } catch (err) {
      console.error('Error loading proposal print data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phoneStr: string) => {
    if (!phoneStr) return '—';
    const cleaned = phoneStr.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phoneStr;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <span className="w-9 h-9 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Preparing Proposal Document...</span>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-sm font-extrabold text-rose-500">Proposal not found</p>
        <button
          onClick={() => navigate('/admin/proposals')}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
        >
          Back to list
        </button>
      </div>
    );
  }

  // Chunk photos into pages of max 8
  const photoPages: ProposalPhoto[][] = [];
  for (let i = 0; i < photos.length; i += 8) {
    photoPages.push(photos.slice(i, i + 8));
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans antialiased text-xs p-0 md:p-8 print:p-0">
      
      {/* CONTROL TOOLBAR (HIDDEN IN PRINT) */}
      <div className="print:hidden bg-slate-100 border border-slate-200 rounded-2xl p-4 mb-6 max-w-4xl mx-auto flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/proposals')}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold cursor-pointer text-xs"
          >
            ← Back
          </button>
          <span className="text-xs font-bold text-slate-500">Proposal print preview for {proposal.number}</span>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-primary hover:bg-primary/95 text-white font-black rounded-xl shadow-xs active:scale-98 transition-all cursor-pointer text-xs"
        >
          PRINT NOW (PDF)
        </button>
      </div>

      {/* PRINTABLE PAGE WRAPPER */}
      <div className="max-w-[794px] min-h-[1123px] mx-auto bg-white border border-slate-100 print:border-0 relative flex flex-col justify-between py-10 px-8 print:py-6 print:px-6">
        
        {/* WATERMARK BACKGROUND */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none z-0">
          <img src={company.logo_url || '/vr1logo.png'} alt="Watermark" className="w-96 select-none" />
        </div>

        {/* PAGE CONTENT */}
        <div className="relative z-10 flex-1 flex flex-col justify-between">
          <div>
            {/* Header branding */}
            <div className="flex justify-between items-start border-b-2 border-slate-150 pb-4">
              <div>
                <span className="text-[10px] text-teal-500 font-black uppercase tracking-wider">✦ {proposal.client_type} PROPOSAL</span>
              </div>
              <div className="h-10 shrink-0">
                <img
                  src={company.logo_url || '/vr1logo.png'}
                  alt="Company Logo"
                  className="h-full object-contain"
                />
              </div>
            </div>

            {/* Address & Customer details row */}
            <div className="grid grid-cols-12 gap-4 mt-6 text-left leading-normal">
              
              {/* Company Info */}
              <div className="col-span-5 space-y-1">
                <p className="font-extrabold text-[11px] text-slate-800 leading-tight">{company.name}</p>
                <p className="text-slate-500 font-semibold">{company.address}</p>
                <p className="text-slate-500 font-semibold">{company.contact_name}</p>
                <p className="text-slate-500 font-semibold">{formatPhone(company.phone)}</p>
                <p className="text-slate-500 font-semibold text-blue-600 underline">{company.email}</p>
              </div>

              {/* Customer Info */}
              <div className="col-span-4 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">CUSTOMER:</p>
                <p className="font-extrabold text-[11px] text-slate-800 leading-tight">{proposal.clients?.name || '—'}</p>
                <p className="text-slate-500 font-semibold">
                  Manager: {proposal.clients?.pm_name || '—'}
                </p>
                <p className="text-slate-500 font-semibold">Phone: {proposal.clients?.pm_phone ? formatPhone(proposal.clients.pm_phone) : '—'}</p>
                <p className="text-slate-500 font-semibold">Email: {proposal.clients?.pm_email || '—'}</p>
              </div>

              {/* Proposal Meta info */}
              <div className="col-span-3 text-right space-y-1">
                <p className="text-slate-800 font-black text-[13px] tracking-tight">{proposal.number}</p>
                <p className="text-slate-500 font-semibold">Date: {new Date(proposal.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</p>
              </div>
            </div>

            {/* Proposal Title block */}
            {proposal.title && (
              <div className="text-center my-6 border-y border-slate-100 py-3">
                <p className="font-black text-slate-800 text-[11.5px] uppercase tracking-wider">{proposal.title}</p>
              </div>
            )}

            {/* SERVICES TABLE */}
            <div className="mt-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-800 text-left font-black text-[9px] text-slate-500 uppercase tracking-widest">
                    <th className="py-2.5 w-10">#</th>
                    <th className="py-2.5">Description</th>
                    <th className="py-2.5 w-24 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="text-left font-medium text-slate-700 break-inside-avoid">
                      <td className="py-3 font-extrabold text-slate-400">{idx + 1}</td>
                      <td className="py-3 pr-4 leading-relaxed font-semibold">
                        {item.service_id ? (
                          <span>{item.description}</span>
                        ) : (
                          // Render Custom rich text format
                          <div
                            className="rich-text-print"
                            dangerouslySetInnerHTML={{ __html: item.description }}
                          />
                        )}
                        {item.apply_quantity && item.quantity !== null && (
                          <span className="text-[10px] text-slate-400 font-bold block mt-0.5 uppercase tracking-wider">
                            Quantity: {item.quantity} | Unit Price: ${item.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-extrabold text-slate-800">
                        ${item.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Proposals Total value */}
              <div className="flex justify-end items-center gap-3 py-4 border-t border-slate-200 mt-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TOTAL AMOUNT:</span>
                <span className="text-sm font-black text-slate-800">${proposal.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* DETAILS SNAPSHOTS BLOCK */}
            {details.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5 space-y-4 break-inside-avoid text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DETAILS</h4>
                {details.map((det) => (
                  <div key={det.id} className="space-y-1">
                    <p className="font-extrabold text-[10px] text-slate-700 uppercase tracking-wider">{det.title}</p>
                    <p className="text-slate-500 font-semibold leading-relaxed whitespace-pre-line pl-2 border-l border-slate-200">
                      {det.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SIGNATURES BLOCK */}
          <div className="grid grid-cols-2 gap-12 mt-12 break-inside-avoid">
            {/* Customer signature */}
            <div className="space-y-6 text-left">
              <div className="border-t border-slate-400 pt-2">
                <p className="font-extrabold text-[9px] text-slate-400 uppercase tracking-widest">By Manager</p>
              </div>
              <p className="text-slate-500 font-semibold">Date: ____/____/____</p>
            </div>

            {/* Renan / Manager signature */}
            <div className="space-y-6 text-left relative">
              
              {/* Digitized Cursive Signature Placeholder */}
              <div className="absolute -top-12 left-6 h-12 flex items-center">
                <span className="font-serif italic font-extrabold text-blue-700 text-lg opacity-85 select-none rotate-[-4deg]">
                  Renan Pereira
                </span>
              </div>

              <div className="border-t border-slate-400 pt-2">
                <p className="font-extrabold text-[9px] text-slate-800 uppercase tracking-widest">By VR Bright, Inc.</p>
                <p className="text-slate-500 font-bold mt-0.5">Renan Pereira</p>
              </div>
              <p className="text-slate-500 font-semibold">
                Date: {new Date(proposal.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {/* FOOTER THANK YOU PANEL */}
        <div className="mt-12 pt-6 border-t border-slate-100 shrink-0 text-center space-y-4 break-inside-avoid">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
            <p>I hope we can work together as soon as possible.</p>
            <p>Thank you for your business</p>
            <p className="text-teal-500 font-extrabold text-[10.5px] mt-0.5">THE "BRIGHTER" CHOICE FOR YOUR PROPERTY</p>
          </div>

          {/* Patterned footer bar */}
          <div className="h-6 bg-slate-900 rounded overflow-hidden flex items-center justify-around select-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="text-teal-500 font-black text-[9px] tracking-widest opacity-80">
                ✦ VR BRIGHT ✦
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* PHOTO ATTACHMENTS (FORCED PAGE BREAKS FOR EACH CHUNK) */}
      {photoPages.map((pagePhotos, pageIdx) => (
        <div
          key={pageIdx}
          className="max-w-[794px] min-h-[1123px] mx-auto bg-white border border-slate-100 print:border-0 mt-8 print:mt-0 relative flex flex-col justify-between py-10 px-8 print:py-6 print:px-6 break-before-page"
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-150 pb-4 shrink-0">
            <span className="text-[10px] text-teal-500 font-black uppercase tracking-wider">
              ✦ PROPOSAL ATTACHMENTS — PAGE {pageIdx + 1}
            </span>
            <span className="text-slate-500 font-bold">{proposal.number}</span>
          </div>

          {/* Grid layout: 2 columns, max 8 photos */}
          <div className="flex-1 my-6 grid grid-cols-2 gap-4 items-center content-start">
            {pagePhotos.map((photo) => (
              <div key={photo.id} className="border border-slate-100 p-2.5 rounded-2xl bg-slate-50/50 space-y-2 break-inside-avoid flex flex-col">
                <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-white border border-slate-200/50">
                  <img
                    src={photo.image_url}
                    alt="Proposal evidence"
                    className="w-full h-full object-cover"
                  />
                </div>
                {photo.description && (
                  <p className="text-[9.5px] text-slate-600 font-extrabold text-center uppercase tracking-wider line-clamp-2 min-h-[2.5em] leading-normal pt-1">
                    {photo.description}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Slogan rodapé */}
          <div className="border-t border-slate-100 pt-4 shrink-0 text-center text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            VR BRIGHT PAINTING & REMODELING
          </div>
        </div>
      ))}
    </div>
  );
}
