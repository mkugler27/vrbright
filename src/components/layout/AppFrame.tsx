// Mobile: full width. Desktop: centered phone-like frame, max 600px.
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-100 md:flex md:items-center md:justify-center md:py-6">
      <div className="w-full max-w-[600px] mx-auto bg-gray-50 min-h-screen md:min-h-0 md:h-[844px] md:rounded-[40px] md:shadow-2xl md:overflow-hidden md:border-[10px] md:border-gray-900 relative">
        {children}
      </div>
    </div>
  );
}