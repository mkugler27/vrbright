import { useRef, useEffect } from 'react';

export type AttachmentSource = 'camera' | 'gallery' | 'file';

export interface AttachmentMenuProps {
  open: boolean;
  onSelect: (file: File, source: AttachmentSource) => void;
  onClose: () => void;
}

export function AttachmentMenu({ open, onSelect, onClose }: AttachmentMenuProps) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="absolute bottom-full mb-2 left-4 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 w-52 z-20 animate-slideDown"
    >
      <button
        type="button"
        onClick={() => camRef.current?.click()}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h3l2-3h8l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Camera
      </button>
      <button
        type="button"
        onClick={() => galRef.current?.click()}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
          <circle cx="9" cy="10" r="1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5-5-9 9" />
        </svg>
        Gallery
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48" />
        </svg>
        Document
      </button>

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f, 'camera');
          e.target.value = '';
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f, 'gallery');
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f, 'file');
          e.target.value = '';
        }}
      />
    </div>
  );
}
