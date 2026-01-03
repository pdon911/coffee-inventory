export type Category = 'Coffee' | 'Pastry' | 'Merch';

export interface Variation {
  id: string;
  name: string; // e.g., "340g", "2kg"
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  imageUrl?: string;
  isStarred: boolean;
  type: 'Simple' | 'Complex';
  variations?: Variation[]; // For complex items
  quantity?: number; // For simple items
}



export interface QuantityChange {
  productId: string;
  variationId: string;
  quantity: number;
}