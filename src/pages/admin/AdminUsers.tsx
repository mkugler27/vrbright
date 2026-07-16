import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, type User } from '../../services/supabase';
import { CustomDropdown } from '../../components/ui/CustomDropdown';

const ROLE_OPTIONS = ['Owner', 'Director', 'Manager', 'Supervisor', 'Worker', 'Helper', 'Trainee'] as const;

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

function formatDateUS(dateStr?: string) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

function formatUSDateInput(value: string) {
  const clean = value.replace(/[^\d]/g, '');
  const len = clean.length;
  if (len === 0) return '';
  if (len <= 2) return clean;
  if (len <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
}

function dbDateToUS(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

function usDateToDB(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [month, day, year] = parts;
  if (!month || !day || !year || year.length !== 4) return null;
  const paddedMonth = month.padStart(2, '0');
  const paddedDay = day.padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
}

export function AdminUsers() {

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, active, inactive
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [activePopoverUserId, setActivePopoverUserId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<User>>({});
  const [tempPassword, setTempPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // File Upload State
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [worksCompFile, setWorksCompFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);

  // Delete Confirm State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Scrollbar checking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  const checkScrollbar = () => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      setHasScrollbar(scrollHeight > clientHeight);
    }
  };

  useEffect(() => {
    const timer = setTimeout(checkScrollbar, 50);
    return () => clearTimeout(timer);
  }, [users, search, roleFilter, statusFilter, viewMode, loading]);

  useEffect(() => {
    window.addEventListener('resize', checkScrollbar);
    return () => window.removeEventListener('resize', checkScrollbar);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .order('nome');

      if (fetchErr) throw fetchErr;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserActiveStatus = async (user: User) => {
    setError('');
    try {
      const newAtivo = user.ativo === false;
      const { error: updateErr } = await supabase
        .from('users')
        .update({ ativo: newAtivo })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, ativo: newAtivo } : u))
      );
    } catch (err: any) {
      console.error('Error toggling active status:', err);
      setError(err.message || 'Failed to update active status');
    }
  };

  // Document upload helpers
  const uploadToStorage = async (userId: string, bucket: string, folder: string, file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/${folder}_${Date.now()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleOpenNewUser = () => {
    setCurrentUser({
      ativo: true,
      tipo_user_bubble: 'Worker',
      dob: '',
      date_hired: '',
      fired_date: '',
      works_comp_valid_until: '',
      insurance_valid_until: '',
    });
    setTempPassword('');
    setAvatarFile(null);
    setAvatarPreview('');
    setWorksCompFile(null);
    setInsuranceFile(null);
    setIsModalOpen(true);
  };

  const handleOpenEditUser = (user: User) => {
    setCurrentUser({
      ...user,
      dob: dbDateToUS(user.dob),
      date_hired: dbDateToUS(user.date_hired),
      fired_date: dbDateToUS(user.fired_date),
      works_comp_valid_until: dbDateToUS(user.works_comp_valid_until),
      insurance_valid_until: dbDateToUS(user.insurance_valid_until),
    });
    setTempPassword('');
    setAvatarFile(null);
    setAvatarPreview(user.avatar_url || '');
    setWorksCompFile(null);
    setInsuranceFile(null);
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser.email || !currentUser.nome) {
      alert('Email and Name are required!');
      return;
    }

    setSaving(true);
    try {
      let userId = currentUser.id;

      if (!userId) {
        // Creating a new user requires generating credentials in auth schema
        if (!tempPassword) {
          alert('Temporary password is required for new users!');
          setSaving(false);
          return;
        }

        // Call PostgreSQL Security Definer function
        const { data: newId, error: rpcErr } = await supabase.rpc('create_user_admin', {
          user_email: currentUser.email,
          user_password: tempPassword,
          user_nome: currentUser.nome,
          user_tipo: currentUser.tipo_user_bubble || 'Worker',
        });

        if (rpcErr) throw rpcErr;
        userId = newId;
      }

      // Handle file uploads
      let avatarUrl = currentUser.avatar_url || '';
      let worksCompUrl = currentUser.works_comp_url || '';
      let insuranceUrl = currentUser.insurance_url || '';

      if (avatarFile && userId) {
        avatarUrl = await uploadToStorage(userId, 'user_docs', 'avatar', avatarFile);
      }
      if (worksCompFile && userId) {
        worksCompUrl = await uploadToStorage(userId, 'user_docs', 'works_comp', worksCompFile);
      }
      if (insuranceFile && userId) {
        insuranceUrl = await uploadToStorage(userId, 'user_docs', 'insurance', insuranceFile);
      }

      // Save/Update profiles row
      const profileUpdates = {
        ...currentUser,
        id: userId,
        avatar_url: avatarUrl,
        works_comp_url: worksCompUrl,
        insurance_url: insuranceUrl,
        dob: usDateToDB(currentUser.dob),
        date_hired: usDateToDB(currentUser.date_hired),
        fired_date: usDateToDB(currentUser.fired_date),
        works_comp_valid_until: usDateToDB(currentUser.works_comp_valid_until),
        insurance_valid_until: usDateToDB(currentUser.insurance_valid_until),
      };

      const { error: saveErr } = await supabase
        .from('users')
        .upsert(profileUpdates, { onConflict: 'id' });

      if (saveErr) throw saveErr;

      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      alert(err.message || 'Error occurred while saving user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('users')
        .delete()
        .eq('id', userToDelete.id);

      if (delErr) throw delErr;

      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      alert(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered Users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 1. Text Search
      const searchLower = search.toLowerCase();
      const matchesSearch =
        (u.nome || '').toLowerCase().includes(searchLower) ||
        (u.email || '').toLowerCase().includes(searchLower) ||
        (u.telefone || '').toLowerCase().includes(searchLower) ||
        (u.nickname || '').toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // 2. Role filter
      if (roleFilter !== 'all' && u.tipo_user_bubble !== roleFilter) {
        return false;
      }

      // 3. Status filter
      if (statusFilter === 'active' && u.ativo === false) return false;
      if (statusFilter === 'inactive' && u.ativo !== false) return false;

      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Expiry date highlight checks
  const getDocumentStatus = (expiryDateStr?: string) => {
    if (!expiryDateStr) return { label: 'No Date', color: 'text-slate-400 bg-slate-50 border-slate-100' };
    const expiry = new Date(expiryDateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Expired (${diffDays * -1}d ago)`, color: 'text-red-600 bg-red-50 border-red-100 font-bold' };
    }
    if (diffDays <= 30) {
      return { label: `Expires in ${diffDays}d`, color: 'text-amber-600 bg-amber-50 border-amber-100 font-bold' };
    }
    return {
      label: `Valid until ${formatDateUS(expiryDateStr)}`,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100 font-semibold',
    };
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'Owner':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Director':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Manager':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Supervisor':
        return 'bg-teal-50 text-teal-700 border-teal-100';
      case 'Worker':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Helper':
        return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Trainee':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-2xl shrink-0">
          {error}
        </div>
      )}
      {/* Upper header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">User Directory</h2>
          <p className="text-xs text-slate-400 font-medium">Manage corporate profiles, supervisor privileges, and painter documents.</p>
        </div>
        <button
          onClick={handleOpenNewUser}
          className="px-5 py-3 bg-primary hover:bg-primary-dark text-white text-sm font-extrabold rounded-2xl shadow-md shadow-primary/10 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>+ Add User</span>
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="shrink-0 bg-white rounded-3xl p-5 border border-slate-100 shadow-2xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Keyword Search */}
          <div className="md:col-span-5 relative">
            <input
              type="text"
              placeholder="Search by name, email, nickname..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-800"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* User Type (Role) */}
          <div className="md:col-span-3">
            <CustomDropdown
              value={roleFilter}
              options={[
                { label: 'All User Roles', value: 'all' },
                ...ROLE_OPTIONS.map((opt) => ({ label: opt, value: opt })),
              ]}
              onChange={setRoleFilter}
            />
          </div>

          {/* Active Status */}
          <div className="md:col-span-2">
            <CustomDropdown
              value={statusFilter}
              options={[
                { label: 'All Statuses', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ]}
              onChange={setStatusFilter}
            />
          </div>

          {/* Grid/List switchers */}
          <div className="md:col-span-2 flex items-center justify-end">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'card' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Listing View */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-xs min-h-0 py-20 gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-bold">Loading users...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl p-16 border border-slate-100 text-center min-h-0 space-y-4">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div>
            <h4 className="font-extrabold text-slate-700 text-base">No Users Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">No registered users match your search and filter criteria.</p>
          </div>
        </div>
      ) : viewMode === 'card' ? (
        /* CARD MODE GRID */
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-cascade-card pb-2">
          {filteredUsers.map((u) => {
            return (
              <div key={u.id} className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-visible group">
                {/* Active indicator popover */}
                <div className="absolute top-4 right-4 z-10">
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePopoverUserId(activePopoverUserId === u.id ? null : u.id);
                      }}
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border cursor-pointer hover:shadow-xs transition-all flex items-center gap-1.5 ${
                        u.ativo !== false 
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50' 
                          : 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200/50'
                      }`}
                    >
                      <span>{u.ativo !== false ? 'Active' : 'Inactive'}</span>
                      <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {activePopoverUserId === u.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePopoverUserId(null);
                          }}
                        />
                        <div className="absolute right-0 mt-1.5 w-32 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-slideDown text-left">
                          <p className="text-[9px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Status</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (u.ativo === false) {
                                toggleUserActiveStatus(u);
                              }
                              setActivePopoverUserId(null);
                            }}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Active</span>
                            </div>
                            {u.ativo !== false && <span className="text-emerald-500 font-bold">✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (u.ativo !== false) {
                                toggleUserActiveStatus(u);
                              }
                              setActivePopoverUserId(null);
                            }}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>Inactive</span>
                            </div>
                            {u.ativo === false && <span className="text-slate-500 font-bold">✓</span>}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Profile Summary */}
                  <div className="flex items-center gap-4">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.nome}
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shadow-2xs shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary font-black text-lg flex items-center justify-center border border-primary/20 shrink-0">
                        {u.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-800 text-base leading-tight truncate">
                        {u.nome}
                        {u.nickname && <span className="text-xs text-slate-400 font-bold ml-1.5">({u.nickname})</span>}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{u.email}</p>
                      <span className={`inline-block border text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md mt-1.5 ${getRoleBadgeColor(u.tipo_user_bubble)}`}>
                        {u.tipo_user_bubble || 'Worker'}
                      </span>
                    </div>
                  </div>

                  {/* Document & Company info block */}
                  {u.telefone && (
                    <div className="border-t border-slate-100 pt-3 text-xs">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="font-bold text-slate-400">Phone:</span>
                        <span className="font-medium text-slate-700">{formatUSPhone(u.telefone)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit and Delete Actions */}
                <div className="flex items-center justify-end gap-1 pt-4 mt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenEditUser(u)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setUserToDelete(u)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg active:scale-90 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      /* DETAILED LIST MODE (TABLE) */
      <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-x-auto overflow-y-hidden flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-w-[900px] min-h-0">
          {/* Header Row */}
          <div className="shrink-0 bg-slate-200 border-b border-slate-300/80">
            <div 
              className="grid grid-cols-12 text-xs font-black text-slate-600 uppercase tracking-wider py-4 pl-6"
              style={{ paddingRight: hasScrollbar ? '39px' : '24px' }}
            >
              <div className="col-span-3">User</div>
              <div className="col-span-1">Role</div>
              <div className="col-span-2">Phone / Contact</div>
              <div className="col-span-2">Works Comp</div>
              <div className="col-span-2">Insurance</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
          </div>

          {/* Body Rows */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 text-sm">
            {filteredUsers.map((u) => {
              const wc = getDocumentStatus(u.works_comp_valid_until);
              const ins = getDocumentStatus(u.insurance_valid_until);

              return (
                <div key={u.id} className="grid grid-cols-12 items-center hover:bg-slate-50/40 transition-colors py-4 px-6">
                  {/* User */}
                  <div className="col-span-3 pr-4">
                    <div className="flex items-center gap-3">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.nome}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-100 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center border border-primary/20 shrink-0">
                          {u.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-800 truncate">
                          {u.nome}
                          {u.nickname && <span className="text-xs text-slate-400 font-bold ml-1">({u.nickname})</span>}
                        </p>
                        <p className="text-xs text-slate-400 font-medium truncate">{u.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="col-span-1">
                    <span className={`inline-block border text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${getRoleBadgeColor(u.tipo_user_bubble)}`}>
                      {u.tipo_user_bubble || 'Worker'}
                    </span>
                  </div>

                  {/* Phone */}
                  <div className="col-span-2 font-medium text-slate-700">
                    {u.telefone ? formatUSPhone(u.telefone) : '—'}
                  </div>

                  {/* Works Comp */}
                  <div className="col-span-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border w-fit ${wc.color}`}>
                        {wc.label}
                      </span>
                      {u.works_comp_url && (
                        <a
                          href={u.works_comp_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Open PDF ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Insurance */}
                  <div className="col-span-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border w-fit ${ins.color}`}>
                        {ins.label}
                      </span>
                      {u.insurance_url && (
                        <a
                          href={u.insurance_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Open PDF ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="col-span-1 overflow-visible">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopoverUserId(activePopoverUserId === u.id ? null : u.id);
                        }}
                        className={`text-[11px] font-black px-2 py-0.5 rounded-md border cursor-pointer hover:shadow-xs transition-all flex items-center gap-1 ${
                          u.ativo !== false
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50'
                            : 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200/50'
                        }`}
                      >
                        <span>{u.ativo !== false ? 'Active' : 'Inactive'}</span>
                        <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {activePopoverUserId === u.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopoverUserId(null);
                            }}
                          />
                          <div className="absolute left-0 mt-1.5 w-32 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-slideDown text-left">
                            <p className="text-[9px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">Status</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (u.ativo === false) {
                                  toggleUserActiveStatus(u);
                                }
                                setActivePopoverUserId(null);
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Active</span>
                              </div>
                              {u.ativo !== false && <span className="text-emerald-500 font-bold">✓</span>}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (u.ativo !== false) {
                                  toggleUserActiveStatus(u);
                                }
                                setActivePopoverUserId(null);
                              }}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span>Inactive</span>
                              </div>
                              {u.ativo === false && <span className="text-slate-500 font-bold">✓</span>}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEditUser(u)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setUserToDelete(u)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <form
            onSubmit={handleSaveUser}
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] border border-slate-100 overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-extrabold text-slate-800 text-lg">
                {currentUser.id ? 'Edit User Profile' : 'Create New User Account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-lg active:scale-90 transition-transform cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {/* Profile Image Upload */}
              <div className="flex flex-col items-center justify-center gap-3 border-b border-slate-100 pb-5">
                <label className="relative group cursor-pointer">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar Preview"
                      className="w-24 h-24 rounded-3xl object-cover border-2 border-primary shadow-md group-hover:opacity-85 transition-opacity"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-2 text-center group-hover:border-primary group-hover:bg-primary/5 transition-all">
                      <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span className="text-[10px] text-slate-400 font-bold mt-1.5">Upload Photo</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="hidden"
                  />
                </label>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Click square above to upload profile picture</span>
              </div>

              {/* Form inputs */}
              <div className="space-y-4">
                {/* Name & Nickname */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={currentUser.nome || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, nome: e.target.value }))}
                      placeholder="e.g. John Doe"
                      required
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nickname / Short name</label>
                    <input
                      type="text"
                      value={currentUser.nickname || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, nickname: e.target.value }))}
                      placeholder="e.g. Johnny"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Email & Temp Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={currentUser.email || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="john@vrbright.com"
                      required
                      disabled={!!currentUser.id}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {currentUser.id ? 'Reset Password (Admin Override)' : 'Temporary Password'}
                    </label>
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder={currentUser.id ? 'Leave blank to keep current' : 'Define temp password'}
                      required={!currentUser.id}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* DOB & Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date of Birth</label>
                    <input
                      type="text"
                      value={currentUser.dob || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, dob: formatUSDateInput(e.target.value) }))}
                      placeholder="MM/DD/YYYY"
                      maxLength={10}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      value={currentUser.telefone || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, telefone: formatUSPhone(e.target.value) }))}
                      placeholder="(561) 555-0199"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Company details & EIN */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Company Name (If Subcontractor)</label>
                    <input
                      type="text"
                      value={currentUser.company_name || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Company Name"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">EIN / SSN</label>
                    <input
                      type="text"
                      value={currentUser.ein || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, ein: e.target.value }))}
                      placeholder="00-0000000"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
                  <input
                    type="text"
                    value={currentUser.address || ''}
                    onChange={(e) => setCurrentUser((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="Worker full address"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                  />
                </div>

                {/* Role selection & active status toggling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                  <CustomDropdown
                    label="User System Role"
                    value={currentUser.tipo_user_bubble || 'Worker'}
                    options={ROLE_OPTIONS.map((role) => ({ label: role, value: role }))}
                    onChange={(val) => setCurrentUser((prev) => ({ ...prev, tipo_user_bubble: val }))}
                  />
                  
                  {/* Account state toggles */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Account Active:</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={currentUser.ativo !== false}
                        onChange={(e) => setCurrentUser((prev) => ({ ...prev, ativo: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
                      <div className="absolute left-0 -top-1 w-5.5 h-5.5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[18px] peer-checked:bg-primary-dark peer-checked:border-primary-dark"></div>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Needs Pw Change:</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={currentUser.requires_password_change !== false}
                        onChange={(e) => setCurrentUser((prev) => ({ ...prev, requires_password_change: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
                      <div className="absolute left-0 -top-1 w-5.5 h-5.5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[18px] peer-checked:bg-primary-dark peer-checked:border-primary-dark"></div>
                    </label>
                  </div>
                </div>

                {/* Emergency Contact Header */}
                <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 pt-2">Emergency Contact</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contact Name</label>
                    <input
                      type="text"
                      value={currentUser.emergency_name || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, emergency_name: e.target.value }))}
                      placeholder="e.g. Monique"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contact Phone</label>
                    <input
                      type="text"
                      value={currentUser.emergency_contact || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, emergency_contact: formatUSPhone(e.target.value) }))}
                      placeholder="(561) 305-7797"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Contract Hired / Fired Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date of Hire</label>
                    <input
                      type="text"
                      value={currentUser.date_hired || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, date_hired: formatUSDateInput(e.target.value) }))}
                      placeholder="MM/DD/YYYY"
                      maxLength={10}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Termination Date</label>
                    <input
                      type="text"
                      value={currentUser.fired_date || ''}
                      onChange={(e) => setCurrentUser((prev) => ({ ...prev, fired_date: formatUSDateInput(e.target.value) }))}
                      placeholder="MM/DD/YYYY"
                      maxLength={10}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Employee Document uploads (Works Comp / Insurance) */}
                <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 pt-2">Compliance Certificates</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Works Comp */}
                  <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Workers Compensation</span>
                    <div>
                      {worksCompFile ? (
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700">
                          <span className="truncate">📎 {worksCompFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setWorksCompFile(null)}
                            className="text-[10px] text-red-500 hover:underline font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : currentUser.works_comp_url ? (
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5 text-xs">
                          <a
                            href={currentUser.works_comp_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            📄 View Current PDF
                          </a>
                          <button
                            type="button"
                            onClick={() => setCurrentUser((prev) => ({ ...prev, works_comp_url: '' }))}
                            className="text-[10px] text-red-500 hover:underline font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-slate-300 hover:border-primary rounded-xl cursor-pointer bg-white text-xs font-bold text-slate-500 uppercase tracking-wider transition-colors active:bg-slate-50">
                          <span>Choose PDF File</span>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setWorksCompFile(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Expiration Date</span>
                      <input
                        type="text"
                        value={currentUser.works_comp_valid_until || ''}
                        onChange={(e) => setCurrentUser((prev) => ({ ...prev, works_comp_valid_until: formatUSDateInput(e.target.value) }))}
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary font-medium text-slate-700"
                      />
                    </div>
                  </div>

                  {/* General Liability Insurance */}
                  <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">General Liability Insurance</span>
                    <div>
                      {insuranceFile ? (
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700">
                          <span className="truncate">📎 {insuranceFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setInsuranceFile(null)}
                            className="text-[10px] text-red-500 hover:underline font-bold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : currentUser.insurance_url && !insuranceFile ? (
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5 text-xs">
                          <a
                            href={currentUser.insurance_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            📄 View Current PDF
                          </a>
                          <button
                            type="button"
                            onClick={() => setCurrentUser((prev) => ({ ...prev, insurance_url: '' }))}
                            className="text-[10px] text-red-500 hover:underline font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-slate-300 hover:border-primary rounded-xl cursor-pointer bg-white text-xs font-bold text-slate-500 uppercase tracking-wider transition-colors active:bg-slate-50">
                          <span>Choose PDF File</span>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setInsuranceFile(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Expiration Date</span>
                      <input
                        type="text"
                        value={currentUser.insurance_valid_until || ''}
                        onChange={(e) => setCurrentUser((prev) => ({ ...prev, insurance_valid_until: formatUSDateInput(e.target.value) }))}
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary font-medium text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Actions Footer */}
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
                disabled={saving}
                className="flex-grow px-4 py-3 text-white bg-primary hover:bg-primary-dark text-sm font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-md shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving Account...
                  </>
                ) : (
                  'Save Profile'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 space-y-6 shadow-2xl animate-scaleIn">
            <div className="space-y-2">
              <h3 className="font-extrabold text-slate-800 text-lg">Delete User Profile</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete the user profile for <span className="font-bold text-slate-800">{userToDelete.nome}</span>? This action is permanent.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-2xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-2xl active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {deleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
