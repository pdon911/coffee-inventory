import React, { useState, useEffect } from 'react';
import { Delete, X, Unlock } from 'lucide-react';

interface PinPadProps {
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  isBackendReady?: boolean;
}

export const PinPad: React.FC<PinPadProps> = ({ onVerify, error: externalError, isBackendReady = true }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  const triggerHaptic = (duration = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  };

  const handleKeyPress = (num: string) => {
    triggerHaptic();
    if (pin.length < 8) {
      setPin(prev => prev + num);
      setError(null);
    }
  };

  const handleDelete = () => {
    triggerHaptic();
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    triggerHaptic(20);
    setPin('');
    setError(null);
  };

  const handleSubmit = async (isAuto = false) => {
    if (pin.length === 0) return;
    
    // If backend isn't ready, enter waiting state
    if (!isBackendReady && !isAuto) {
      setIsWaitingForBackend(true);
      return;
    }

    if (!isAuto) setIsVerifying(true);
    const success = await onVerify(pin);
    if (!isAuto) setIsVerifying(false);
    
    if (success) {
      setIsUnlocked(true);
    } else if (!isAuto) {
      setError('INVALID PIN');
      setPin('');
      // Haptic feedback for error
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  };

  // Simulated progress when waiting for backend
  useEffect(() => {
    let interval: number;
    if (isWaitingForBackend && !isBackendReady) {
      // Aim for ~90% over 45 seconds
      // 90 / 450 = 0.2% per 100ms
      interval = window.setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + 0.2;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isWaitingForBackend, isBackendReady]);

  // Handle backend wake up while waiting
  useEffect(() => {
    if (isWaitingForBackend && isBackendReady) {
      // Fast forward to 100%
      setProgress(100);
      const timer = setTimeout(async () => {
        setIsVerifying(true);
        const success = await onVerify(pin);
        setIsVerifying(false);
        
        if (success) {
          setIsUnlocked(true);
        } else {
          setError('INVALID PIN');
          setPin('');
          setIsWaitingForBackend(false);
          setProgress(0);
          if ('vibrate' in navigator) {
            navigator.vibrate([50, 50, 50]);
          }
        }
      }, 500); // Small delay to let user see 100%
      return () => clearTimeout(timer);
    }
  }, [isBackendReady, isWaitingForBackend, onVerify, pin]);

  useEffect(() => {
    if (pin.length >= 4) {
      const timer = setTimeout(() => {
        handleSubmit(true);
      }, 300); // 300ms debounce to avoid spamming 401s
      return () => clearTimeout(timer);
    }
  }, [pin]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4 h-[100dvh] overflow-hidden transition-all duration-700 ease-in-out ${
      isUnlocked ? 'scale-[2] opacity-0 pointer-events-none blur-xl' : 'animate-in fade-in duration-500'
    }`}>
      <div className="w-full max-w-sm flex flex-col items-center justify-center gap-12 py-6">
        <div className="flex flex-col items-center flex-shrink-0 scale-90 sm:scale-100">
          <img src="/croissant-logo.png" alt="Logo" className="w-16 h-16 mb-4 object-contain" />
          <h1 className="text-2xl font-black uppercase font-display tracking-tight text-white leading-none mb-1">
            Access Required
          </h1>
          <div className="w-10 h-1 bg-villain-red" />
        </div>

        <div className="w-full flex flex-col justify-center py-2 min-h-[340px]">
          {isWaitingForBackend ? (
            <div className="w-full max-w-[280px] mx-auto flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="mb-8 p-4 bg-villain-darkgray/30 rounded-2xl border border-white/5 flex flex-col items-center w-full">
                  <div className="w-12 h-12 border-4 border-villain-red border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-1">
                    Waking up server
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">
                    Est. wait: 45s (Render Free Tier)
                  </p>
               </div>
               
               <div className="w-full h-2 bg-villain-darkgray rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-villain-red shadow-[0_0_15px_rgba(255,81,59,0.5)] transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
               </div>
               <p className="mt-4 text-[10px] font-black font-display text-villain-red animate-pulse uppercase tracking-widest">
                 {Math.round(progress)}% Complete
               </p>
            </div>
          ) : (
            <>
          {/* PIN Display */}
          <div className={`mb-4 flex justify-center gap-4 h-8 items-center`}>
            {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
              <div 
                key={i}
                className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
                  i < pin.length 
                    ? 'bg-villain-red border-villain-red scale-125 shadow-[0_0_10px_rgba(255,81,59,0.5)]' 
                    : (i < 4 && pin.length === 0) ? 'bg-transparent border-villain-gray/50' : 'bg-transparent border-villain-gray'
                } ${error ? 'border-red-600 animate-bounce' : ''}`}
              />
            ))}
          </div>

          {error && (
            <p className="text-villain-red text-center font-black uppercase tracking-widest text-[9px] mb-2 animate-pulse">
              {error}
            </p>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 mx-auto w-full max-w-[280px]">
            {keys.map(num => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                className="aspect-square bg-villain-darkgray/50 border border-white/5 rounded-full text-2xl font-black hover:bg-villain-gray hover:border-white/20 active:bg-villain-red active:scale-95 transition-all flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="aspect-square bg-villain-darkgray/30 border border-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-gray-500 hover:bg-neutral-800 active:scale-95 transition-all flex items-center justify-center"
            >
              Clear
            </button>
            <button
              onClick={() => handleKeyPress('0')}
              className="aspect-square bg-villain-darkgray/50 border border-white/5 rounded-full text-2xl font-black hover:bg-villain-gray hover:border-white/20 active:bg-villain-red active:scale-95 transition-all flex items-center justify-center"
              >
              0
            </button>
            <button
              onClick={handleDelete}
              className="aspect-square bg-villain-darkgray/30 border border-white/5 rounded-full text-2xl font-black hover:bg-neutral-800 active:scale-95 transition-all flex items-center justify-center"
            >
              <Delete size={24} />
            </button>
          </div>
          </>
          )}
        </div>

        <div className="w-full mt-4 flex-shrink-0 px-4">
          <button
            onClick={() => { triggerHaptic(); handleSubmit(false); }}
            disabled={pin.length === 0 || isVerifying}
            className={`w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
              pin.length > 0 
                ? 'bg-villain-red text-white shadow-lg shadow-villain-red/20 active:scale-95 text-xs' 
                : 'bg-villain-gray text-gray-600 cursor-not-allowed text-xs'
            }`}
          >
            {isVerifying ? (
              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Unlock size={20} />
                Unlock
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
