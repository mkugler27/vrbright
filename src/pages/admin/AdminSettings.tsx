import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

function formatUSPhone(value: string) {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

export function AdminSettings() {
  const [settings, setSettings] = useState({
    name: '',
    address: '',
    city_state: '',
    zip_code: '',
    contact_person: '',
    phone: '',
    email: '',
    logo_url: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dbMissing, setDbMissing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError('');
    setDbMissing(false);
    try {
      const { data, error: fetchErr } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (fetchErr) {
        if (fetchErr.code === 'PGRST205' || fetchErr.message.includes('Could not find the table') || fetchErr.message.includes('relation "public.company_settings" does not exist')) {
          setDbMissing(true);
          throw new Error('Table "public.company_settings" does not exist in Supabase.');
        }
        throw fetchErr;
      }

      if (data) {
        setSettings({
          name: data.name || '',
          address: data.address || '',
          city_state: data.city_state || '',
          zip_code: data.zip_code || '',
          contact_person: data.contact_person || '',
          phone: data.phone || '',
          email: data.email || '',
          logo_url: data.logo_url || '',
        });
        if (data.logo_url) {
          setLogoPreview(data.logo_url);
        }
      } else {
        // Table exists but seed row doesn't. We'll create it on submit or seed it now.
        const { error: seedErr } = await supabase
          .from('company_settings')
          .insert({ id: 'default', name: 'VR BRIGHT PAINTING & REMODELING' });
        
        if (!seedErr) {
          setSettings(prev => ({ ...prev, name: 'VR BRIGHT PAINTING & REMODELING' }));
        }
      }
    } catch (err: any) {
      console.error('Error fetching settings:', err);
      // Only set error message if it is not a missing DB table (handled separately by dbMissing)
      if (err.code !== 'PGRST205' && !err.message.includes('relation "public.company_settings"')) {
        setError(err.message || 'Failed to load company settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof settings, value: string) => {
    let finalValue = value;
    if (field === 'phone') {
      finalValue = formatUSPhone(value);
    }
    setSettings(prev => ({
      ...prev,
      [field]: finalValue,
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo image must be smaller than 2MB.');
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogoClick = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmRemoveLogo = async () => {
    setIsConfirmOpen(false);
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { error: updateErr } = await supabase
        .from('company_settings')
        .update({ logo_url: '', updated_at: new Date().toISOString() })
        .eq('id', 'default');

      if (updateErr) throw updateErr;

      setSettings(prev => ({ ...prev, logo_url: '' }));
      setLogoPreview('');
      setLogoFile(null);
      setSuccess('Logo removed successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      console.error('Error removing logo:', err);
      setError(err.message || 'Failed to remove logo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      let finalLogoUrl = settings.logo_url;

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `logo_${Date.now()}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('company_assets')
          .upload(filePath, logoFile, { cacheControl: '3600', upsert: true });

        if (uploadErr) {
          throw new Error('Failed to upload logo to storage: ' + uploadErr.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from('company_assets')
          .getPublicUrl(filePath);

        finalLogoUrl = publicUrlData.publicUrl;
      }

      const { error: saveErr } = await supabase
        .from('company_settings')
        .upsert({
          id: 'default',
          name: settings.name,
          address: settings.address,
          city_state: settings.city_state,
          zip_code: settings.zip_code,
          contact_person: settings.contact_person,
          phone: settings.phone,
          email: settings.email,
          logo_url: finalLogoUrl,
          updated_at: new Date().toISOString(),
        });

      if (saveErr) throw saveErr;

      setSettings(prev => ({ ...prev, logo_url: finalLogoUrl }));
      setLogoFile(null);
      setSuccess('Company settings saved successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !dbMissing) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto p-4 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-200 rounded-lg"></div>
            <div className="h-4 w-96 bg-slate-100 rounded-lg"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-100 rounded-3xl md:col-span-1 border border-slate-200"></div>
          <div className="h-96 bg-slate-50 rounded-3xl md:col-span-2 p-6 border border-slate-200 space-y-4">
            <div className="h-10 bg-slate-200 rounded-lg"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-slate-200 rounded-lg"></div>
              <div className="h-10 bg-slate-200 rounded-lg"></div>
            </div>
            <div className="h-20 bg-slate-100 rounded-lg"></div>
            <div className="h-10 w-32 bg-slate-300 rounded-lg float-right"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Success Notification */}
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-emerald-50 text-emerald-800 px-4 py-3 rounded-2xl shadow-lg border border-emerald-100 animate-slideDown">
          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
          <div>
            <p className="font-semibold text-sm">Success</p>
            <p className="text-xs text-emerald-600/90">{success}</p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 text-rose-800 p-4 rounded-2xl border border-rose-100 text-sm flex gap-3 items-start">
          <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Table Missing Warning */}
      {dbMissing && (
        <div className="bg-amber-50 text-amber-900 p-6 rounded-3xl border border-amber-100 space-y-4">
          <div className="flex gap-3 items-start">
            <svg className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="space-y-1">
              <h3 className="font-bold text-base">Database Configuration Required</h3>
              <p className="text-sm text-amber-800/95">
                The settings table is missing from your Supabase schema. To solve this, run the provided database migration script in your <strong>Supabase SQL Editor</strong>.
              </p>
            </div>
          </div>
          <div className="bg-amber-950/5 p-4 rounded-2xl border border-amber-950/10 space-y-2">
            <p className="text-xs font-semibold text-amber-900">SQL Migration File Path:</p>
            <code className="text-xs bg-white/70 px-2.5 py-1.5 rounded-lg border border-amber-900/10 block font-mono">
              sql/create-company-settings.sql
            </code>
            <p className="text-xs text-amber-700 mt-1">
              You can find this file in your project folder, copy its contents, and execute them in the Supabase Dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-850">Settings</h1>
          <p className="text-sm text-slate-500">Manage global company details, branding, contact info and document parameters.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Branding / Logo Card */}
        <div className="space-y-6 md:col-span-1">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 w-full">Company Logo</h2>
            
            {/* Logo Display Card */}
            <div className="relative group w-36 h-36 bg-slate-50 border border-dashed border-slate-200 rounded-3xl flex items-center justify-center overflow-hidden mb-4 p-4 shadow-inner">
              {logoPreview ? (
                <>
                  <img 
                    src={logoPreview} 
                    alt="Company Logo Preview" 
                    className="w-full h-full object-contain" 
                  />
                  {!saving && (
                    <button
                      type="button"
                      onClick={handleRemoveLogoClick}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 cursor-pointer"
                    >
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center space-y-1 text-slate-400">
                  <svg className="w-10 h-10 mx-auto opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <p className="text-xs font-medium">No Logo Uploaded</p>
                </div>
              )}
            </div>

            {/* Logo Inputs */}
            {!dbMissing && (
              <div className="w-full">
                <label className="w-full flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100/80 active:bg-slate-100 text-slate-600 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer text-center">
                  <span className="truncate">{logoFile ? logoFile.name : 'Choose Logo Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    disabled={saving}
                  />
                </label>
                <p className="text-[10px] text-slate-400 text-center mt-2">
                  Supports PNG, JPG or WebP. Max size: 2MB.
                </p>
              </div>
            )}
          </div>

          {/* Quick Info Box */}
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Usage Note</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              These details form the official business identity of the application. 
              They are rendered in headers for generated PDF files, worker payouts, proposal estimates, and client-facing invoice documents.
            </p>
          </div>
        </div>

        {/* Right Column: Company Data Form */}
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-800">Company Information</h2>
              <span className="text-[10px] text-slate-400 font-mono uppercase bg-slate-50 px-2 py-1 rounded border border-slate-100">ID: default</span>
            </div>

            <div className="space-y-4">
              {/* Business Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="company-name">
                  Business Name *
                </label>
                <input
                  id="company-name"
                  type="text"
                  required
                  disabled={dbMissing || saving}
                  placeholder="e.g. VR BRIGHT PAINTING & REMODELING"
                  value={settings.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                />
              </div>

              {/* Grid Contact Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Contact Person */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="contact-person">
                    Contact Person
                  </label>
                  <input
                    id="contact-person"
                    type="text"
                    disabled={dbMissing || saving}
                    placeholder="e.g. RENAN"
                    value={settings.contact_person}
                    onChange={(e) => handleInputChange('contact_person', e.target.value)}
                    className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="email">
                    Business Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    disabled={dbMissing || saving}
                    placeholder="e.g. renan@vrbrightpainting.com"
                    value={settings.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="phone">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="text"
                    disabled={dbMissing || saving}
                    placeholder="e.g. (754) 269-2915"
                    value={settings.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                  />
                </div>

                {/* Zip Code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="zip_code">
                    ZIP Code
                  </label>
                  <input
                    id="zip_code"
                    type="text"
                    disabled={dbMissing || saving}
                    placeholder="e.g. 33442"
                    value={settings.zip_code}
                    onChange={(e) => handleInputChange('zip_code', e.target.value)}
                    className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="address">
                  Street Address
                </label>
                <input
                  id="address"
                  type="text"
                  disabled={dbMissing || saving}
                  placeholder="e.g. 1121 S. Military Trail #303"
                  value={settings.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                />
              </div>

              {/* City / State */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="city-state">
                  City, State
                </label>
                <input
                  id="city-state"
                  type="text"
                  disabled={dbMissing || saving}
                  placeholder="e.g. Deerfield Beach, FL"
                  value={settings.city_state}
                  onChange={(e) => handleInputChange('city_state', e.target.value)}
                  className="w-full text-slate-850 placeholder:text-slate-400 text-sm border border-slate-200 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-xl px-4 py-2.5 transition-colors disabled:opacity-60"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={fetchSettings}
                disabled={dbMissing || saving}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Reset Form
              </button>
              <button
                type="submit"
                disabled={dbMissing || saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark active:bg-primary-dark/95 shadow-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <ConfirmationModal
        isOpen={isConfirmOpen}
        title="Remove Logo"
        message="Are you sure you want to remove the company logo?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRemoveLogo}
        onCancel={() => setIsConfirmOpen(false)}
        isDestructive={true}
      />
    </div>
  );
}
