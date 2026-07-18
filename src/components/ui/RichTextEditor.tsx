import { useEffect, useRef, useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder = 'Type description here...', disabled = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [currentFont, setCurrentFont] = useState('Arial');
  const [currentHeader, setCurrentHeader] = useState('p');

  // Sync value from outside if it differs from current innerHTML
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Helper to execute document commands
  const execCmd = (command: string, value: string = '') => {
    if (disabled) return;
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    handleInput();
  };

  const handleLink = () => {
    const url = prompt('Enter the URL (e.g., https://example.com):');
    if (url) {
      execCmd('createLink', url);
    }
  };

  return (
    <div className={`border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 transition-all ${disabled ? 'opacity-65 pointer-events-none' : ''}`}>
      {/* TOOLBAR */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center gap-1 sm:gap-1.5 select-none">
        
        {/* Font Select */}
        <select
          value={currentFont}
          onChange={(e) => {
            setCurrentFont(e.target.value);
            execCmd('fontName', e.target.value);
          }}
          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-primary"
        >
          <option value="Arial">Sans Serif (Arial)</option>
          <option value="Georgia">Serif (Georgia)</option>
          <option value="Courier New">Monospace (Courier)</option>
          <option value="Comic Sans MS">Comic Sans</option>
        </select>

        {/* Heading Select */}
        <select
          value={currentHeader}
          onChange={(e) => {
            setCurrentHeader(e.target.value);
            const block = e.target.value === 'p' ? '<p>' : `<${e.target.value.toUpperCase()}>`;
            execCmd('formatBlock', block);
          }}
          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-primary"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Formatting actions */}
        <button
          type="button"
          onClick={() => execCmd('bold')}
          className="p-1.5 hover:bg-slate-200/80 active:bg-slate-300/80 rounded-lg text-slate-700 hover:text-slate-900 transition-colors font-bold text-xs min-w-7 h-7 flex items-center justify-center cursor-pointer"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => execCmd('italic')}
          className="p-1.5 hover:bg-slate-200/80 active:bg-slate-300/80 rounded-lg text-slate-700 hover:text-slate-900 transition-colors italic text-xs min-w-7 h-7 flex items-center justify-center cursor-pointer"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => execCmd('underline')}
          className="p-1.5 hover:bg-slate-200/80 active:bg-slate-300/80 rounded-lg text-slate-700 hover:text-slate-900 transition-colors underline text-xs min-w-7 h-7 flex items-center justify-center cursor-pointer"
          title="Underline"
        >
          U
        </button>
        <button
          type="button"
          onClick={() => execCmd('strikeThrough')}
          className="p-1.5 hover:bg-slate-200/80 active:bg-slate-300/80 rounded-lg text-slate-700 hover:text-slate-900 transition-colors line-through text-xs min-w-7 h-7 flex items-center justify-center cursor-pointer"
          title="Strikethrough"
        >
          S
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Colors */}
        <div className="relative flex items-center gap-1">
          <label className="p-1.5 hover:bg-slate-200/80 rounded-lg flex items-center justify-center cursor-pointer h-7 w-7 text-slate-700" title="Text Color">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            <input
              type="color"
              onChange={(e) => execCmd('foreColor', e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>

          <label className="p-1.5 hover:bg-slate-200/80 rounded-lg flex items-center justify-center cursor-pointer h-7 w-7 text-slate-700" title="Highlight Color">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <input
              type="color"
              defaultValue="#ffeb3b"
              onChange={(e) => execCmd('backColor', e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Lists */}
        <button
          type="button"
          onClick={() => execCmd('insertUnorderedList')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => execCmd('insertOrderedList')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Numbered List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3 6.75h1.5v.75H3v.75h1.5V9H3M3 12h1.5v.75H3v.75h1.5V14.25H3M3 17.25h1.5v.75H3v.75h1.5V19.5H3" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onClick={() => execCmd('justifyLeft')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Align Left"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => execCmd('justifyCenter')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Align Center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M5.25 12h13.5m-10.5 5.25h7.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => execCmd('justifyRight')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Align Right"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-7.5 5.25h7.5" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Link */}
        <button
          type="button"
          onClick={handleLink}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Insert Link"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1" />

        {/* Clear Format */}
        <button
          type="button"
          onClick={() => execCmd('removeFormat')}
          className="p-1.5 hover:bg-slate-200/80 rounded-lg text-slate-700 flex items-center justify-center cursor-pointer h-7 w-7"
          title="Clear Formatting"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h12M9 5v14M15 19H9M4 19L20 5" />
          </svg>
        </button>
      </div>

      {/* EDITABLE CONTENT BOX */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="w-full min-h-[160px] max-h-[350px] overflow-y-auto px-4 py-3 text-sm text-slate-800 focus:outline-none font-sans leading-relaxed rich-text-content"
        data-placeholder={placeholder}
      />
    </div>
  );
}
