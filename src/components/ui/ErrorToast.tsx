import { useEffect } from 'react';
import { useError } from '../../context/ErrorContext';

export function ErrorToast() {
  const { error, dismiss } = useError();

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [error, dismiss]);

  if (!error) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 animate-slideDown">
      <div className="bg-red-500 text-white rounded-xl px-4 py-3 shadow-lg flex items-start gap-3">
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Error</p>
          <p className="text-xs text-white/80 mt-0.5">{error}</p>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-white/70 hover:text-white active:scale-90 transition-transform p-1"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}