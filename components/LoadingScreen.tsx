import React, { useState, useEffect } from 'react';
import { Coffee, Croissant, Cookie, CupSoda, UtensilsCrossed } from 'lucide-react';

interface LoadingScreenProps {
  isComplete?: boolean;
  onAnimationEnd?: () => void;
}

const phrases = [
  "Firing up the oven...",
  "Roasting the beans...",
  "Thawing the croissants...",
  "Dialing in the espresso...",
  "Frothing the milk...",
  "Warming up the muffins...",
  "Grinding fresh coffee...",
  "Prepping the pastry case..."
];

const icons = [
  Coffee,
  Croissant,
  Cookie,
  CupSoda,
  UtensilsCrossed
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ isComplete, onAnimationEnd }) => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [iconIndex, setIconIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isHiding, setIsHiding] = useState(false);

  // Rotate phrases
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % phrases.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Rotate icons
  useEffect(() => {
    const interval = setInterval(() => {
      setIconIndex(prev => (prev + 1) % icons.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handle Progress
  useEffect(() => {
    if (isComplete) {
      setProgress(100);
      const timer = setTimeout(() => {
        setIsHiding(true);
        if (onAnimationEnd) {
          setTimeout(onAnimationEnd, 500);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      // Slow progress to keep it moving but never hit 100
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          return prev + (95 - prev) * 0.05;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isComplete, onAnimationEnd]);

  const CurrentIcon = icons[iconIndex];

  return (
    <div className={`fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 transition-all duration-700 ease-in-out ${
      isHiding ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'
    }`}>
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Bouncing/Morphing Icon */}
        <div className="relative w-24 h-24 mb-12 flex items-center justify-center">
          <div className="absolute inset-0 bg-villain-red/20 rounded-full animate-ping" />
          <div className="relative bg-villain-darkgray/50 p-6 rounded-3xl border border-white/10 animate-bounce">
            <CurrentIcon size={40} className="text-villain-red transition-all duration-500 transform scale-110" />
          </div>
        </div>

        {/* Rotating Text */}
        <div className="h-12 flex items-center justify-center mb-8">
            <p className="text-xl font-display font-black uppercase tracking-tight text-white animate-in fade-in slide-in-from-bottom-2 duration-500 text-center" key={phraseIndex}>
              {phrases[phraseIndex]}
            </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-[280px]">
           <div className="w-full h-1.5 bg-villain-darkgray rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-villain-red shadow-[0_0_15px_rgba(255,81,59,0.5)] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
           </div>
           <p className="mt-4 text-[10px] font-black font-display text-villain-red text-center uppercase tracking-[0.2em] opacity-50">
             {Math.round(progress)}% Optimized
           </p>
        </div>
      </div>
    </div>
  );
};
