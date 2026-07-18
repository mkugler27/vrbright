import { useState, useEffect, useRef } from 'react';

interface SearchableDropdownProps {
  label?: string;
  value: string;
  options: { label: string; value: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  direction?: 'up' | 'down';
}

export function SearchableDropdown({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  className = '',
  disabled = false,
  direction = 'down',
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);

  // Filter options based on query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-2xl px-4 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-800 text-left cursor-pointer"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <svg
          className={`w-4.5 h-4.5 text-slate-400 transition-transform shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu Overlay */}
      {isOpen && (
        <div className={`absolute left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 flex flex-col max-h-60 overflow-hidden py-1 ${
          direction === 'up'
            ? 'bottom-full mb-1.5 origin-bottom animate-fade-in'
            : 'mt-1.5 origin-top animate-slideDown'
        }`}>
          {/* Search Box Input */}
          <div className="p-2 border-b border-slate-100 shrink-0 relative">
            <svg
              className="w-4 h-4 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-semibold text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Options Scroll List */}
          <div className="overflow-y-auto max-h-52 divide-y divide-slate-50/50">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 italic text-center font-medium">
                No options match your search
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                    opt.value === value
                      ? 'bg-primary/10 text-primary-dark font-extrabold'
                      : opt.disabled
                        ? 'text-slate-400 opacity-40 hover:bg-transparent cursor-not-allowed flex items-center justify-between'
                        : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.disabled && (
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 ml-2">
                      Added
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
