import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantityControlProps {
  quantity: number;
  onChange: (newQty: number) => void;
}

export const QuantityControl: React.FC<QuantityControlProps> = ({ quantity, onChange }) => {
  const isLowStock = quantity < 5;

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
    <div className="flex items-center">
      {/* Low Stock Indicator - "!" */}
      {isLowStock && (
        <span className="text-xl font-black text-villain-red mr-2 animate-pulse" title="Low Stock">
          !
        </span>
      )}

      {/* Decrement */}
      <button 
        onClick={handleDecrement}
        className="w-10 h-10 flex items-center justify-center bg-villain-darkgray border border-villain-gray text-white hover:bg-neutral-800 active:scale-95 transition-transform rounded-sm"
        aria-label="Decrease quantity"
      >
        <Minus size={18} />
      </button>

      {/* Input */}
      <div className="mx-1">
          <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          className={`w-14 h-10 text-center bg-black border-2 text-white font-bold focus:outline-none transition-colors rounded-sm
              ${isLowStock ? 'border-villain-red' : 'border-villain-gray focus:border-white'}
          `}
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