import React from 'react';
import { Check, Loader } from 'lucide-react';

interface SavingIndicatorProps {
  isSaving: boolean;
  isSuccess: boolean;
  error: string | null;
}

export const SavingIndicator: React.FC<SavingIndicatorProps> = ({ isSaving, isSuccess, error }) => {
  const getBackgroundColor = () => {
    if (error) return 'bg-red-500';
    if (isSuccess) return 'bg-green-500';
    return 'bg-villain-gray';
  };

  return (
    <div 
      className={`fixed top-8 right-8 z-50 flex items-center gap-3 px-4 py-2 rounded-full text-white transition-all duration-300 ease-in-out shadow-lg ${getBackgroundColor()} ${isSaving || isSuccess || error ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
    >
      {isSaving && !isSuccess && !error && (
        <>
          <Loader size={16} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">Syncing...</span>
        </>
      )}
      {isSuccess && (
        <>
          <Check size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">Saved</span>
        </>
      )}
       {error && (
        <>
          <span className="text-xs font-bold uppercase tracking-wider">{error}</span>
        </>
      )}
    </div>
  );
};
