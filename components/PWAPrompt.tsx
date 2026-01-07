import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X, Download } from 'lucide-react';

export const PWAPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Capture beforeinstallprompt for Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show after a small delay or user interaction?
      // We'll show it if not standalone
      if (!isStandaloneMode) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If it's iOS and not standalone, we should also show a prompt
    if (isIOSDevice && !isStandaloneMode) {
       // Show after 3 seconds for better UX
       const timer = setTimeout(() => setShowPrompt(true), 3000);
       return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [isStandalone]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowPrompt(false);
      }
    } else if (isIOS) {
       // On iOS we show instructions, so we don't hide the prompt immediately 
       // unless the user closes it manually.
    }
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom duration-500">
      <div className="bg-villain-darkgray/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50 relative overflow-hidden">
        {/* Subtle red accent */}
        <div className="absolute top-0 left-0 w-1 h-full bg-villain-red" />
        
        <button 
          onClick={() => setShowPrompt(false)}
          className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-xl border border-white/5 flex items-center justify-center flex-shrink-0">
             <img src="/croissant-logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          
          <div className="flex-grow">
            <h3 className="text-sm font-black uppercase tracking-tight text-white leading-tight">
              Install Villain App
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
              Add to home screen for full experience
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isIOS ? (
            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
              <p className="text-[11px] text-gray-300 leading-relaxed font-bold uppercase tracking-tight flex flex-wrap items-center gap-1.5">
                Tap the <Share size={14} className="text-villain-red inline" /> Share button and select <span className="text-white border border-white/20 px-1 rounded-sm flex items-center gap-1">Add to Home Screen <PlusSquare size={12} /></span>
              </p>
            </div>
          ) : (
            <button 
              onClick={handleInstallClick}
              className="w-full bg-villain-red text-white h-11 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-villain-red/20"
            >
              <Download size={16} />
              Install Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
