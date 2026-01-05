import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../types';
import { Star } from 'lucide-react';
import { QuantityControl } from './QuantityControl';

interface ProductCardProps {

  product: Product;

  onToggleStar: (id: string) => void;

  onUpdateQuantity: (productId: string, newQty: number, variationId: string) => void;

}



export const ProductCard: React.FC<ProductCardProps> = ({ product, onToggleStar, onUpdateQuantity }) => {
  const [isHolding, setIsHolding] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);
  const [justStarred, setJustStarred] = useState(false);
  
  const preHoldTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);

  const PRE_HOLD_DELAY = 100; 
  const TOTAL_HOLD_DURATION = 500; 
  const EFFECTIVE_HOLD = TOTAL_HOLD_DURATION - PRE_HOLD_DELAY;

  const triggerHaptic = (ms: number) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  };

  const startHold = (e: React.MouseEvent | React.TouchEvent) => {
    // Only respond to primary mouse button
    if ('button' in e && e.button !== 0) return;
    
    if ('touches' in e) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    
    cleanupTimers();
    preHoldTimer.current = window.setTimeout(() => {
      setIsHolding(true);
      setIsTriggered(false);
      
      holdTimer.current = window.setTimeout(() => {
        handleTrigger();
      }, EFFECTIVE_HOLD);
    }, PRE_HOLD_DELAY);
  };

  const cleanupTimers = () => {
    if (preHoldTimer.current) window.clearTimeout(preHoldTimer.current);
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    preHoldTimer.current = null;
    holdTimer.current = null;
  };

  const endHold = () => {
    setIsHolding(false);
    cleanupTimers();
    touchStartPos.current = null;
  };

  const handleMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;

    const deltaX = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const deltaY = Math.abs(e.touches[0].clientY - touchStartPos.current.y);

    // If moved more than 10px in any direction, cancel the hold
    if (deltaX > 10 || deltaY > 10) {
      endHold();
    }
  };

  const handleTrigger = () => {
    triggerHaptic(65);
    setIsTriggered(true);
    if (!product.isStarred) {
      setJustStarred(true);
    }
    onToggleStar(product.id);
    
    setTimeout(() => {
      setIsHolding(false);
      setIsTriggered(false);
    }, 150);
  };

  useEffect(() => {
    if (!product.isStarred) {
      setJustStarred(false);
    }
  }, [product.isStarred]);

  useEffect(() => {
    return () => cleanupTimers();
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="relative w-full select-none bg-transparent">
      <div className="relative z-10 py-4 flex flex-col w-full">
        
        {/* Top Row - Grid with explicit min-w-0 on the first column to allow truncation */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 w-full overflow-hidden">
            
            {/* Interaction Zone */}
            <div 
              className={`flex items-center gap-3 min-w-0 cursor-pointer rounded-sm relative overflow-hidden transition-all ease-linear`}
              style={{
                transform: isHolding && !isTriggered ? 'scale(0.95)' : 'scale(1)',
                transitionDuration: isHolding && !isTriggered ? `${EFFECTIVE_HOLD}ms` : '150ms',
                transitionTimingFunction: isHolding && !isTriggered ? 'linear' : 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}
              onTouchStart={startHold}
              onTouchEnd={endHold}
              onTouchCancel={endHold}
              onTouchMove={handleMove}
              onMouseDown={startHold}
              onMouseUp={endHold}
              onMouseLeave={endHold}
              onContextMenu={(e) => e.preventDefault()}
            >

                {isHolding && (

                  <div className="absolute inset-0 bg-villain-darkgray/40 pointer-events-none rounded-sm" />

                )}



                {/* Thumbnail */}

                                <div className="flex-shrink-0 relative pointer-events-none z-10 ml-1">

                                    {product.thumbnail_url ? (

                                        <img 

                                          src={product.thumbnail_url} 

                                          alt={product.name} 

                                          className="w-11 h-11 object-cover bg-villain-gray rounded-sm border border-white/5"

                                        />

                                    ) : (

                        <div className="w-11 h-11 bg-villain-gray flex items-center justify-center rounded-sm border border-white/5">

                          <span className="text-sm font-black text-gray-400 tracking-wider font-display">

                              {getInitials(product.name)}

                          </span>

                        </div>

                    )}

                    

                    {product.isStarred && (

                        <div className={`absolute -bottom-1 -right-1 bg-black rounded-full p-0.5 border border-black shadow-lg z-20 ${justStarred ? 'animate-star-pop' : ''}`}>

                            <Star size={12} fill="#ff513b" className="text-villain-red" />

                        </div>

                    )}

                </div>



                {/* Title Wrapper */}

                <div className="flex-1 min-w-0 pointer-events-none z-10 py-1 pr-1">

                    <h3 className="text-[17px] font-black uppercase font-display text-white leading-tight tracking-tight truncate whitespace-nowrap block">

                        {product.name}

                    </h3>

                </div>

            </div>



            {/* Simple Product Controls */}

            {product.type === 'Simple' && typeof product.quantity === 'number' && (

                <div className="flex-shrink-0 z-20" onTouchStart={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>

                    <QuantityControl 

                        quantity={product.quantity} 

                        onChange={(qty) => onUpdateQuantity(product.id, qty, product.variations![0].id)} 

                    />

                </div>

            )}

        </div>



        {/* Complex Product Variations */}

        {product.type === 'Complex' && product.variations && product.variations.map((variant) => (

          <div 

            key={variant.id} 

            className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 ml-14 px-1 w-auto overflow-hidden"

            onTouchStart={(e) => e.stopPropagation()}

            onMouseDown={(e) => e.stopPropagation()}

          >

             <div className="min-w-0 flex-1">

                <span className="text-[15px] font-bold text-gray-500 leading-none truncate block uppercase">

                  {variant.name}

                </span>

             </div>

             

             <div className="flex-shrink-0">

                <QuantityControl

                  quantity={variant.quantity}

                  onChange={(qty) => onUpdateQuantity(product.id, qty, variant.id)}

                />

             </div>

          </div>

        ))}

      </div>

    </div>

  );
};
