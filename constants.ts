import { Product } from './types';

export const MOCK_DATA: Product[] = [
  {
    id: 'p1',
    name: 'Villain Espresso Roast',
    category: 'Coffee',
    imageUrl: 'https://picsum.photos/id/1060/200/200',
    isStarred: true,
    type: 'Complex',
    variations: [
      { id: 'v1-1', name: '340g', quantity: 12 },
      { id: 'v1-2', name: '2kg', quantity: 4 },
      { id: 'v1-3', name: '5lb', quantity: 20 },
    ],
  },
  {
    id: 'p2',
    name: 'Heroine Filter Roast',
    category: 'Coffee',
    imageUrl: 'https://picsum.photos/id/1063/200/200',
    isStarred: false,
    type: 'Complex',
    variations: [
      { id: 'v2-1', name: '340g', quantity: 8 },
      { id: 'v2-2', name: '2kg', quantity: 2 },
    ],
  },
  {
    id: 'p3',
    name: 'Butter Croissant',
    category: 'Pastry',
    imageUrl: 'https://picsum.photos/id/431/200/200',
    isStarred: true,
    type: 'Simple',
    variations: [{ id: 'v3-1', name: 'Regular', quantity: 24 }],
  },
  {
    id: 'p4',
    name: 'Chocolate Chunk Cookie',
    category: 'Pastry',
    thumbnail_url: undefined, // Test fallback
    isStarred: false,
    type: 'Simple',
    variations: [{ id: 'v4-1', name: 'Regular', quantity: 3 }], // Low stock test
  },
  {
    id: 'p5',
    name: 'Blueberry Muffin',
    category: 'Pastry',
    thumbnail_url: 'https://picsum.photos/id/493/200/200',
    isStarred: false,
    type: 'Simple',
    variations: [{ id: 'v5-1', name: 'Regular', quantity: 15 }],
  },
  {
    id: 'p6',
    name: 'Villain Hoodie',
    category: 'Merch',
    thumbnail_url: 'https://picsum.photos/id/447/200/200',
    isStarred: false,
    type: 'Complex',
    variations: [
        { id: 'v6-1', name: 'S', quantity: 5 },
        { id: 'v6-2', name: 'M', quantity: 2 },
        { id: 'v6-3', name: 'L', quantity: 0 },
        { id: 'v6-4', name: 'XL', quantity: 8 },
    ]
  }
];