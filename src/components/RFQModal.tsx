import React, { useState } from 'react';
import { X, Mail } from 'lucide-react';
import { Supplier } from '../types';

interface RFQModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  suppliers: Supplier[];
  inventory: any[];
}

export const RFQModal: React.FC<RFQModalProps> = ({ isOpen, onClose, selectedIds, suppliers, inventory }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  if (!isOpen) return null;

  const selectedItems = inventory.filter(item => selectedIds.includes(item.id));
  const supplier = suppliers.find(s => s.id === selectedSupplierId);

  const handleSendRFQ = () => {
    if (!supplier) return;

    const subject = `RFQ for ${selectedItems.length} items`;
    const body = `Hello ${supplier.name},\n\nI would like to request a quote for the following items:\n\n${selectedItems.map(item => `- ${item.name} (${item.id})`).join('\n')}\n\nPlease let me know the availability and pricing.\n\nBest regards,`;
    
    window.location.href = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-black uppercase tracking-widest text-slate-900">Request Quote</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Supplier</label>
            <select 
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-sm text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-[#0055A4] focus:border-transparent"
            >
              <option value="">Select a supplier</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Selected Items</label>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedItems.map(item => (
                <div key={item.id} className="text-xs font-mono text-slate-700">{item.name} ({item.id})</div>
              ))}
            </div>
          </div>
        </div>

        <button 
          onClick={handleSendRFQ}
          disabled={!selectedSupplierId}
          className="w-full px-4 py-3 bg-[#0055A4] text-white font-black uppercase tracking-widest rounded-sm hover:bg-[#004488] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Mail className="w-4 h-4" />
          Initiate RFQ
        </button>
      </div>
    </div>
  );
};
