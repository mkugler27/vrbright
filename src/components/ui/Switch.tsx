interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function Switch({ checked, onChange, disabled = false, label, className = '' }: SwitchProps) {
  const toggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div 
      className={`flex items-center gap-3 select-none ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-10 h-3.5 bg-slate-200 peer-checked:bg-primary/40 rounded-full transition-colors duration-200"></div>
        <div className="absolute left-0 -top-1 w-5.5 h-5.5 bg-white border border-slate-200/80 rounded-full shadow-xs transition-all duration-200 transform peer-checked:translate-x-[18px] peer-checked:bg-primary-dark peer-checked:border-primary-dark"></div>
      </label>
      {label && <span className="text-sm font-medium text-gray-700 cursor-pointer" onClick={toggle}>{label}</span>}
    </div>
  );
}
