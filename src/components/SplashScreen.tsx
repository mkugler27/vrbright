import { useState, useEffect } from 'react';

export function SplashScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary-dark to-primary flex flex-col items-center justify-center z-50">
      <div
        className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
      >
        <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-lg overflow-hidden p-3.5">
          <img src="/logo1a.png" alt="VR Bright Logo" className="w-full h-full object-contain" />
        </div>
      </div>
      <h1
        className={`text-2xl font-bold text-white tracking-tight transition-all duration-700 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      >
        VRBright
      </h1>
      <p
        className={`text-sm text-white/60 mt-2 transition-all duration-700 delay-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      >
        Work Orders Management
      </p>
      <div
        className={`mt-10 transition-all duration-700 delay-700 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    </div>
  );
}