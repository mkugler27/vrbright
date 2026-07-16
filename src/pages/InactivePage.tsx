import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

export function InactivePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
    navigate('/login');
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4 z-50">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main card */}
      <div className="bg-slate-950/40 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl max-w-md w-full text-center space-y-6 animate-slide-up">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Access Denied</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your account is currently inactive. Please contact the administrator to enable your access.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white text-sm font-semibold rounded-2xl transition-all duration-200 cursor-pointer border border-white/10"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
