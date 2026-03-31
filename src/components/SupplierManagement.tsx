import React, { useState } from 'react';
import { Plus, Trash2, Building2 } from 'lucide-react';
import { Supplier } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';

interface SupplierManagementProps {
  suppliers: Supplier[];
  onUpdate: () => void;
}

export const SupplierManagement: React.FC<SupplierManagementProps> = ({ suppliers, onUpdate }) => {
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name || !newSupplier.email || isProcessing) return;
    setIsProcessing(true);
    try {
      await api.saveSupplier({ id: Math.random().toString(36).substring(2, 9), ...newSupplier });
      setNewSupplier({ name: '', email: '' });
      onUpdate();
      toast.success('Supplier added successfully');
    } catch (error) {
      toast.error('Failed to add supplier');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await api.deleteSupplier(id);
      onUpdate();
      toast.success('Supplier deleted successfully');
    } catch (error) {
      toast.error('Failed to delete supplier');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
          <Building2 className="w-4 h-4 text-[#0055A4]" />
          Supplier Management
        </h2>
      </div>
      <div className="p-6 space-y-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input 
            type="text"
            placeholder="Supplier Name"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
            className="px-3 py-2 border border-slate-300 rounded-sm text-sm"
          />
          <input 
            type="email"
            placeholder="Email Address"
            value={newSupplier.email}
            onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})}
            className="px-3 py-2 border border-slate-300 rounded-sm text-sm"
          />
          <button 
            type="submit"
            disabled={isProcessing}
            className="px-4 py-2 bg-[#0055A4] text-white font-black uppercase tracking-widest rounded-sm text-xs hover:bg-[#004488]"
          >
            <Plus className="w-4 h-4 inline mr-2" /> Add
          </button>
        </form>

        <div className="space-y-2">
          {suppliers.map(s => (
            <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-sm">
              <div>
                <div className="text-sm font-bold">{s.name}</div>
                <div className="text-xs text-slate-500 font-mono">{s.email}</div>
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
