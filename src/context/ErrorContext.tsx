import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface ErrorContextType {
  error: string | null;
  throwError: (msg: string) => void;
  dismiss: () => void;
}

const ErrorContext = createContext<ErrorContextType | null>(null);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  const throwError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const dismiss = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      setError(custom.detail);
    };
    window.addEventListener('app-error', handler);
    return () => window.removeEventListener('app-error', handler);
  }, []);

  return (
    <ErrorContext.Provider value={{ error, throwError, dismiss }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useError(): ErrorContextType {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error('useError must be used within ErrorProvider');
  return ctx;
}