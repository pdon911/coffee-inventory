import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantityControlProps {
  quantity: number;
  onChange: (newQty: number) => void;
}

export const QuantityControl: React.FC<QuantityControlProps> = ({ quantity, onChange }) => {
  const isLowStock = quantity <= 1;

  const triggerHaptic = (ms: number) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  };

  const handleIncrement = () => {
    triggerHaptic(10);
    onChange(quantity + 1);
  };
  
  const handleDecrement = () => {
    triggerHaptic(10);
    onChange(Math.max(0, quantity - 1));
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
      onChange(val);
    } else if (e.target.value === '') {
      onChange(0);
    }
  };

  return (
    <div className="flex items-center gap-0 sm:gap-2">
      {/* Status Indicators */}
      {quantity <= 0 ? (
        <div className="bg-neutral-900 px-3 py-1 rounded-full border border-villain-red/30 shadow-lg flex items-center justify-center min-w-[70px] mr-1 sm:mr-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-villain-red">
                SOLD OUT
            </span>
        </div>
      ) : null}

      {/* Decrement Button */}
      {quantity > 0 && (
        <button 
            onClick={handleDecrement}
            className="w-10 h-10 flex items-center justify-center bg-villain-darkgray border border-villain-gray text-white hover:bg-neutral-800 active:scale-95 transition-transform rounded-sm flex-shrink-0"
            aria-label="Decrease quantity"
        >
            <Minus size={18} />
        </button>
      )}

      {/* Input Field */}
      <div className="mx-0 sm:mx-1 flex-shrink-0">
          <input
            type="number"
            value={quantity}
            onChange={handleInputChange}
            className={`sm:w-14 w-11 h-10 text-center bg-black border-2 font-bold focus:outline-none transition-colors rounded-sm text-white ${
              quantity < 0 ? 'border-villain-red' : 'border-villain-gray focus:border-white'
            }`}
          />
      </div>

      {/* Increment */}
      <button 
        onClick={handleIncrement}
        className="w-10 h-10 flex items-center justify-center bg-villain-darkgray border border-villain-gray text-white hover:bg-neutral-800 active:scale-95 transition-transform rounded-sm"
        aria-label="Increase quantity"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};
