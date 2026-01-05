export type Category = string;

export type ViewState = 'HOME' | 'LIBRARY';

export interface Variation {
  id: string;
  name: string; // e.g., "340g", "2kg"
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  category: Category | null;
  thumbnail_url?: string;
  isStarred: boolean;
  type: 'Simple' | 'Complex';
  variations: Variation[];
}



export interface QuantityChange {
  productId: string;
  variationId: string;
  quantity: number;
}