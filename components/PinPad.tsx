import React, { useState, useEffect, useCallback } from 'react';
import { Delete, X, Unlock } from 'lucide-react';
import { LoadingScreen } from './LoadingScreen';

interface PinPadProps {
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  isBackendReady?: boolean;
  isAuthenticated?: boolean;
  isDataReady?: boolean;
  onAnimationComplete?: () => void;
}

export const PinPad: React.FC<PinPadProps> = ({ 
  onVerify, 
  error: externalError, 
  isBackendReady = true,
  isAuthenticated = false,
  isDataReady = false,
  onAnimationComplete
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);

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

  const handleSubmit = useCallback(async (isAuto = false) => {
    if (pin.length === 0) return;
    
    // If backend isn't ready, enter waiting state
    if (!isBackendReady) {
      setIsWaitingForBackend(true);
      return;
    }

    // Reset waiting state once we proceed to verify
    setIsWaitingForBackend(false);
    setIsVerifying(true);
    
    const success = await onVerify(pin);
    setIsVerifying(false);
    
    if (success) {
      // Success handled by parent state
    } else {
      setError('INVALID PIN');
      setPin('');
      // Haptic feedback for error
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
      }
    }
  }, [pin, isBackendReady, onVerify]);

  // Handle backend wake up while waiting
  useEffect(() => {
    if (isWaitingForBackend && isBackendReady && !isAuthenticated) {
        handleSubmit(false);
    }
  }, [isBackendReady, isWaitingForBackend, isAuthenticated, handleSubmit]);

  useEffect(() => {
    if (pin.length >= 6) {
      const timer = setTimeout(() => {
        handleSubmit(true);
      }, 50); // Reduced from 300ms to 50ms for better responsiveness
      return () => clearTimeout(timer);
    }
  }, [pin, handleSubmit]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4 h-[100dvh] overflow-hidden transition-all duration-700 ease-in-out ${
      (isAuthenticated && isDataReady) ? 'scale-[2] opacity-0 pointer-events-none blur-xl' : 'animate-in fade-in duration-500'
    }`}>
      <div className="w-full max-w-sm flex flex-col items-center justify-center gap-12 py-6">
        <div className="flex flex-col items-center flex-shrink-0">
          <img src="/croissant-logo.png" alt="Logo" className="w-24 h-24 sm:w-32 sm:h-32 mb-6 object-contain" />
          <h1 className="text-2xl font-black uppercase font-display tracking-tight text-white leading-none mb-1">
            Access Required
          </h1>
          <div className="w-10 h-1 bg-villain-red" />
        </div>

        <div className="w-full flex flex-col justify-center py-2 min-h-[340px]">
          {(isWaitingForBackend || isAuthenticated || isVerifying) ? (
            <LoadingScreen 
              isComplete={isBackendReady && isDataReady && isAuthenticated} 
              onAnimationEnd={onAnimationComplete}
            />
          ) : (
            <div className="touch-none" style={{ touchAction: 'manipulation' }}>
          {/* PIN Display */}
          <div className={`mb-4 flex justify-center gap-4 h-8 items-center`}>
            {Array.from({ length: pin.length }).map((_, i) => (
              <div 
                key={i}
                className={`w-3 h-3 rounded-full border-2 transition-all duration-200 bg-villain-red border-villain-red scale-125 shadow-[0_0_10px_rgba(255,81,59,0.5)] ${error ? 'border-red-600 animate-bounce' : ''}`}
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
          </div>
          )}
        </div>

        <div className="w-full mt-4 flex-shrink-0 px-4">
          <button
            onClick={() => { triggerHaptic(); handleSubmit(false); }}
            disabled={pin.length === 0 || isVerifying || isWaitingForBackend || isAuthenticated}
            className={`w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
              (pin.length > 0 && !isWaitingForBackend && !isAuthenticated)
                ? 'bg-villain-red text-white shadow-lg shadow-villain-red/20 active:scale-95 text-xs' 
                : 'bg-villain-gray text-gray-600 cursor-not-allowed text-xs'
            } ${(isWaitingForBackend || isAuthenticated) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
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
