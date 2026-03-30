import { InventoryItem, Order, PriceReference } from '../types';

// Helper to safely parse JSON from a response
const safeJson = async (response: Response) => {
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  const text = await response.text();
  return { error: text || `Server error (${response.status})` };
};

export const api = {
  async initDb() {
    const res = await fetch('/api/init-db', { method: 'POST' });
    if (!res.ok) {
      const errorData = await safeJson(res);
      throw new Error(errorData.error || 'Failed to initialize database');
    }
    return res;
  },

  async getHealth() {
    const res = await fetch('/api/health');
    return safeJson(res);
  },

  async getInventory() {
    const res = await fetch('/api/inventory');
    return safeJson(res);
  },

  async getSettings() {
    const res = await fetch('/api/settings');
    return safeJson(res);
  },

  async getOrders() {
    const res = await fetch('/api/orders');
    return safeJson(res);
  },

  async updateInventoryItem(item: InventoryItem) {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return safeJson(res);
  },

  async addOrder(order: Omit<Order, 'id'>) {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    return safeJson(res);
  },

  async updateOrder(order: Order) {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    return safeJson(res);
  },

  async deleteInventoryItems(ids: string[]) {
    const res = await fetch('/api/inventory/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return safeJson(res);
  },

  async deleteOrders(ids: string[]) {
    const res = await fetch('/api/orders/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return safeJson(res);
  },

  async bulkAddInventory(items: InventoryItem[]) {
    const res = await fetch('/api/inventory/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return safeJson(res);
  },

  async getPriceReferences(itemId: string): Promise<PriceReference[]> {
    const res = await fetch(`/api/price-reference/${itemId}`);
    if (!res.ok) return [];
    return res.json();
  },

  async getAllPriceReferences(): Promise<PriceReference[]> {
    const res = await fetch('/api/price-reference');
    if (!res.ok) return [];
    return res.json();
  },

  async savePriceReference(itemId: string, supplierName: string, price: number) {
    const res = await fetch('/api/price-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, supplierName, price }),
    });
    return safeJson(res);
  }
};
