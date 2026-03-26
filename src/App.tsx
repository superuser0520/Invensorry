import React, { useState, useEffect, useRef } from 'react';
import { PackagePlus, CheckCircle, AlertTriangle, List, AlertCircle, Settings, Plus, ShoppingCart, Trash2, X, Link as LinkIcon, FileText, Shield, User, Cog, Wind, Zap, Lock } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type Category = 'Mechanical' | 'Pneumatic' | 'Electrical';

type InventoryItem = {
  id: string;
  name: string;
  status: 'Normal' | 'Low Stock' | 'Ordering';
  category: Category;
};

const initialData: InventoryItem[] = [
  { id: "MEC-001", name: "M5 Hex Cap Screw", status: "Normal", category: "Mechanical" },
  { id: "MEC-002", name: "Linear Guide Rail 500mm", status: "Normal", category: "Mechanical" },
  { id: "PNE-001", name: "Solenoid Valve 5/2", status: "Normal", category: "Pneumatic" },
  { id: "PNE-002", name: "Air Cylinder 32x50", status: "Normal", category: "Pneumatic" },
  { id: "ELE-001", name: "Proximity Sensor PNP", status: "Normal", category: "Electrical" },
  { id: "ELE-002", name: "24V DC Power Supply", status: "Normal", category: "Electrical" }
];

// QR Scanner removed as per request

export default function App() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'settings' | 'orders'>('inventory');
  const [bulkItemsText, setBulkItemsText] = useState('');
  const [userRole, setUserRole] = useState<'Admin' | 'User'>('User');
  const [selectedCategory, setSelectedCategory] = useState<Category>('Mechanical');
  const [filterCategory, setFilterCategory] = useState<Category | 'All'>('All');
  const [orderHistory, setOrderHistory] = useState<{ id: string; itemName: string; itemId: string; date: string; status: 'Pending' | 'Completed'; supplierName?: string; cost?: number }[]>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Initialize DB
        await fetch('/api/init-db', { method: 'POST' });
        
        const [invRes, settingsRes, ordersRes] = await Promise.all([
          fetch('/api/inventory'),
          fetch('/api/settings'),
          fetch('/api/orders')
        ]);
        
        if (invRes.ok) {
          const data = await invRes.json();
          if (data.length > 0) {
            setInventory(data);
          } else {
            // Seed initial data if empty
            for (const item of initialData) {
              await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
              });
            }
            setInventory(initialData);
          }
        }
        
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.adminEmail) {
            setAdminEmail(settings.adminEmail);
          }
        }
        
        if (ordersRes.ok) {
          const orders = await ordersRes.json();
          setOrderHistory(orders);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to connect to database");
        setInventory(initialData); // Fallback
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  
  // Admin Auth State
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');

  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; itemId: string | null }>({ isOpen: false, itemId: null });

  // Order Modal State
  const [orderModal, setOrderModal] = useState<{ isOpen: boolean; item: InventoryItem | null; supplierName: string; cost: string }>({ isOpen: false, item: null, supplierName: '', cost: '' });

  // Handle Direct Link Reporting
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');
    if (reportId) {
      setInventory(prev => {
        const exists = prev.find(i => i.id === reportId);
        if (exists && exists.status === 'Normal') {
          toast.error(`Low stock reported for ${exists.name} via direct link.`);
          return prev.map(i => i.id === reportId ? { ...i, status: 'Low Stock' } : i);
        } else if (exists) {
          toast.info(`${exists.name} is already marked as ${exists.status}.`);
        } else {
          toast.error(`Item ${reportId} not found.`);
        }
        return prev;
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Weekly Monday 8 AM Report Logic
  const lastReportDate = useRef<string | null>(null);
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      if (now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0) {
        const dateStr = now.toDateString();
        if (lastReportDate.current !== dateStr) {
          lastReportDate.current = dateStr;
          const lowStockItems = inventory.filter(i => i.status === 'Low Stock');
          if (lowStockItems.length > 0 && adminEmail) {
            const reportTime = now.toLocaleString();
            
            const emailHtml = `
              <h2>Weekly Low Stock Report</h2>
              <p>Generated: ${reportTime}</p>
              <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="text-align: left;">Item ID</th>
                    <th style="text-align: left;">Description</th>
                    <th style="text-align: left;">Category</th>
                  </tr>
                </thead>
                <tbody>
                  ${lowStockItems.map(i => `
                    <tr>
                      <td>${i.id}</td>
                      <td>${i.name}</td>
                      <td>${i.category}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
            
            try {
              await fetch('/api/send-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: adminEmail,
                  subject: `Weekly Low Stock Report - ${dateStr}`,
                  html: emailHtml
                })
              });
              toast.success(`Weekly Low Stock Report sent to Admin (${lowStockItems.length} items).`);
            } catch (error) {
              console.error("Failed to send weekly report:", error);
            }
          }
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [inventory, adminEmail]);

  const handleReportLowStock = async (item: InventoryItem) => {
    const updatedItem = { ...item, status: 'Low Stock' as const };
    
    setInventory(prev => prev.map(invItem => 
      invItem.id === item.id ? updatedItem : invItem
    ));
    
    try {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem)
      });
      
      toast.error(`Low stock reported for ${item.name}.`);
      
      // Send email if configured
      if (adminEmail) {
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: adminEmail,
            subject: `Low Stock Alert: ${item.name}`,
            html: `<p>Item <strong>${item.name}</strong> (${item.id}) has been reported as low stock.</p>`
          })
        });
        toast.success("Email alert sent to admin.");
      }
    } catch (error) {
      console.error("Failed to update item:", error);
    }
  };

  const handleRestock = async (item: InventoryItem) => {
    const updatedItem = { ...item, status: 'Normal' as const };
    
    setInventory(prev => prev.map(invItem => 
      invItem.id === item.id ? updatedItem : invItem
    ));
    
    try {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem)
      });
      
      // Update order history if it was ordering
      if (item.status === 'Ordering') {
        const pendingOrder = orderHistory.find(o => o.itemId === item.id && o.status === 'Pending');
        if (pendingOrder) {
          const updatedOrder = { ...pendingOrder, status: 'Completed' as const };
          await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedOrder)
          });
          
          setOrderHistory(prev => prev.map(order => 
            order.id === pendingOrder.id ? updatedOrder : order
          ));
        }
      }
      
      toast.success(`Restocked ${item.name}. Status is now Normal.`);
    } catch (error) {
      console.error("Failed to restock item:", error);
    }
  };

  const handleRequestOrderClick = (item: InventoryItem) => {
    setOrderModal({ isOpen: true, item, supplierName: '', cost: '' });
  };

  const confirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderModal.item) return;
    
    const item = orderModal.item;
    const costNum = parseFloat(orderModal.cost);

    const updatedItem = { ...item, status: 'Ordering' as const };
    setInventory(prev => prev.map(invItem => 
      invItem.id === item.id ? updatedItem : invItem
    ));
    
    // Add to order history
    const newOrder = {
      id: `ORD-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      itemName: item.name,
      itemId: item.id,
      date: new Date().toLocaleString(),
      status: 'Pending' as const,
      supplierName: orderModal.supplierName,
      cost: isNaN(costNum) ? 0 : costNum
    };
    
    try {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem)
      });
      
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      });
      
      setOrderHistory(prev => {
        const updated = [newOrder, ...prev];
        return updated.slice(0, 3);
      });
      toast.success(`Item ${item.name} is now ordering (pending arrival).`);
    } catch (error) {
      console.error("Failed to place order:", error);
      toast.error("Failed to place order");
    } finally {
      setOrderModal({ isOpen: false, item: null, supplierName: '', cost: '' });
    }
  };

  const handleDeleteClick = (item: InventoryItem) => {
    setDeleteModal({ isOpen: true, itemId: item.id });
  };

  const confirmDelete = async () => {
    if (!deleteModal.itemId) return;
    
    try {
      await fetch(`/api/inventory/${deleteModal.itemId}`, { method: 'DELETE' });
      setInventory(prev => prev.filter(item => item.id !== deleteModal.itemId));
      toast.success('Item deleted successfully.');
    } catch (error) {
      console.error("Failed to delete item:", error);
      toast.error("Failed to delete item");
    } finally {
      setDeleteModal({ isOpen: false, itemId: null });
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = bulkItemsText.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) return;
    
    let maxId = 0;
    inventory.forEach(item => {
      const match = item.id.match(/-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    });
    
    const prefix = selectedCategory === 'Mechanical' ? 'MEC' : selectedCategory === 'Pneumatic' ? 'PNE' : 'ELE';
    
    const newItems: InventoryItem[] = names.map((name, index) => ({
      id: `${prefix}-${String(maxId + 1 + index).padStart(3, '0')}`,
      name,
      status: 'Normal',
      category: selectedCategory
    }));
    
    try {
      for (const item of newItems) {
        await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      }
      
      setInventory(prev => [...prev, ...newItems]);
      setBulkItemsText('');
      toast.success(`Added ${newItems.length} new item(s) to ${selectedCategory}`);
      setActiveTab('inventory');
    } catch (error) {
      console.error("Failed to add items:", error);
      toast.error("Failed to add items");
    }
  };

  const handleCopyLink = (item: InventoryItem) => {
    const url = `${window.location.origin}${window.location.pathname}?report=${item.id}`;
    navigator.clipboard.writeText(url);
    toast.success(`Direct report link copied for ${item.name}`);
  };

  const handleManualReport = async () => {
    const lowStockItems = inventory.filter(i => i.status === 'Low Stock');
    if (lowStockItems.length === 0) {
      toast.info("No items are currently low on stock.");
      return;
    }
    
    const reportDate = new Date().toLocaleString();
    
    // Send email if configured
    if (adminEmail) {
      try {
        const emailHtml = `
          <h2>Low Stock Report</h2>
          <p>Generated: ${reportDate}</p>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: #f8fafc;">
                <th style="text-align: left;">Item ID</th>
                <th style="text-align: left;">Description</th>
                <th style="text-align: left;">Category</th>
              </tr>
            </thead>
            <tbody>
              ${lowStockItems.map(i => `
                <tr>
                  <td>${i.id}</td>
                  <td>${i.name}</td>
                  <td>${i.category}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: adminEmail,
            subject: `Low Stock Report - ${reportDate}`,
            html: emailHtml
          })
        });
        toast.success("Email report sent to admin.");
      } catch (error) {
        console.error("Failed to send email report:", error);
        toast.error("Failed to send email report");
      }
    }
    
    // Generate CSV content for Excel
    const headers = ["Item ID", "Description", "Status", "Report Date"];
    const csvRows = [
      headers.join(','),
      ...lowStockItems.map(i => `"${i.id}","${i.name}","${i.status}","${reportDate}"`)
    ];
    const csvContent = csvRows.join('\n');
    
    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `low_stock_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Report downloaded as Excel (CSV)! (${lowStockItems.length} items)`);
  };

  const handleGenerateOrderReport = () => {
    if (orderHistory.length === 0) {
      toast.info("No orders in history.");
      return;
    }
    
    const headers = ["Order ID", "Date", "Item ID", "Item Name", "Supplier", "Cost", "Status"];
    const csvRows = [
      headers.join(','),
      ...orderHistory.map(o => `"${o.id}","${o.date}","${o.itemId}","${o.itemName}","${o.supplierName || ''}","${o.cost || 0}","${o.status}"`)
    ];
    const csvContent = csvRows.join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `order_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Order report downloaded!`);
  };

  const getCategoryIcon = (category: Category, className: string = "w-4 h-4") => {
    switch (category) {
      case 'Mechanical': return <Cog className={className} />;
      case 'Pneumatic': return <Wind className={className} />;
      case 'Electrical': return <Zap className={className} />;
    }
  };

  const renderStatus = (item: InventoryItem) => {
    if (item.status === 'Ordering') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5" />
          Ordering
        </span>
      );
    }
    if (item.status === 'Low Stock') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle className="w-3.5 h-3.5" />
        Normal
      </span>
    );
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'adminEmail', value: adminEmail })
      });
      toast.success("Admin email saved successfully.");
    } catch (error) {
      console.error("Failed to save email:", error);
      toast.error("Failed to save admin email");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0055A4]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 selection:bg-[#0055A4]/30">
      <Toaster position="top-right" theme="light" richColors />
      
      {/* Header - Shimano Style */}
      <header className="bg-white border-b-2 border-[#0055A4] py-4 px-6 shadow-sm flex items-center gap-4">
        <div className="bg-[#0055A4] p-2 rounded-sm">
          <PackagePlus className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-widest text-slate-900 uppercase italic">Invensorry Control</h1>
        
        {/* Role Toggle */}
        <div className="ml-auto flex items-center gap-2 bg-slate-50 p-1.5 rounded-md border border-slate-200">
          <button 
            onClick={() => {
              if (userRole !== 'Admin') {
                setShowAdminPinModal(true);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors ${userRole === 'Admin' ? 'bg-[#0055A4] text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Shield className="w-3.5 h-3.5" /> Admin
          </button>
          <button 
            onClick={() => {
              setUserRole('User');
              setActiveTab('inventory');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors ${userRole === 'User' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <User className="w-3.5 h-3.5" /> User
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex justify-between items-center border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 overflow-x-auto">
        <div className="flex min-w-max">
          <button 
            className={`py-4 px-5 font-bold text-sm uppercase tracking-widest flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-[#0055A4] text-[#0055A4]' : 'border-transparent text-slate-500 hover:text-slate-700'}`} 
            onClick={() => setActiveTab('inventory')}
          >
            <List className="w-4 h-4" /> Inventory
          </button>
          {userRole === 'Admin' && (
            <>
              <button 
                className={`py-4 px-5 font-bold text-sm uppercase tracking-widest flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'orders' ? 'border-[#0055A4] text-[#0055A4]' : 'border-transparent text-slate-500 hover:text-slate-700'}`} 
                onClick={() => setActiveTab('orders')}
              >
                <ShoppingCart className="w-4 h-4" /> Orders
              </button>
              <button 
                className={`py-4 px-5 font-bold text-sm uppercase tracking-widest flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'settings' ? 'border-[#0055A4] text-[#0055A4]' : 'border-transparent text-slate-500 hover:text-slate-700'}`} 
                onClick={() => setActiveTab('settings')}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>
            </>
          )}
        </div>
        {activeTab === 'inventory' && userRole === 'Admin' && (
          <button
            onClick={handleManualReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#0055A4] bg-[#0055A4]/10 hover:bg-[#0055A4]/20 rounded-sm transition-colors border border-[#0055A4]/30"
          >
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
        )}
        {activeTab === 'orders' && userRole === 'Admin' && (
          <button
            onClick={handleGenerateOrderReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#0055A4] bg-[#0055A4]/10 hover:bg-[#0055A4]/20 rounded-sm transition-colors border border-[#0055A4]/30"
          >
            <FileText className="w-4 h-4" />
            Generate Order Report
          </button>
        )}
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'inventory' ? (
          <div className="space-y-4">
            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterCategory('All')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors border ${filterCategory === 'All' ? 'bg-[#0055A4] text-white border-[#0055A4]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                All Components
              </button>
              {(['Mechanical', 'Pneumatic', 'Electrical'] as Category[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors border ${filterCategory === cat ? 'bg-[#0055A4] text-white border-[#0055A4]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  {getCategoryIcon(cat)}
                  {cat}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
            
            {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <th className="p-5">Item No</th>
                  <th className="p-5">Description</th>
                  <th className="p-5">Status</th>
                  <th className="p-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inventory.filter(item => filterCategory === 'All' || item.category === filterCategory).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-5 font-mono text-sm text-slate-500">{item.id}</td>
                    <td className="p-5 text-slate-900 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500" title={item.category}>
                          {getCategoryIcon(item.category)}
                        </span>
                        {item.name}
                      </div>
                    </td>
                    <td className="p-5">
                      {renderStatus(item)}
                    </td>
                    <td className="p-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleReportLowStock(item)}
                          disabled={item.status === 'Low Stock' || item.status === 'Ordering'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-rose-500/20"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Report Low
                        </button>
                        
                        {userRole === 'Admin' && (
                          <>
                            <button 
                              onClick={() => handleRequestOrderClick(item)}
                              disabled={item.status === 'Ordering'}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-amber-500/20"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              Order
                            </button>
                            <button 
                              onClick={() => handleRestock(item)}
                              disabled={item.status === 'Normal'}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-[#0055A4]/10 text-[#0055A4] hover:bg-[#0055A4]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-[#0055A4]/30"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              Restock
                            </button>
                          </>
                        )}

                        <button 
                          onClick={() => handleCopyLink(item)}
                          title="Copy Direct Report Link"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors border border-slate-200"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                        </button>

                        {userRole === 'Admin' && (
                          <button 
                            onClick={() => handleDeleteClick(item)}
                            title="Delete Item"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors border border-slate-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {inventory.filter(item => filterCategory === 'All' || item.category === filterCategory).map((item) => (
              <div key={item.id} className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-500">
                        {getCategoryIcon(item.category, "w-3.5 h-3.5")}
                      </span>
                      <div className="text-xs font-mono text-slate-500">{item.id}</div>
                    </div>
                    <div className="text-base font-bold text-slate-900">{item.name}</div>
                  </div>
                  <div>
                    {renderStatus(item)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button 
                    onClick={() => handleReportLowStock(item)}
                    disabled={item.status === 'Low Stock' || item.status === 'Ordering'}
                    className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-rose-500/20"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Report Low
                  </button>
                  
                  {userRole === 'Admin' && (
                    <>
                      <button 
                        onClick={() => handleRequestOrderClick(item)}
                        disabled={item.status === 'Ordering'}
                        className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-amber-500/20"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Order
                      </button>
                      <button 
                        onClick={() => handleRestock(item)}
                        disabled={item.status === 'Normal'}
                        className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-[#0055A4]/10 text-[#0055A4] hover:bg-[#0055A4]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-[#0055A4]/30"
                      >
                        <PackagePlus className="w-4 h-4" />
                        Restock
                      </button>
                    </>
                  )}
                  
                  <button 
                    onClick={() => handleCopyLink(item)}
                    className="inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors border border-slate-200"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  
                  {userRole === 'Admin' && (
                    <button 
                      onClick={() => handleDeleteClick(item)}
                      className="inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors border border-slate-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
        </div>
        ) : activeTab === 'orders' && userRole === 'Admin' ? (
          <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-[#0055A4]" />
                Order History
              </h2>
            </div>
            
            {orderHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono text-sm">
                No orders have been placed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      <th className="p-5">Order ID</th>
                      <th className="p-5">Date & Time</th>
                      <th className="p-5">Item</th>
                      <th className="p-5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {orderHistory.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 font-mono text-sm text-slate-500">{order.id}</td>
                        <td className="p-5 text-sm text-slate-500">{order.date}</td>
                        <td className="p-5 text-slate-900 font-medium">
                          <div className="flex flex-col">
                            <span>{order.itemName}</span>
                            <span className="text-xs font-mono text-slate-500">{order.itemId}</span>
                          </div>
                        </td>
                        <td className="p-5">
                          {order.status === 'Pending' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'settings' && userRole === 'Admin' ? (
          <div className="max-w-md mx-auto mt-8 bg-white p-6 rounded-sm shadow-sm border border-slate-200">
            <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-6 flex items-center gap-3 border-b border-slate-200 pb-4">
              <Settings className="w-5 h-5 text-[#0055A4]" />
              System Settings
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Email Settings</h3>
                <form onSubmit={handleSaveEmail} className="space-y-4 mb-8">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Admin Email Address (for reports)</label>
                    <input 
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-300 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all font-mono text-sm placeholder:text-slate-400"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] rounded-sm hover:bg-[#004488] transition-colors"
                  >
                    Save Email
                  </button>
                </form>
              </div>
              
              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Add Inventory Items</h3>
                <form onSubmit={handleBulkAdd} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Category</label>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {(['Mechanical', 'Pneumatic', 'Electrical'] as Category[]).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`flex flex-col items-center justify-center gap-2 p-3 rounded-sm border transition-colors ${selectedCategory === cat ? 'bg-[#0055A4]/10 border-[#0055A4] text-[#0055A4]' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                        >
                          {getCategoryIcon(cat, "w-5 h-5")}
                          <span className="text-[10px] font-bold uppercase tracking-wider">{cat}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Descriptions / Names (One per line)</label>
                    <textarea 
                      value={bulkItemsText}
                      onChange={(e) => setBulkItemsText(e.target.value)}
                      placeholder="e.g. M8 Hex Nut&#10;M10 Washer&#10;M12 Bolt"
                      className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-300 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all min-h-[120px] resize-y font-mono text-sm placeholder:text-slate-400"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] rounded-sm hover:bg-[#004488] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Items
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Admin PIN Modal */}
      {showAdminPinModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-8 relative text-center">
            <button 
              onClick={() => {
                setShowAdminPinModal(false);
                setAdminPinInput('');
              }}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-[#0055A4]" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-widest text-slate-900 mb-2">Admin Access</h2>
            <p className="text-sm text-slate-500 mb-8">Enter PIN to switch to Admin role.</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              if (adminPinInput === '4334') {
                setUserRole('Admin');
                setActiveTab('inventory');
                setShowAdminPinModal(false);
                setAdminPinInput('');
                toast.success('Admin access granted.');
              } else {
                toast.error('Invalid PIN.');
                setAdminPinInput('');
              }
            }}>
              <input 
                type="password" 
                value={adminPinInput} 
                onChange={e => setAdminPinInput(e.target.value)}
                className="w-full bg-slate-50 text-center text-2xl text-slate-900 border border-slate-300 p-4 rounded-sm mb-6 focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none font-mono tracking-[1em]"
                placeholder="••••"
                autoFocus
              />
              <button 
                type="submit"
                className="w-full px-5 py-3 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] hover:bg-[#004488] rounded-sm transition-colors"
              >
                Unlock Admin
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-6 relative">
            <button 
              onClick={() => setDeleteModal({ isOpen: false, itemId: null })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Confirm Deletion
            </h3>
            <p className="text-sm text-slate-500 mb-8">
              Are you sure you want to permanently delete this item from the system? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteModal({ isOpen: false, itemId: null })}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 rounded-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Modal */}
      {orderModal.isOpen && orderModal.item && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-6 relative">
            <button 
              onClick={() => setOrderModal({ isOpen: false, item: null, supplierName: '', cost: '' })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#0055A4]" />
              Place Order
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Ordering: <span className="font-bold text-slate-900">{orderModal.item.name}</span>
            </p>
            <form onSubmit={confirmOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Supplier Name</label>
                <input 
                  type="text" 
                  value={orderModal.supplierName}
                  onChange={e => setOrderModal(prev => ({ ...prev, supplierName: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Cost of Purchase</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={orderModal.cost}
                  onChange={e => setOrderModal(prev => ({ ...prev, cost: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all font-mono text-sm"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setOrderModal({ isOpen: false, item: null, supplierName: '', cost: '' })}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] hover:bg-[#004488] rounded-sm transition-colors"
                >
                  Confirm Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
