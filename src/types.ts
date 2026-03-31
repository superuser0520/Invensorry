export type Category = 'Mechanical' | 'Pneumatic' | 'Electrical';

export type InventoryItem = {
  id: string;
  name: string;
  status: 'Normal' | 'Low Stock' | 'Ordering';
  category: Category;
};

export type Order = {
  id: string;
  itemName: string;
  itemId: string;
  date: string;
  status: 'Pending' | 'Completed';
  supplierName?: string;
  cost?: number;
};

export type PriceReference = {
  itemId: string;
  supplierName: string;
  price: number;
};

export type Supplier = {
  id: string;
  name: string;
  email: string;
};
