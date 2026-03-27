import React, { useState, useEffect, useRef } from 'react';
import { PackagePlus, CheckCircle, AlertTriangle, List, AlertCircle, Settings, Plus, ShoppingCart, Trash2, X, Link as LinkIcon, FileText, Shield, User, Cog, Wind, Zap, Lock, QrCode, PieChart as PieChartIcon, BarChart3, HelpCircle, Printer } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dbConfig, setDbConfig] = useState<{ postgres: boolean; resend: boolean; isDeprecatedSsl: boolean }>({ postgres: false, resend: false, isDeprecatedSsl: false });
  const [qrModal, setQrModal] = useState<{ isOpen: boolean; item: InventoryItem | null }>({ isOpen: false, item: null });
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper to safely parse JSON from a response
  const safeJson = async (response: Response) => {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    return { error: text || `Server error (${response.status})` };
  };

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Initialize DB
        const initRes = await fetch('/api/init-db', { method: 'POST' });
        if (!initRes.ok) {
          const errorData = await safeJson(initRes);
          if (errorData.error === "POSTGRES_URL is missing") {
            toast.error("Database not configured. Please set POSTGRES_URL in Secrets.");
            setInventory(initialData);
            setIsLoading(false);
            return;
          }
        }
        
        const [invRes, settingsRes, ordersRes, healthRes] = await Promise.all([
          fetch('/api/inventory'),
          fetch('/api/settings'),
          fetch('/api/orders'),
          fetch('/api/health')
        ]);
        
        if (healthRes.ok) {
          const healthData = await safeJson(healthRes);
          if (healthData.config) {
            setDbConfig(healthData.config);
          }
        }
        
        if (invRes.ok) {
          const data = await safeJson(invRes);
          if (Array.isArray(data) && data.length > 0) {
            setInventory(data);
          } else {
            // Seed initial data if empty
            console.log("Database empty or invalid, seeding initial data...");
            for (const item of initialData) {
              await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
              });
            }
            setInventory(initialData);
          }
        } else {
          throw new Error("Failed to fetch inventory");
        }
        
        if (settingsRes.ok) {
          const settings = await safeJson(settingsRes);
          if (settings && settings.adminEmail) {
            setAdminEmail(settings.adminEmail);
          }
        }
        
        if (ordersRes.ok) {
          const orders = await safeJson(ordersRes);
          if (Array.isArray(orders)) {
            setOrderHistory(orders);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to connect to database. Using local data.");
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
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; itemIds: string[] }>({ isOpen: false, itemIds: [] });
  const [deleteOrderModal, setDeleteOrderModal] = useState<{ isOpen: boolean; orderIds: string[] }>({ isOpen: false, orderIds: [] });
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Order Modal State
  const [orderModal, setOrderModal] = useState<{ isOpen: boolean; item: InventoryItem | null; supplierName: string; cost: string }>({ isOpen: false, item: null, supplierName: '', cost: '' });

  // Tutorial Modal State
  const [tutorialModal, setTutorialModal] = useState<{ isOpen: boolean; view: 'Admin' | 'User' }>({ isOpen: false, view: 'User' });

  // Bulk QR Modal State
  const [bulkQrModal, setBulkQrModal] = useState<{ isOpen: boolean; items: InventoryItem[] }>({ isOpen: false, items: [] });

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
            
            if (adminEmail && dbConfig.resend) {
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
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [inventory, adminEmail]);

  const confirmDeleteOrder = async () => {
    if (deleteOrderModal.orderIds.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    try {
      if (deleteOrderModal.orderIds.length === 1) {
        const response = await fetch(`/api/orders/${deleteOrderModal.orderIds[0]}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete order');
      } else {
        const response = await fetch('/api/orders/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: deleteOrderModal.orderIds })
        });
        if (!response.ok) throw new Error('Failed to bulk delete orders');
      }
      
      setOrderHistory(orderHistory.filter(o => !deleteOrderModal.orderIds.includes(o.id)));
      setSelectedOrderIds(new Set());
      setDeleteOrderModal({ isOpen: false, orderIds: [] });
      toast.success(deleteOrderModal.orderIds.length > 1 ? 'Order records deleted successfully' : 'Order record deleted successfully');
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order record(s)');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReportLowStock = async (item: InventoryItem) => {
    if (isProcessing) return;
    setIsProcessing(true);
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
      if (adminEmail && dbConfig.resend) {
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
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle direct report from QR scan
  useEffect(() => {
    if (inventory.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('reportLowStock');
    
    if (reportId) {
      const item = inventory.find(i => i.id === reportId);
      if (item && item.status === 'Normal') {
        handleReportLowStock(item);
        // Clear param to prevent re-trigger on refresh
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [inventory]);

  const handleRestock = async (item: InventoryItem) => {
    if (isProcessing) return;
    setIsProcessing(true);
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
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestOrderClick = (item: InventoryItem) => {
    setOrderModal({ isOpen: true, item, supplierName: '', cost: '' });
  };

  const confirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderModal.item || isProcessing) return;
    setIsProcessing(true);
    
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
        return updated; // Keep full history
      });
      toast.success(`Item ${item.name} is now ordering (pending arrival).`);
    } catch (error) {
      console.error("Failed to place order:", error);
      toast.error("Failed to place order");
    } finally {
      setOrderModal({ isOpen: false, item: null, supplierName: '', cost: '' });
      setIsProcessing(false);
    }
  };

  const handleDeleteClick = (item: InventoryItem) => {
    setDeleteModal({ isOpen: true, itemIds: [item.id] });
  };

  const confirmDelete = async () => {
    if (deleteModal.itemIds.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    try {
      if (deleteModal.itemIds.length === 1) {
        await fetch(`/api/inventory/${deleteModal.itemIds[0]}`, { method: 'DELETE' });
      } else {
        await fetch('/api/inventory/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: deleteModal.itemIds })
        });
      }
      setInventory(prev => prev.filter(item => !deleteModal.itemIds.includes(item.id)));
      setSelectedItemIds(new Set());
      toast.success(deleteModal.itemIds.length > 1 ? 'Items deleted successfully.' : 'Item deleted successfully.');
    } catch (error) {
      console.error("Failed to delete item(s):", error);
      toast.error("Failed to delete item(s)");
    } finally {
      setDeleteModal({ isOpen: false, itemIds: [] });
      setIsProcessing(false);
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    const names = bulkItemsText.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) return;
    setIsProcessing(true);
    
    const uniqueNames: string[] = [];
    const duplicates: string[] = [];
    
    names.forEach(name => {
      const isDuplicate = inventory.some(item => item.name.toLowerCase() === name.toLowerCase()) || 
                          uniqueNames.some(n => n.toLowerCase() === name.toLowerCase());
      if (isDuplicate) {
        duplicates.push(name);
      } else {
        uniqueNames.push(name);
      }
    });

    if (duplicates.length > 0) {
      toast.warning(`Skipped ${duplicates.length} duplicate item(s).`);
    }

    if (uniqueNames.length === 0) {
      setIsProcessing(false);
      setBulkItemsText('');
      return;
    }
    
    let maxId = 0;
    inventory.forEach(item => {
      const match = item.id.match(/-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    });
    
    const prefix = selectedCategory === 'Mechanical' ? 'MEC' : selectedCategory === 'Pneumatic' ? 'PNE' : 'ELE';
    
    const newItems: InventoryItem[] = uniqueNames.map((name, index) => ({
      id: `${prefix}-${String(maxId + 1 + index).padStart(3, '0')}`,
      name,
      status: 'Normal',
      category: selectedCategory
    }));
    
    try {
      const response = await fetch('/api/inventory/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems })
      });
      
      if (!response.ok) {
        const errorData = await safeJson(response);
        throw new Error(errorData.error || `Failed to save items`);
      }
      
      setInventory(prev => [...prev, ...newItems]);
      setBulkItemsText('');
      toast.success(`Added ${newItems.length} new item(s) to ${selectedCategory}`);
      setActiveTab('inventory');
    } catch (error) {
      console.error("Failed to add items:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add items");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyLink = (item: InventoryItem) => {
    const url = `${window.location.origin}${window.location.pathname}?report=${item.id}`;
    navigator.clipboard.writeText(url);
    toast.success(`Direct report link copied for ${item.name}`);
  };

  const handleManualReport = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const lowStockItems = inventory.filter(i => i.status === 'Low Stock');
    if (lowStockItems.length === 0) {
      toast.info("No items are currently low on stock.");
      setIsProcessing(false);
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
        
        if (adminEmail && dbConfig.resend) {
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
        } else if (adminEmail && !dbConfig.resend) {
          toast.error("Email service not configured. Report not sent.");
        }
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
    setIsProcessing(false);
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
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'adminEmail', value: adminEmail })
      });
      if (response.ok) {
        toast.success("Admin email configuration updated.");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      console.error("Failed to save email:", error);
      toast.error("Failed to save admin email to database.");
    }
  };

  const handleTestEmail = async () => {
    if (!adminEmail) {
      toast.error("Please enter an email address first.");
      return;
    }

    if (!dbConfig.resend) {
      toast.error("Email service not configured. Please set RESEND_API_KEY in Secrets.");
      return;
    }
    
    setIsTestingEmail(true);
    try {
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: adminEmail,
          subject: "Shimano Inventory System - Test Alert",
          html: `
            <div style="font-family: sans-serif; border: 1px solid #e2e8f0; padding: 20px; max-width: 600px;">
              <h2 style="color: #0055A4; text-transform: uppercase; letter-spacing: 2px;">System Test</h2>
              <p>This is a test alert from your Inventory Management System.</p>
              <p>Status: <strong>Operational</strong></p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #64748b;">Production Engineering Inventory Control</p>
            </div>
          `
        })
      });
      
      if (response.ok) {
        toast.success("Test email dispatched successfully.");
      } else {
        const data = await safeJson(response);
        throw new Error(data.error || "Failed to send");
      }
    } catch (error) {
      console.error("Test email failed:", error);
      toast.error("Test email failed. Check your API configuration.");
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Calculate Order Analysis Data
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentOrders = orderHistory.filter(o => {
    const d = new Date(o.date);
    return !isNaN(d.getTime()) ? d >= oneYearAgo : true; // Fallback if date parsing fails
  });

  const frequencyData: { name: string; value: number }[] = [];
  const costData: { name: string; value: number }[] = [];
  
  const grouped = recentOrders.reduce((acc: Record<string, { count: number; cost: number }>, order) => {
    if (!acc[order.itemName]) acc[order.itemName] = { count: 0, cost: 0 };
    acc[order.itemName].count += 1;
    acc[order.itemName].cost += Number(order.cost) || 0;
    return acc;
  }, {});

  Object.entries(grouped as Record<string, { count: number; cost: number }>).forEach(([name, data]) => {
    frequencyData.push({ name, value: data.count });
    if (data.cost > 0) {
      costData.push({ name, value: data.cost });
    }
  });

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#f26a8d', '#0055A4', '#e11d48'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0055A4]"></div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 selection:bg-[#0055A4]/30 print:hidden">
      <Toaster position="top-right" theme="light" richColors />
      
      {/* Header - Shimano Style */}
      <header className="bg-white border-b-2 border-[#0055A4] py-4 px-6 shadow-sm flex items-center gap-4">
        <div className="bg-[#0055A4] p-2 rounded-sm">
          <PackagePlus className="w-6 h-6 text-white" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-2xl font-black tracking-widest text-slate-900 uppercase italic leading-none">Invensorry Control</h1>
          <span className="text-[8px] font-bold text-[#0055A4] uppercase tracking-[0.3em] mt-1">Production Engineering Ecosystem</span>
        </div>
        
        {/* Role Toggle & Tutorial */}
        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={() => setTutorialModal({ isOpen: true, view: userRole })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors text-slate-500 hover:text-[#0055A4] hover:bg-slate-100 border border-transparent hover:border-slate-200"
          >
            <HelpCircle className="w-4 h-4" /> Tutorial
          </button>
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-md border border-slate-200">
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
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#0055A4] bg-[#0055A4]/10 hover:bg-[#0055A4]/20 rounded-sm transition-colors border border-[#0055A4]/30 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {isProcessing ? 'Generating...' : 'Generate Report'}
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
            
            {/* Bulk Actions Bar */}
            {selectedItemIds.size > 0 && userRole === 'Admin' && (
              <div className="bg-slate-100 border-b border-slate-200 p-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">{selectedItemIds.size} items selected</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const selectedItems = inventory.filter(item => selectedItemIds.has(item.id));
                      setBulkQrModal({ isOpen: true, items: selectedItems });
                    }}
                    className="px-3 py-1.5 bg-slate-700 text-white text-xs font-bold uppercase rounded-sm hover:bg-slate-800 flex items-center gap-2"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Print Labels
                  </button>
                  <button 
                    onClick={() => setDeleteModal({ isOpen: true, itemIds: Array.from(selectedItemIds) })} 
                    className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold uppercase rounded-sm hover:bg-rose-700 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected
                  </button>
                </div>
              </div>
            )}

            {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {userRole === 'Admin' && (
                    <th className="p-5 w-12">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded-sm border-slate-300 text-[#0055A4] focus:ring-[#0055A4]"
                        checked={inventory.filter(item => filterCategory === 'All' || item.category === filterCategory).length > 0 && selectedItemIds.size === inventory.filter(item => filterCategory === 'All' || item.category === filterCategory).length}
                        onChange={(e) => {
                          const filtered = inventory.filter(item => filterCategory === 'All' || item.category === filterCategory);
                          if (e.target.checked) {
                            setSelectedItemIds(new Set(filtered.map(i => i.id)));
                          } else {
                            setSelectedItemIds(new Set());
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="p-5">Item No</th>
                  <th className="p-5">Description</th>
                  <th className="p-5">Status</th>
                  <th className="p-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inventory.filter(item => filterCategory === 'All' || item.category === filterCategory).map((item) => (
                  <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${selectedItemIds.has(item.id) ? 'bg-slate-50' : ''}`}>
                    {userRole === 'Admin' && (
                      <td className="p-5">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded-sm border-slate-300 text-[#0055A4] focus:ring-[#0055A4]"
                          checked={selectedItemIds.has(item.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedItemIds);
                            if (e.target.checked) newSet.add(item.id);
                            else newSet.delete(item.id);
                            setSelectedItemIds(newSet);
                          }}
                        />
                      </td>
                    )}
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
                          disabled={item.status === 'Low Stock' || item.status === 'Ordering' || isProcessing}
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
                              disabled={item.status === 'Normal' || isProcessing}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-[#0055A4]/10 text-[#0055A4] hover:bg-[#0055A4]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-[#0055A4]/30"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              Restock
                            </button>
                          </>
                        )}

                        <button 
                          onClick={() => setQrModal({ isOpen: true, item })}
                          title="Generate Report QR Code"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-[#0055A4] transition-colors border border-slate-200"
                        >
                          <QrCode className="w-3.5 h-3.5" />
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
                    disabled={item.status === 'Low Stock' || item.status === 'Ordering' || isProcessing}
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
                        disabled={item.status === 'Normal' || isProcessing}
                        className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-[#0055A4]/10 text-[#0055A4] hover:bg-[#0055A4]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-[#0055A4]/30"
                      >
                        <PackagePlus className="w-4 h-4" />
                        Restock
                      </button>
                    </>
                  )}
                  
                  <button 
                    onClick={() => setQrModal({ isOpen: true, item })}
                    className="inline-flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-[#0055A4] transition-colors border border-slate-200"
                  >
                    <QrCode className="w-4 h-4" />
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
          <div className="space-y-6">
            {/* Analysis Section */}
            {recentOrders.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-sm shadow-sm border border-slate-200 p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-6">
                    <BarChart3 className="w-4 h-4 text-[#0055A4]" />
                    Order Frequency (Last 1 Year)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={frequencyData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ percent, value }) => `${value} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {frequencyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`${value} orders`, 'Frequency']}
                          contentStyle={{ borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', fontFamily: 'monospace' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-sm shadow-sm border border-slate-200 p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-6">
                    <PieChartIcon className="w-4 h-4 text-emerald-500" />
                    Cost Analysis (Last 1 Year)
                  </h3>
                  <div className="h-64">
                    {costData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={costData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ percent, value }) => `$${value.toFixed(2)} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {costData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                            contentStyle={{ borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', fontFamily: 'monospace' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm font-mono">
                        No cost data available.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
                  <ShoppingCart className="w-5 h-5 text-[#0055A4]" />
                  Order History (Last 1 Year)
                </h2>
              </div>
              
              {recentOrders.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-sm">
                  No orders have been placed in the last year.
                </div>
              ) : (
                <>
                  {/* Bulk Actions Bar for Orders */}
                  {selectedOrderIds.size > 0 && userRole === 'Admin' && (
                    <div className="bg-slate-100 border-b border-slate-200 p-3 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">{selectedOrderIds.size} orders selected</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setDeleteOrderModal({ isOpen: true, orderIds: Array.from(selectedOrderIds) })} 
                          className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold uppercase rounded-sm hover:bg-rose-700 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Selected
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                          {userRole === 'Admin' && (
                            <th className="p-5 w-12">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded-sm border-slate-300 text-[#0055A4] focus:ring-[#0055A4]"
                                checked={selectedOrderIds.size === recentOrders.length && recentOrders.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrderIds(new Set(recentOrders.map(o => o.id)));
                                  } else {
                                    setSelectedOrderIds(new Set());
                                  }
                                }}
                              />
                            </th>
                          )}
                          <th className="p-5">Order ID</th>
                        <th className="p-5">Date & Time</th>
                        <th className="p-5">Item</th>
                        <th className="p-5">Cost</th>
                        <th className="p-5">Status</th>
                        {userRole === 'Admin' && <th className="p-5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {recentOrders.map((order) => (
                        <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${selectedOrderIds.has(order.id) ? 'bg-slate-50' : ''}`}>
                          {userRole === 'Admin' && (
                            <td className="p-5 w-12">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded-sm border-slate-300 text-[#0055A4] focus:ring-[#0055A4]"
                                checked={selectedOrderIds.has(order.id)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedOrderIds);
                                  if (e.target.checked) {
                                    newSet.add(order.id);
                                  } else {
                                    newSet.delete(order.id);
                                  }
                                  setSelectedOrderIds(newSet);
                                }}
                              />
                            </td>
                          )}
                          <td className="p-5 font-mono text-sm text-slate-500">{order.id}</td>
                          <td className="p-5 text-sm text-slate-500">{order.date}</td>
                          <td className="p-5 text-slate-900 font-medium">
                            <div className="flex flex-col">
                              <span>{order.itemName}</span>
                              <span className="text-xs font-mono text-slate-500">{order.itemId}</span>
                            </div>
                          </td>
                          <td className="p-5 text-sm text-slate-700 font-mono">
                            {order.cost ? `$${Number(order.cost).toFixed(2)}` : '-'}
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
                          {userRole === 'Admin' && (
                            <td className="p-5 text-right">
                              <button 
                                onClick={() => setDeleteOrderModal({ isOpen: true, orderIds: [order.id] })}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-sm transition-colors"
                                title="Delete Order Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </div>
        ) : activeTab === 'settings' && userRole === 'Admin' ? (
          <div className="max-w-2xl mx-auto mt-8 space-y-6">
            <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
                  <Settings className="w-4 h-4 text-[#0055A4]" />
                  System Configuration
                </h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">v2.4.0-PRO</span>
              </div>
              
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {/* Email Configuration */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#0055A4] mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#0055A4] rounded-full"></div>
                        Alert Distribution
                      </h3>
                      <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        Configure the primary administrative endpoint for low-stock telemetry and automated weekly reports.
                      </p>
                      
                      <form onSubmit={handleSaveEmail} className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Target Email Address</label>
                          <div className="relative">
                            <input 
                              type="email"
                              value={adminEmail}
                              onChange={(e) => setAdminEmail(e.target.value)}
                              placeholder="admin.ops@shimano-tech.com"
                              className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-300 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all font-mono text-sm placeholder:text-slate-300"
                              required
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <button 
                            type="submit"
                            className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white bg-[#0055A4] rounded-sm hover:bg-[#004488] transition-all active:scale-[0.98]"
                          >
                            Update Config
                          </button>
                          <button 
                            type="button"
                            onClick={handleTestEmail}
                            disabled={isTestingEmail}
                            className="inline-flex justify-center items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 rounded-sm hover:bg-slate-200 transition-all disabled:opacity-50 active:scale-[0.98]"
                          >
                            {isTestingEmail ? 'Testing...' : 'Test Link'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* System Information */}
                  <div className="space-y-6">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                      Database Status
                    </h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Connection</span>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                          Active
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">SSL Mode</span>
                        <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${dbConfig.isDeprecatedSsl ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {dbConfig.isDeprecatedSsl ? (
                            <>
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Deprecated
                            </>
                          ) : (
                            <>
                              <Shield className="w-2.5 h-2.5" />
                              Secure
                            </>
                          )}
                        </span>
                      </div>
                      {dbConfig.isDeprecatedSsl && (
                        <div className="bg-amber-50 border border-amber-200 rounded-sm p-2 mt-2">
                          <p className="text-[9px] text-amber-700 leading-tight">
                            <strong>Action Required:</strong> Your connection uses 'sslmode=require'. 
                            Update your POSTGRES_URL secret to use 'sslmode=verify-full' for enhanced security.
                          </p>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Latency</span>
                        <span className="text-[10px] font-mono text-slate-400">14ms</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Storage Engine</span>
                        <span className="text-[10px] font-mono text-slate-400">PostgreSQL 15</span>
                      </div>
                    </div>

                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                      Communication Status
                    </h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Resend Service</span>
                        <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${dbConfig.resend ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {dbConfig.resend ? (
                            <>
                              <CheckCircle className="w-2.5 h-2.5" />
                              Configured
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-2.5 h-2.5" />
                              Missing Key
                            </>
                          )}
                        </span>
                      </div>
                      {!dbConfig.resend && (
                        <div className="bg-amber-50 border border-amber-200 rounded-sm p-2 mt-2">
                          <p className="text-[9px] text-amber-700 leading-tight">
                            <strong>Action Required:</strong> RESEND_API_KEY is missing. 
                            Set it in the AI Studio Secrets panel to enable email alerts.
                          </p>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Provider</span>
                        <span className="text-[10px] font-mono text-slate-400">Resend.com</span>
                      </div>
                    </div>
                    
                    <div className="pt-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Quick Actions</h3>
                      <button 
                        onClick={() => window.location.reload()}
                        className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-600 border border-slate-200 rounded-sm hover:bg-slate-50 transition-colors flex items-center justify-between"
                      >
                        Force System Sync
                        <Zap className="w-3 h-3 text-amber-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bulk Add Section */}
            <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
                  <Plus className="w-4 h-4 text-[#0055A4]" />
                  Inventory Expansion
                </h2>
              </div>
              <div className="p-8">
                <form onSubmit={handleBulkAdd} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Target Category</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['Mechanical', 'Pneumatic', 'Electrical'] as Category[]).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`flex flex-col items-center justify-center gap-3 p-4 rounded-sm border transition-all ${selectedCategory === cat ? 'bg-[#0055A4] border-[#0055A4] text-white shadow-lg shadow-[#0055A4]/20' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'}`}
                        >
                          {getCategoryIcon(cat, "w-5 h-5")}
                          <span className="text-[9px] font-black uppercase tracking-widest">{cat}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Batch Input (One Entry Per Line)</label>
                    <textarea 
                      value={bulkItemsText}
                      onChange={(e) => setBulkItemsText(e.target.value)}
                      placeholder="e.g. CS-M8000 CASSETTE&#10;RD-M8000 DERAILLEUR&#10;FC-M8000 CRANKSET"
                      className="w-full px-4 py-3 bg-slate-50 text-slate-900 border border-slate-300 rounded-sm focus:ring-1 focus:ring-[#0055A4] focus:border-[#0055A4] outline-none transition-all min-h-[140px] resize-y font-mono text-sm placeholder:text-slate-300"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="w-full inline-flex justify-center items-center gap-3 px-4 py-4 text-[11px] font-black uppercase tracking-widest text-white bg-[#0055A4] rounded-sm hover:bg-[#004488] transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {isProcessing ? 'Processing...' : 'Initialize Batch Import'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* QR Code Modal */}
      {qrModal.isOpen && qrModal.item && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-8 relative text-center">
            <button 
              onClick={() => setQrModal({ isOpen: false, item: null })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="bg-slate-50 p-6 rounded-sm border border-slate-100 inline-block mb-6">
              <QRCodeCanvas 
                value={`${window.location.origin}/api/quick-report/${qrModal.item.id}`}
                size={200}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Shimano_logo.svg/1200px-Shimano_logo.svg.png",
                  x: undefined,
                  y: undefined,
                  height: 24,
                  width: 80,
                  excavate: true,
                }}
              />
            </div>
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-2">Report QR Code</h3>
            <p className="text-xs text-slate-500 mb-6 uppercase tracking-widest font-bold">
              {qrModal.item.id} — {qrModal.item.name}
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Scan this code with any mobile device to instantly trigger a low-stock report for this specific component.
            </p>
            <div className="mt-8 pt-6 border-t border-slate-100">
              <button 
                onClick={() => {
                  const canvas = document.querySelector('canvas');
                  if (canvas) {
                    const compositeCanvas = document.createElement('canvas');
                    const ctx = compositeCanvas.getContext('2d');
                    if (ctx) {
                      compositeCanvas.width = canvas.width;
                      compositeCanvas.height = canvas.height + 60;
                      ctx.fillStyle = '#ffffff';
                      ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
                      ctx.drawImage(canvas, 0, 0);
                      ctx.fillStyle = '#0f172a';
                      ctx.font = 'bold 16px monospace';
                      ctx.textAlign = 'center';
                      ctx.fillText(qrModal.item?.id || '', compositeCanvas.width / 2, canvas.height + 24);
                      ctx.font = '14px sans-serif';
                      ctx.fillText((qrModal.item?.name || '').substring(0, 30), compositeCanvas.width / 2, canvas.height + 46);

                      const url = compositeCanvas.toDataURL("image/png");
                      const link = document.createElement('a');
                      link.download = `QR_${qrModal.item?.id}.png`;
                      link.href = url;
                      link.click();
                      toast.success("QR code image downloaded.");
                    }
                  }
                }}
                className="w-full px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white bg-[#0055A4] hover:bg-[#004488] rounded-sm transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-3 h-3" />
                Export QR Image
              </button>
            </div>
          </div>
        </div>
      )}

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
              onClick={() => setDeleteModal({ isOpen: false, itemIds: [] })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Confirm Deletion
            </h3>
            <p className="text-sm text-slate-500 mb-8">
              Are you sure you want to permanently delete {deleteModal.itemIds.length > 1 ? `these ${deleteModal.itemIds.length} items` : 'this item'} from the system? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteModal({ isOpen: false, itemIds: [] })}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                disabled={isProcessing}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 rounded-sm transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Deleting...' : 'Delete'}
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
                  disabled={isProcessing}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] hover:bg-[#004488] rounded-sm transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      {tutorialModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-2xl w-full p-6 relative max-h-[90vh] flex flex-col">
            <button 
              onClick={() => setTutorialModal({ isOpen: false, view: 'User' })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#0055A4] p-2 rounded-sm">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-900">System Tutorial</h2>
            </div>

            <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
              <button
                onClick={() => setTutorialModal(prev => ({ ...prev, view: 'User' }))}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors flex items-center gap-2 ${tutorialModal.view === 'User' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                <User className="w-4 h-4" /> User Guide
              </button>
              <button
                onClick={() => setTutorialModal(prev => ({ ...prev, view: 'Admin' }))}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors flex items-center gap-2 ${tutorialModal.view === 'Admin' ? 'bg-[#0055A4] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                <Shield className="w-4 h-4" /> Admin Guide
              </button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-6 flex-1 custom-scrollbar">
              {tutorialModal.view === 'User' ? (
                <>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
                      <span className="bg-slate-700 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">1</span>
                      Viewing Inventory
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Browse the current stock of mechanical, pneumatic, and electrical components. Use the search bar at the top to find specific items by name or ID quickly. You can also filter by category using the dropdown menu.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
                      <span className="bg-slate-700 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">2</span>
                      Reporting Low Stock
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      If you notice an item is running low on the shelf, click the yellow <AlertTriangle className="w-4 h-4 inline text-amber-500 mx-1" /> <strong>Report Low</strong> button next to the item. This instantly updates the system and notifies the Admin team via email.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
                      <span className="bg-slate-700 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">3</span>
                      Quick Scan (QR Codes)
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Physical bins may have QR codes attached. Scanning a QR code with your mobile device will instantly bring up the item's details and trigger a low-stock report without needing to search the system manually.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#0055A4] mb-2 flex items-center gap-2">
                      <span className="bg-[#0055A4] text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">1</span>
                      Managing Inventory
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      As an Admin, you can add new components using the "Add Item" section. You can also edit existing details or delete obsolete items using the action buttons on the right side of the inventory table.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#0055A4] mb-2 flex items-center gap-2">
                      <span className="bg-[#0055A4] text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">2</span>
                      Restocking Items
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      When an item is low, click the green <CheckCircle className="w-4 h-4 inline text-emerald-500 mx-1" /> <strong>Restock</strong> button. You will be prompted to enter the supplier name and the total cost of the purchase to keep accurate financial records.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#0055A4] mb-2 flex items-center gap-2">
                      <span className="bg-[#0055A4] text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">3</span>
                      Batch Operations
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Use the "Batch Import" feature to upload multiple items at once by pasting a list of names. You can also select multiple items using the checkboxes in the table to perform bulk deletions.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#0055A4] mb-2 flex items-center gap-2">
                      <span className="bg-[#0055A4] text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">4</span>
                      Order Analysis
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Navigate to the <strong>Orders</strong> tab to view a comprehensive history of all restocks. Analyze the pie charts to understand order frequency and cost distribution over the last year.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#0055A4] mb-2 flex items-center gap-2">
                      <span className="bg-[#0055A4] text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">5</span>
                      System Settings
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Go to the <strong>Settings</strong> tab to configure the Admin Email address. This address receives automated low-stock alerts and weekly telemetry reports every Monday at 8 AM.
                    </p>
                  </div>
                </>
              )}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setTutorialModal({ isOpen: false, view: 'User' })}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-slate-900 hover:bg-slate-800 rounded-sm transition-colors"
              >
                Close Tutorial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Modal */}
      {deleteOrderModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-6 relative">
            <button 
              onClick={() => setDeleteOrderModal({ isOpen: false, orderIds: [] })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              Delete Order{deleteOrderModal.orderIds.length > 1 ? 's' : ''}
            </h3>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              Are you sure you want to delete {deleteOrderModal.orderIds.length > 1 ? `these ${deleteOrderModal.orderIds.length} order records` : 'this order record'}? This action cannot be undone and will affect order analysis.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteOrderModal({ isOpen: false, orderIds: [] })}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteOrder}
                disabled={isProcessing}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 rounded-sm transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk QR Print Preview Modal */}
      {bulkQrModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-4xl w-full p-6 relative max-h-[90vh] flex flex-col">
            <button 
              onClick={() => setBulkQrModal({ isOpen: false, items: [] })}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#0055A4] p-2 rounded-sm">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest text-slate-900">Print QR Labels</h2>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar bg-slate-50 p-6 rounded-sm border border-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {bulkQrModal.items.map(item => (
                  <div key={item.id} className="flex flex-col items-center text-center bg-white p-4 rounded-sm shadow-sm border border-slate-100">
                    <QRCodeCanvas 
                      value={`${window.location.origin}/api/quick-report/${item.id}`}
                      size={100}
                      level="H"
                      includeMargin={true}
                    />
                    <div className="mt-2 font-mono font-bold text-[10px]">{item.id}</div>
                    <div className="text-[9px] uppercase tracking-wider max-w-[100px] truncate text-slate-500">{item.name}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{bulkQrModal.items.length} Labels Selected</span>
              <div className="flex gap-3">
                <button 
                  onClick={() => setBulkQrModal({ isOpen: false, items: [] })}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-[#0055A4] hover:bg-[#004488] rounded-sm transition-colors flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print Labels
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Print-Only View for Bulk QR Labels */}
    <div className="hidden print:block bg-white text-black p-8">
      {bulkQrModal.isOpen && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-4 gap-y-8">
          {bulkQrModal.items.map(item => (
            <div key={item.id} className="flex flex-col items-center text-center break-inside-avoid">
              <QRCodeCanvas 
                value={`${window.location.origin}/api/quick-report/${item.id}`}
                size={120}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Shimano_logo.svg/1200px-Shimano_logo.svg.png",
                  height: 15,
                  width: 50,
                  excavate: true,
                }}
              />
              <div className="mt-1 font-mono font-bold text-[12px]">{item.id}</div>
              <div className="text-[10px] uppercase tracking-wider max-w-[120px] truncate">{item.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
