
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Product, ViewState, Category, QuantityChange } from './types';
import { ProductCard } from './components/ProductCard';
import { SavingIndicator } from './components/SavingIndicator';
import { PinPad } from './components/PinPad';
import { PWAPrompt } from './components/PWAPrompt';
import { Search, List, Star, X, RotateCcw } from 'lucide-react';

// Determine API Base URL
const API_BASE = import.meta.env.PROD 
  ? 'https://backend-i2ms.onrender.com' 
  : '';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [appPin, setAppPin] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedLibrary, setHasLoadedLibrary] = useState(false);
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAnyInputFocused, setIsAnyInputFocused] = useState(false);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [collapsingItems, setCollapsingItems] = useState<Set<string>>(new Set());

  // --- New state for API interactions ---
  const [pendingChanges, setPendingChanges] = useState<Record<string, QuantityChange>>({});
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const [delayedPendingIds, setDelayedPendingIds] = useState<Set<string>>(new Set());
  const [justSavedIds, setJustSavedIds] = useState<Set<string>>(new Set());
  const [recentlySyncedIds, setRecentlySyncedIds] = useState<Set<string>>(new Set());
  const [recentlyUpdated, setRecentlyUpdated] = useState<Record<string, number>>({});
  const [syncingVariations, setSyncingVariations] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const [showTopHeader, setShowTopHeader] = useState(true);
  const lastScrollY = useRef(0);
  const removalTimersRef = useRef<Record<string, number[]>>({});
  const baseQuantitiesRef = useRef<Record<string, number>>({});
  
  // Use refs for synchronization data to ensure fetchInventory always sees the latest values
  const pendingChangesRef = useRef<Record<string, QuantityChange>>({});
  const recentlyUpdatedRef = useRef<Record<string, number>>({});

  // Sync state to refs whenever they change
  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  useEffect(() => {
    recentlyUpdatedRef.current = recentlyUpdated;
  }, [recentlyUpdated]);

  // --- Data Fetching ---
  const fetchInventory = useCallback(async (isBackground = false, favoritesOnly = false) => {
    if (!appPin) return;
    if (isBackground) setIsSyncing(true);
    try {
      const url = `${API_BASE}/api/inventory?favorites_only=${favoritesOnly}`;
      const response = await fetch(url, {
        headers: {
          'X-App-Pin': appPin
        }
      });
      if (response.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('app_pin');
        setAppPin(null);
        return;
      }
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data: Product[] = await response.json();
      
      if (!favoritesOnly) setHasLoadedLibrary(true);

      // Update base quantities
      data.forEach(p => {
        p.variations.forEach(v => {
            baseQuantitiesRef.current[v.id] = v.quantity;
        });
      });

      setIsLoading(false);
      setProducts(prevProducts => {
        // If first load, always set data
        if (prevProducts.length === 0) return data;

        const currentPending = pendingChangesRef.current;
        const currentRecent = recentlyUpdatedRef.current;
        const now = Date.now();
        const backgroundSyncedIds = new Set<string>();

        // If the new data is just favorites, we merge into existing list.
        // If it's a full sync, we use the new data as base.
        const merged = favoritesOnly ? [...prevProducts] : [...data];
        
        data.forEach(newProduct => {
          const existingIndex = merged.findIndex(p => p.id === newProduct.id);
          const prevProduct = prevProducts.find(p => p.id === newProduct.id);
          
          // Merge variations, preserving pending changes or very recent updates
          const mergedVariations = newProduct.variations.map(newVar => {
            const pending = currentPending[newVar.id];
            if (pending) {
              return { ...newVar, quantity: pending.quantity };
            }
            
            // If it was recently updated (within last 3 seconds), keep the previous quantity
            const lastUpdate = currentRecent[newVar.id];
            if (lastUpdate && (now - lastUpdate < 3000)) {
                const prevVar = prevProduct?.variations.find(v => v.id === newVar.id);
                if (prevVar) {
                    return { ...newVar, quantity: prevVar.quantity };
                }
            }

            // Detect background change for flash effect
            const prevVar = prevProduct?.variations.find(v => v.id === newVar.id);
            if (prevVar && prevVar.quantity !== newVar.quantity) {
                backgroundSyncedIds.add(newVar.id);
            }
            
            return newVar;
          });

          const updatedProduct = {
            ...newProduct,
            isStarred: prevProduct ? prevProduct.isStarred : newProduct.isStarred,
            variations: mergedVariations
          };

          if (existingIndex > -1) {
            merged[existingIndex] = updatedProduct;
          } else {
            // New item found (e.g. newly starred item appearing in favorites poll)
            merged.push(updatedProduct);
          }
        });

        if (backgroundSyncedIds.size > 0) {
            setRecentlySyncedIds(prev => {
                const next = new Set(prev);
                backgroundSyncedIds.forEach(id => next.add(id));
                return next;
            });
            setTimeout(() => {
                setRecentlySyncedIds(prev => {
                    const next = new Set(prev);
                    backgroundSyncedIds.forEach(id => next.delete(id));
                    return next;
                });
            }, 3000);
        }

        return merged;
      });
      
      const uniqueCategories = [...new Set(data.map(p => p.category || "Uncategorized"))] as Category[];
      setCategories(uniqueCategories);

    } catch (error) {
      console.error("Failed to fetch inventory:", error);
      setSaveError("Could not load inventory.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [appPin]);

  // --- Wake up Backend ---
  useEffect(() => {
    const wakeUp = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (response.ok) {
          setIsBackendReady(true);
        }
      } catch (err) {
        console.warn("Backend wake up failed or timed out. Will retry on next interaction.", err);
      }
    };
    wakeUp();
  }, []);

  // --- Initial Data Load ---
  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Lazy load library if needed
    if (isAuthenticated && currentView === 'LIBRARY' && !hasLoadedLibrary && !isLoading) {
        fetchInventory(false, false);
    }
  }, [currentView, hasLoadedLibrary, isLoading, fetchInventory, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
        // Initial fetch: Favorites Only for speed
        fetchInventory(false, true);
    }
  }, [isAuthenticated, fetchInventory]); // Run when authenticated

  useEffect(() => {
    // Background polling every 30 seconds
    const interval = setInterval(() => {
        // Only fetch if not currently saving
        if (!isSaving && Object.keys(pendingChanges).length === 0) {
            // Poll context-aware: only favorites if on home screen
            const favoritesOnly = currentView === 'HOME';
            fetchInventory(true, favoritesOnly);
        }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchInventory, isSaving, pendingChanges, currentView]);

  // --- Debounced Batch Saving ---
  useEffect(() => {
    const changesToSave = Object.values(pendingChanges);
    if (changesToSave.length === 0 || !appPin) {
      return;
    }

    const handler = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);
      
      // Mark these variations as syncing
      const varIds = changesToSave.map(c => (c as QuantityChange).variationId);
      setSyncingVariations(prev => {
        const next = new Set(prev);
        varIds.forEach(id => next.add(id));
        return next;
      });
      setPendingSyncIds(prev => {
        const next = new Set(prev);
        varIds.forEach(id => next.delete(id));
        return next;
      });
      setDelayedPendingIds(prev => {
        const next = new Set(prev);
        varIds.forEach(id => next.delete(id));
        return next;
      });

      const idempotencyKey = `batch-${Date.now()}`;
      
      try {
        const response = await fetch(`${API_BASE}/api/inventory/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'X-App-Pin': appPin
          },
          body: JSON.stringify({ changes: changesToSave }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save changes.');
        }

        setPendingChanges({});
        
        // Show "Saved" state for these variations
        setJustSavedIds(prev => {
            const next = new Set(prev);
            varIds.forEach(id => next.add(id));
            return next;
        });
        setTimeout(() => {
            setJustSavedIds(prev => {
                const next = new Set(prev);
                varIds.forEach(id => next.delete(id));
                return next;
            });
        }, 3000);

        // Mark as recently updated to prevent flickering
        const now = Date.now();
        setRecentlyUpdated(prev => {
            const next = { ...prev };
            varIds.forEach(id => next[id] = now);
            return next;
        });

        // Refresh after save completes
        const favoritesOnly = currentView === 'HOME';
        fetchInventory(true, favoritesOnly);

      } catch (error: any) {
        setSaveError(error.message || "An error occurred.");
        setTimeout(() => setSaveError(null), 5000); // Show error for 5s
        
        // On failure, refetch to revert optimistic updates
        fetchInventory(true, false);

      } finally {
        setIsSaving(false);
        // Clear syncing status for these variations
        setSyncingVariations(prev => {
            const next = new Set(prev);
            varIds.forEach(id => next.delete(id));
            return next;
        });
      }
    }, 1000); // 1-second debounce

    return () => clearTimeout(handler);
  }, [pendingChanges, fetchInventory, currentView]);


  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        setIsAnyInputFocused(true);
      }
    };
    const handleFocusOut = () => {
      setIsAnyInputFocused(false);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 10) {
        setShowTopHeader(true);
        lastScrollY.current = currentScrollY;
        return;
      }
      if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
        setShowTopHeader(false);
      } else if (currentScrollY < lastScrollY.current) {
        setShowTopHeader(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedSearch('');
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const triggerNavHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(15);
    }
  };

  const handleToggleStar = useCallback(async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const willBeStarred = !product.isStarred;

    // Optimistic update
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, isStarred: willBeStarred } : p
    ));

    // --- Star animation logic (existing) ---
    if (currentView === 'HOME' && !willBeStarred) {
      setRemovedItems(prev => new Set(prev).add(id));
      if (removalTimersRef.current[id]) {
        removalTimersRef.current[id].forEach(clearTimeout);
      }
      const collapseTimer = window.setTimeout(() => setCollapsingItems(prev => new Set(prev).add(id)), 2600);
      const finalTimer = window.setTimeout(() => {
        setRemovedItems(prev => { const next = new Set(prev); next.delete(id); return next; });
        setCollapsingItems(prev => { const next = new Set(prev); next.delete(id); return next; });
        delete removalTimersRef.current[id];
      }, 3000);
      removalTimersRef.current[id] = [collapseTimer, finalTimer];
    } else {
      if (removalTimersRef.current[id]) {
        removalTimersRef.current[id].forEach(clearTimeout);
        delete removalTimersRef.current[id];
      }
      setRemovedItems(prev => { const next = new Set(prev); next.delete(id); return next; });
      setCollapsingItems(prev => { const next = new Set(prev); next.delete(id); return next; });
    }

    // --- API Call ---
    if (!appPin) return;
    try {
        const response = await fetch(`${API_BASE}/api/toggle-star`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-App-Pin': appPin
            },
            body: JSON.stringify({ id: id }),
        });
        if (!response.ok) throw new Error('Failed to toggle star');
    } catch (error) {
        console.error("Failed to toggle star:", error);
        // Revert optimistic update on failure
        setProducts(prev => prev.map(p => 
          p.id === id ? { ...p, isStarred: !willBeStarred } : p
        ));
    }
  }, [products, currentView]);

  const handleUpdateQuantity = useCallback((productId: string, newQty: number, variationId: string) => {
    // Mark as pending immediately for debounce tracking
    setPendingSyncIds(prev => new Set(prev).add(variationId));
    
    // Delayed feedback: start timer if not already pending
    setDelayedPendingIds(prev => {
        if (!prev.has(variationId)) {
            setTimeout(() => {
                setDelayedPendingIds(curr => new Set(curr).add(variationId));
            }, 500);
        }
        return prev;
    });

    setJustSavedIds(prev => {
        const next = new Set(prev);
        next.delete(variationId);
        return next;
    });

    // Optimistic UI update
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;

      return {
        ...p,
        variations: p.variations.map(v => 
          v.id === variationId ? { ...v, quantity: newQty } : v
        )
      };
    }));

    // Queue the change for debounced saving
    setPendingChanges(prev => ({
      ...prev,
      [variationId]: { productId, variationId, quantity: newQty }
    }));
  }, []);

  const handleEnableTracking = useCallback(async (variationId: string) => {
    if (!appPin) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${API_BASE}/api/inventory/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Pin': appPin
        },
        body: JSON.stringify({ variationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enable tracking.');
      }

      // Refresh inventory to reflect changes
      fetchInventory(true, false);

    } catch (error: any) {
      setSaveError(error.message || "An error occurred.");
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  }, [fetchInventory]);

  const undoRemove = (id: string) => {
    if (removalTimersRef.current[id]) {
      removalTimersRef.current[id].forEach(clearTimeout);
      delete removalTimersRef.current[id];
    }
    // This implicitly calls handleToggleStar to re-star the item
    handleToggleStar(id);
    setRemovedItems(prev => { const next = new Set(prev); next.delete(id); return next; });
    setCollapsingItems(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const filteredLibrary = useMemo(() => {
    if (currentView !== 'LIBRARY') return [];
    
    if (isSearchFocused || searchQuery.length > 0) {
      if (debouncedSearch.length < 2) return [];
      const lowerQ = debouncedSearch.toLowerCase();
      return [...products]
        .filter(p => p.name.toLowerCase().includes(lowerQ))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    let data = products;
    if (selectedCategory !== 'All') {
      data = data.filter(p => p.category === selectedCategory);
    }
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, currentView, selectedCategory, debouncedSearch, isSearchFocused, searchQuery]);

  const groupedFavorites = useMemo(() => {
    const favs = products.filter(p => p.isStarred || removedItems.has(p.id));
    
    if (favs.length === 0) return [];

    const groups: { [key: string]: Product[] } = {};
    for (const item of favs) {
        const category = item.category || 'Uncategorized';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(item);
    }

    return Object.entries(groups)
        .map(([category, items]) => ({
            category,
            items: items.sort((a, b) => a.name.localeCompare(b.name))
        }))
        .sort((a, b) => a.category.localeCompare(b.category));
  }, [products, removedItems]);

  const showHeader = currentView === 'LIBRARY';
  const isNavHidden = isAnyInputFocused || (searchQuery.trim().length > 0 && currentView === 'LIBRARY');

  const handleVerifyPin = async (pin: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        setAppPin(pin);
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to verify PIN:", error);
      return false;
    }
  };

  if (!isAuthenticated) {
    return (
      <PinPad 
        onVerify={handleVerifyPin} 
        error={pinError} 
        isBackendReady={isBackendReady} 
      />
    );
  }

  const renderProduct = (product: Product) => {
    const isRemoved = removedItems.has(product.id);
    const isCollapsing = collapsingItems.has(product.id);
    
    const cardHeight = 77 + ((product.type === 'Complex' && product.variations) ? product.variations.length * 52 : 0);

    return (
      <div 
        key={product.id} 
        className={`grid transition-all duration-400 ease-in-out border-b border-villain-gray last:border-0 ${isCollapsing ? 'row-collapsed' : ''}`}
        style={{ minHeight: isCollapsing ? '0' : '77px' }}
      >
        {/* Undo Placeholder Layer */}
        <div 
          className={`col-start-1 row-start-1 flex items-center justify-between px-2 bg-villain-darkgray/10 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
            isRemoved ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
          }`}
          style={{ height: `${cardHeight}px` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-villain-gray/30 rounded-sm flex items-center justify-center">
               <Star size={16} className="text-gray-600" />
            </div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Removed
            </span>
          </div>
          <button 
            onClick={() => undoRemove(product.id)}
            className="flex items-center gap-2 px-4 py-2 bg-villain-gray hover:bg-neutral-700 rounded-full text-[10px] font-black uppercase tracking-widest text-white transition-colors border border-white/5 active:scale-95"
          >
            <RotateCcw size={10} />
            Undo
          </button>
        </div>

        {/* Product Card Layer */}
        <div className={`col-start-1 row-start-1 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
          !isRemoved ? 'opacity-100 scale-100' : 'opacity-0 scale-110 pointer-events-none'
        }`}>
          <ProductCard 
            product={product} 
            onToggleStar={handleToggleStar}
            onUpdateQuantity={handleUpdateQuantity}
            onEnableTracking={handleEnableTracking}
            viewState={currentView}
            syncingVariations={syncingVariations}
            pendingSyncIds={delayedPendingIds}
            justSavedIds={justSavedIds}
            recentlySyncedIds={recentlySyncedIds}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-40 bg-black text-white font-sans overflow-x-hidden">
      
      {showHeader && (
        <header 
          className={`sticky z-30 bg-black/95 backdrop-blur-md border-b border-villain-gray sm:px-4 px-1 transition-all duration-300 ease-in-out ${
              showTopHeader ? 'top-0' : '-top-[80px]' 
          }`}
        >
          <div className="pt-6 pb-2">
              <div className="max-w-[44rem] mx-auto relative h-12">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Search className="text-gray-500" size={18} />
                  </div>
                  <input
                      type="text"
                      placeholder="SEARCH INVENTORY..."
                      className="w-full h-full bg-villain-gray text-white rounded-full border border-transparent focus:border-villain-red pl-11 pr-11 focus:outline-none uppercase font-bold tracking-wide placeholder-gray-600 transition-all text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-villain-red hover:text-white transition-colors"
                      aria-label="Clear search"
                    >
                      <X size={18} />
                    </button>
                  )}
              </div>
          </div>

          {!isSearchFocused && !searchQuery && (
            <div className="max-w-[44rem] mx-auto mt-3 flex gap-3 overflow-x-auto pb-2 no-scrollbar bg-black/95">
              {(['All', ...categories] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-sm font-black uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap font-display ${
                    selectedCategory === cat 
                      ? 'text-villain-red border-villain-red' 
                      : 'text-gray-500 border-transparent hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </header>
      )}

      <main className={`max-w-[44rem] mx-auto sm:px-4 px-1 ${showHeader ? 'pt-4' : 'pt-16'}`}>
        {currentView === 'HOME' && (
          <div className="mb-10 flex items-center gap-3 px-2 sm:px-1">
            <div className="flex-shrink-0 ml-1">
                <img src="/logo.png" alt="Inventory" className="w-11 h-11 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
            </div>
            <div>
                <h1 className="text-4xl font-black uppercase font-display tracking-tight text-white leading-none">
                  Inventory
                </h1>
                <div className="w-12 h-1 bg-villain-red mt-2" />
            </div>
          </div>
        )}

        {(isLoading && products.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
                <div className="w-8 h-8 border-4 border-villain-red border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-xs font-black uppercase tracking-widest">Syncing Library...</p>
            </div>
        ) : currentView === 'LIBRARY' ? (
          (isSearchFocused || searchQuery.length > 0) ? (
            searchQuery.length < 2 ? (
              <div className="text-center py-20 px-6 opacity-70 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <div className="mb-4 p-4 border-2 border-villain-gray rounded-full text-villain-red opacity-50">
                      <Search size={40} />
                  </div>
                  <p className="text-xl font-display font-black uppercase mb-2 tracking-tight">Searching...</p>
                  <p className="text-gray-400 max-w-xs mx-auto text-lg leading-relaxed">Type at least 2 characters to search for items.</p>
              </div>
            ) : filteredLibrary.length > 0 ? (
              filteredLibrary.map(renderProduct)
            ) : (
              <div className="text-center py-20 px-6 opacity-50">
                <p className="text-xl font-black font-display uppercase mb-2">No items found</p>
                <p className="text-sm">We couldn't find matches for "{searchQuery}"</p>
              </div>
            )
          ) : (
            filteredLibrary.map(renderProduct)
          )
        ) : (
          groupedFavorites.length > 0 ? (
            groupedFavorites.map(group => (
              <div key={group.category} className="mb-10 last:mb-0">
                <div className="flex items-center gap-3 mb-2 px-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-villain-red bg-villain-red/10 px-2 py-0.5 rounded-sm">
                     {group.category}
                   </span>
                   <div className="h-[1px] flex-1 bg-villain-gray/50" />
                </div>
                <div className="flex flex-col">
                  {group.items.map(renderProduct)}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 px-6 flex flex-col items-center opacity-70">
                <div className="mb-4 p-4 border-2 border-villain-gray rounded-full text-villain-red">
                    <Star size={40} fill="currentColor" />
                </div>
                <p className="text-xl font-display font-black uppercase mb-2 tracking-tight">Favorites Empty</p>
                <p className="text-gray-400 max-w-xs mx-auto text-lg leading-relaxed">Hold on an item in the library to add it here.</p>
            </div>
          )
        )}
      </main>
      
      <PWAPrompt />

      <SavingIndicator isSaving={isSyncing} isSuccess={false} error={saveError} />

      <div className={`fixed bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-30 transition-opacity duration-300 ${isNavHidden ? 'opacity-0' : 'opacity-100'}`} />

      <div className={`fixed bottom-8 left-0 w-full flex justify-center z-40 px-6 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${isNavHidden ? 'translate-y-32' : 'translate-y-0'}`}>
        <nav className="relative w-full max-w-[280px] h-14 bg-villain-darkgray/80 backdrop-blur-xl border border-white/10 rounded-full grid grid-cols-2 p-1 shadow-2xl overflow-hidden">
            <div 
                className="absolute h-[calc(100%-8px)] w-[calc(50%-4px)] top-1 bg-villain-red rounded-full transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) z-0 shadow-lg shadow-villain-red/20"
                style={{
                    left: currentView === 'HOME' ? '4px' : 'calc(50% + 0px)'
                }}
            />
            
            <button
                onClick={() => {
                  if (currentView !== 'HOME') triggerNavHaptic();
                  setCurrentView('HOME');
                }}
                className={`relative z-10 w-full h-full flex items-center justify-center gap-2 transition-colors duration-300 active:scale-95 ${
                currentView === 'HOME' ? 'text-white' : 'text-gray-500'
                }`}
            >
                <Star 
                    size={20} 
                    fill={currentView === 'HOME' ? 'currentColor' : 'none'} 
                    strokeWidth={2.5} 
                    className="transition-all duration-300" 
                />
                <span className="text-[11px] font-black uppercase tracking-widest font-display">Favorites</span>
            </button>
            
            <button
                onClick={() => {
                  if (currentView !== 'LIBRARY') triggerNavHaptic();
                  setCurrentView('LIBRARY');
                }}
                className={`relative z-10 w-full h-full flex items-center justify-center gap-2 transition-colors duration-300 active:scale-95 ${
                currentView === 'LIBRARY' ? 'text-white' : 'text-gray-500'
                }`}
            >
                <List size={20} strokeWidth={2.5} className="transition-all duration-300" />
                <span className="text-[11px] font-black uppercase tracking-widest font-display">Library</span>
            </button>
        </nav>
      </div>
    </div>
  );
};

export default App;
