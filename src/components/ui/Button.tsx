import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:scale-[0.97] shadow-sm shadow-primary/30',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.97]',
  danger: 'bg-danger text-white hover:bg-red-600 active:scale-[0.97] shadow-sm shadow-danger/30',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.97]',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-xl font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
