import React, { useState, useEffect, useMemo } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiTrash2,
  FiCalendar,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiSearch,
  FiPrinter,
  FiUserPlus,
  FiRefreshCw,
  FiCopy,
  FiMenu,
  FiArrowLeft,
  FiShoppingBag,
} from 'react-icons/fi';
import { Product, SaleRecord, FactoryProfile, DEFAULT_FACTORY_PROFILE } from '../types';
import {
  fetchSales,
  recordSale,
  recordSalesBatch,
  deleteSale,
  fetchProductSellingPrices,
  supabase,
} from '../services/supabase';
import { AnimatedNumber } from './AnimatedNumber';
import { createPortal } from 'react-dom';
import { useFeedback } from '../context/FeedbackContext';

interface SalesAdminViewProps {
  products: Product[];
}

interface BuyerInfo {
  name: string;
  phone?: string;
  shopName?: string;
}

export interface InvoiceItem {
  id: string;
  selected: boolean;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  gstRate: number; // 0, 3, 5, 12, 18
}

export interface BillData {
  invoiceNo: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  items: Array<{
    sn: number;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    gstRate: number;
    amount: number;
  }>;
  subtotal: number;
  discount: number;
  totalGst: number;
  grandTotal: number;
  gstBreakdown: Record<number, number>;
}

export const SalesAdminView: React.FC<SalesAdminViewProps> = ({ products }) => {
  const { showToast, confirm } = useFeedback();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [costingPrices, setCostingPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'list' | 'new_bill'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('sub') === 'new_bill' ? 'new_bill' : 'list';
    } catch {
      return 'list';
    }
  });

  // Sync sub-view with browser history so Back button returns to Sales list instead of leaving the site
  useEffect(() => {
    const handleSubPopState = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sub') === 'new_bill') {
        setViewMode('new_bill');
      } else {
        setViewMode('list');
      }
    };
    window.addEventListener('popstate', handleSubPopState);
    return () => window.removeEventListener('popstate', handleSubPopState);
  }, []);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Bill print modal state
  const [activeBill, setActiveBill] = useState<BillData | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [billCopied, setBillCopied] = useState<boolean>(false);

  const cleanFooter = (text?: string) => {
    return (text || '').replace(/ശുദ്ധമായ എണ്ണയിൽ തയ്യാറാക്കിയത്\.?/g, '').trim();
  };

  const getFreshBillProfile = (): FactoryProfile => {
    try {
      const saved = localStorage.getItem('pulari_factory_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.billFooter) {
          parsed.billFooter = cleanFooter(parsed.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.';
        }
        return { ...DEFAULT_FACTORY_PROFILE, ...parsed };
      }
    } catch {
      // fallback
    }
    return DEFAULT_FACTORY_PROFILE;
  };

  // Business / Bill Profile (Synced from Settings)
  const [billProfile, setBillProfile] = useState<FactoryProfile>(getFreshBillProfile);

  // Re-sync bill profile from local storage, events, and remote audit_logs
  useEffect(() => {
    const handleSync = () => {
      setBillProfile(getFreshBillProfile());
    };

    window.addEventListener('pulari_factory_profile_updated', handleSync);
    window.addEventListener('storage', handleSync);

    handleSync();

    (async () => {
      try {
        const { data } = await supabase
          .from('audit_logs')
          .select('details')
          .eq('action', 'FACTORY_PROFILE_UPDATED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0 && data[0].details) {
          const remoteProfile = data[0].details;
          if (remoteProfile.billFooter) {
            remoteProfile.billFooter = cleanFooter(remoteProfile.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.';
          }
          const merged = { ...DEFAULT_FACTORY_PROFILE, ...remoteProfile };
          setBillProfile(merged);
          localStorage.setItem('pulari_factory_profile', JSON.stringify(merged));
        }
      } catch {
        // silent fallback
      }
    })();

    return () => {
      window.removeEventListener('pulari_factory_profile_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [isBillModalOpen]);

  // Buyers management state
  const [buyersList, setBuyersList] = useState<BuyerInfo[]>(() => {
    try {
      const saved = localStorage.getItem('pulari_buyers_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAddBuyerModal, setShowAddBuyerModal] = useState<boolean>(false);
  const [newBuyerName, setNewBuyerName] = useState<string>('');
  const [newBuyerPhone, setNewBuyerPhone] = useState<string>('');
  const [newBuyerShop, setNewBuyerShop] = useState<string>('');

  // Billing Full Screen Form State (Image 1 ERP / Billing UI)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [invoiceDate, setInvoiceDate] = useState<string>(todayStr);
  const [invoiceNo, setInvoiceNo] = useState<string>('INV-00123');
  const [customerName, setCustomerName] = useState<string>('Ramesh Traders');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentStatus, setPaymentStatus] = useState<string>('paid');
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [salesData, pricesData] = await Promise.all([
        fetchSales(),
        fetchProductSellingPrices(),
      ]);

      setSales(salesData);

      // Build costing price map (Product-wise Costing Sell Price/kg)
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        if (p.productId && p.wholesalePricePerKg > 0) {
          priceMap[p.productId] = p.wholesalePricePerKg;
        }
      }
      setCostingPrices(priceMap);

      // Extract past buyers if not in list
      const pastBuyerNames = Array.from(new Set(salesData.map((s) => s.customer_name).filter(Boolean)));
      setBuyersList((prev) => {
        const existingNames = new Set(prev.map((b) => b.name.toLowerCase()));
        const additions: BuyerInfo[] = [];
        for (const name of pastBuyerNames) {
          if (name && !existingNames.has(name.toLowerCase())) {
            additions.push({ name });
          }
        }
        return [...prev, ...additions];
      });
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save buyers list to localStorage
  const handleAddNewBuyer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuyerName.trim()) return;

    const newBuyer: BuyerInfo = {
      name: newBuyerName.trim(),
      phone: newBuyerPhone.trim() || undefined,
      shopName: newBuyerShop.trim() || undefined,
    };

    const updated = [newBuyer, ...buyersList.filter((b) => b.name.toLowerCase() !== newBuyer.name.toLowerCase())];
    setBuyersList(updated);
    try {
      localStorage.setItem('pulari_buyers_list', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save buyers:', err);
    }

    setCustomerName(newBuyer.name);
    setNewBuyerName('');
    setNewBuyerPhone('');
    setNewBuyerShop('');
    setShowAddBuyerModal(false);
  };

  // Helper to get initial price for product
  const getProductInitialPrice = (pId: string): number => {
    const costPrice = costingPrices[pId];
    if (costPrice && costPrice > 0) return costPrice;
    const prod = products.find((p) => p.id === pId);
    if (prod && prod.wholesalePrice && prod.wholesalePrice > 0) return prod.wholesalePrice;
    return 160;
  };

  // Open New Bill Modal (Full Screen)
  const handleOpenNewBill = () => {
    const defaultProduct = products.length > 0 ? products[0] : null;
    const initialPrice = defaultProduct ? getProductInitialPrice(defaultProduct.id) : 160;

    const initialItem: InvoiceItem = {
      id: `item-${Date.now()}-1`,
      selected: true,
      productId: defaultProduct ? defaultProduct.id : '',
      productName: defaultProduct ? defaultProduct.name : 'Product A',
      quantity: 1,
      unit: defaultProduct?.unit || 'kg',
      unitPrice: initialPrice,
      gstRate: 5,
    };

    setInvoiceNo(`INV-${String(Date.now()).slice(-5)}`);
    setInvoiceDate(todayStr);
    setCustomerName(buyersList[0]?.name || 'Ramesh Traders');
    setPaymentMethod('cash');
    setPaymentStatus('paid');
    setDiscountAmount('0');
    setInvoiceItems([initialItem]);
    setErrorMsg('');
    setViewMode('new_bill');
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') !== 'new_bill') {
        url.searchParams.set('sub', 'new_bill');
        window.history.pushState({ tab: 'sales', sub: 'new_bill' }, '', url.toString());
      }
    } catch {
      // ignore
    }
  };

  const handleCloseNewBill = () => {
    setViewMode('list');
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') === 'new_bill') {
        url.searchParams.delete('sub');
        window.history.pushState({ tab: 'sales' }, '', url.toString());
      }
    } catch {
      // ignore
    }
  };

  // Add Item Row
  const handleAddItemRow = () => {
    const fallbackProd = products[invoiceItems.length % (products.length || 1)] || null;
    const initialPrice = fallbackProd ? getProductInitialPrice(fallbackProd.id) : 150;

    const newItem: InvoiceItem = {
      id: `item-${Date.now()}-${invoiceItems.length + 1}`,
      selected: true,
      productId: fallbackProd?.id || '',
      productName: fallbackProd?.name || `Item ${String.fromCharCode(65 + invoiceItems.length)}`,
      quantity: 1,
      unit: fallbackProd?.unit || 'kg',
      unitPrice: initialPrice,
      gstRate: 5,
    };
    setInvoiceItems((prev) => [...prev, newItem]);
  };

  // Update item field
  const handleUpdateItem = (id: string, updates: Partial<InvoiceItem>) => {
    setInvoiceItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };

        // Auto populate rate when product changes
        if (updates.productId && updates.productId !== item.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          if (prod) {
            updated.productName = prod.name;
            updated.unit = prod.unit || 'kg';
            updated.unitPrice = getProductInitialPrice(prod.id);
          }
        }
        return updated;
      })
    );
  };

  // Remove item row
  const handleRemoveItem = (id: string) => {
    if (invoiceItems.length <= 1) {
      showToast('കുറഞ്ഞത് ഒരു ഉൽപ്പന്നമെങ്കിലും ബില്ലിൽ ഉണ്ടായിരിക്കണം', 'warning');
      return;
    }
    setInvoiceItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Toggle select all
  const handleToggleSelectAll = (checked: boolean) => {
    setInvoiceItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
  };

  // Summary Calculations
  const invoiceCalculations = useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;
    const gstBreakdown: Record<number, number> = { 0: 0, 3: 0, 5: 0, 12: 0, 18: 0 };

    invoiceItems.forEach((item) => {
      if (!item.selected) return;
      const q = Number(item.quantity) || 0;
      const rate = Number(item.unitPrice) || 0;
      const baseAmt = q * rate;
      const gstAmt = baseAmt * ((Number(item.gstRate) || 0) / 100);

      subtotal += baseAmt;
      totalGst += gstAmt;
      const r = Number(item.gstRate) || 0;
      gstBreakdown[r] = (gstBreakdown[r] || 0) + gstAmt;
    });

    const discount = Math.max(0, parseFloat(discountAmount) || 0);
    const grandTotal = Math.max(0, subtotal + totalGst - discount);

    return {
      subtotal,
      totalGst,
      discount,
      grandTotal,
      gstBreakdown,
    };
  }, [invoiceItems, discountAmount]);

  // Save Bill Action
  const handleSaveBill = async (shouldPrint: boolean = false) => {
    setErrorMsg('');
    const activeItems = invoiceItems.filter((item) => item.selected && Number(item.quantity) > 0);

    if (activeItems.length === 0) {
      setErrorMsg('കുറഞ്ഞത് ഒരു സാധുവായ ഇനമെങ്കിലും തിരഞ്ഞെടുക്കുക');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save all active items into sales table
      const batchPayload = activeItems.map((item) => {
        const itemBaseAmt = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        const itemGstAmt = itemBaseAmt * ((Number(item.gstRate) || 0) / 100);
        const itemTotal = itemBaseAmt + itemGstAmt;

        return {
          sale_date: invoiceDate,
          product_id: item.productId || undefined,
          product_name: item.productName,
          quantity: Number(item.quantity) || 1,
          unit: item.unit || 'kg',
          unit_price: Number(item.unitPrice) || 0,
          total_amount: itemTotal,
          customer_name: customerName.trim() || 'Counter Sale',
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          notes: `${invoiceNo}${item.gstRate > 0 ? ` (GST ${item.gstRate}%)` : ''}`,
        };
      });

      await recordSalesBatch(batchPayload);

      // Prepare Bill Data for Sleek Receipt (Image 2)
      const billData: BillData = {
        invoiceNo,
        date: invoiceDate,
        customerName: customerName.trim() || 'Counter Sale',
        paymentMethod,
        paymentStatus,
        items: activeItems.map((item, idx) => {
          const baseAmt = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
          const gstAmt = baseAmt * ((Number(item.gstRate) || 0) / 100);
          return {
            sn: idx + 1,
            name: item.productName,
            quantity: Number(item.quantity) || 1,
            unit: item.unit || 'kg',
            unitPrice: Number(item.unitPrice) || 0,
            gstRate: Number(item.gstRate) || 0,
            amount: baseAmt + gstAmt,
          };
        }),
        subtotal: invoiceCalculations.subtotal,
        discount: invoiceCalculations.discount,
        totalGst: invoiceCalculations.totalGst,
        grandTotal: invoiceCalculations.grandTotal,
        gstBreakdown: invoiceCalculations.gstBreakdown,
      };

      setViewMode('list');
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('sub');
        window.history.replaceState({ tab: 'sales' }, '', url.toString());
      } catch {}
      await loadData();

      if (shouldPrint) {
        setActiveBill(billData);
        setIsBillModalOpen(true);
      }
    } catch (err: any) {
      console.error('Failed to save bill:', err);
      setErrorMsg(err.message || 'ബില്ല് സേവ് ചെയ്യാനായില്ല');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert Single SaleRecord to BillData for receipt preview
  const handlePreviewSingleSale = (sale: SaleRecord) => {
    setBillProfile(getFreshBillProfile());
    const billData: BillData = {
      invoiceNo: sale.notes?.split(' ')[0] || `IN-${String(sale.id).slice(0, 5).toUpperCase()}`,
      date: sale.sale_date,
      customerName: sale.customer_name || 'Counter Sale',
      paymentMethod: sale.payment_method || 'cash',
      paymentStatus: sale.payment_status || 'paid',
      items: [
        {
          sn: 1,
          name: sale.product_name,
          quantity: Number(sale.quantity) || 1,
          unit: sale.unit || 'kg',
          unitPrice: Number(sale.unit_price) || 0,
          gstRate: 0,
          amount: Number(sale.total_amount) || 0,
        },
      ],
      subtotal: Number(sale.total_amount) || 0,
      discount: 0,
      totalGst: 0,
      grandTotal: Number(sale.total_amount) || 0,
      gstBreakdown: { 0: 0 },
    };
    setActiveBill(billData);
    setIsBillModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'വിൽപ്പന റെക്കോർഡ് നീക്കം ചെയ്യണോ?',
      message: 'ഈ വിൽപ്പന റെക്കോർഡ് നീക്കം ചെയ്യണോ? ഈ പ്രവർത്തനം പഴയപടിയാക്കാൻ കഴിയില്ല.',
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;
    try {
      setDeletingSaleId(id);
      await deleteSale(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
      showToast('വിൽപ്പന റെക്കോർഡ് വിജയകരമായി നീക്കം ചെയ്തു', 'success');
    } catch (err: any) {
      showToast(err?.message || 'ഡിലീറ്റ് ചെയ്യാനായില്ല', 'error');
    } finally {
      setDeletingSaleId(null);
    }
  };

  // Copy Bill to WhatsApp
  const handleCopyBillWhatsApp = () => {
    if (!activeBill) return;
    const currentProfile = getFreshBillProfile();
    const itemsText = activeBill.items
      .map((it) => `• ${it.name} x ${it.quantity} ${it.unit} @ ₹${it.unitPrice} = ₹${it.amount.toFixed(2)}`)
      .join('\n');

    const phoneEmailLine = [
      currentProfile.phone ? `Phone: ${currentProfile.phone}` : '',
      currentProfile.email ? `Email: ${currentProfile.email}` : '',
    ].filter(Boolean).join(' | ');

    const taxLine = [
      currentProfile.gst ? `GSTIN: ${currentProfile.gst}` : '',
      currentProfile.fssai ? `FSSAI: ${currentProfile.fssai}` : '',
    ].filter(Boolean).join(' | ');

    const footerText = cleanFooter(currentProfile.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.';
    const firmName = currentProfile.name && !['epso production'].includes(currentProfile.name.trim().toLowerCase())
      ? currentProfile.name
      : 'PULARI BAKES';

    const text = `🧾 *${firmName.toUpperCase()} - INVOICE*
--------------------------------
Invoice: ${activeBill.invoiceNo}
Date: ${activeBill.date}
Customer: ${activeBill.customerName}
Status: ${activeBill.paymentStatus.toUpperCase()} (${activeBill.paymentMethod.toUpperCase()})
--------------------------------
${itemsText}
--------------------------------
Subtotal: ₹${activeBill.subtotal.toFixed(2)}
${activeBill.discount > 0 ? `Discount: -₹${activeBill.discount.toFixed(2)}\n` : ''}GST: ₹${activeBill.totalGst.toFixed(2)}
*Grand Total: ₹${activeBill.grandTotal.toFixed(2)}*
--------------------------------
${phoneEmailLine ? `${phoneEmailLine}\n` : ''}${taxLine ? `${taxLine}\n` : ''}${currentProfile.address ? `${currentProfile.address}\n` : ''}_${footerText}_`;

    navigator.clipboard.writeText(text).then(() => {
      setBillCopied(true);
      setTimeout(() => setBillCopied(false), 2000);
    });
  };

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchesSearch =
        searchQuery === '' ||
        s.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDate =
        selectedDateFilter === '' || s.sale_date === selectedDateFilter;

      return matchesSearch && matchesDate;
    });
  }, [sales, searchQuery, selectedDateFilter]);

  // Statistics
  const currentMonthStr = todayStr.substring(0, 7);

  const stats = useMemo(() => {
    let todayTotal = 0;
    let monthTotal = 0;
    let allTotal = 0;
    let totalQty = 0;

    sales.forEach((s) => {
      const amt = Number(s.total_amount) || 0;
      allTotal += amt;
      totalQty += Number(s.quantity) || 0;

      if (s.sale_date === todayStr) {
        todayTotal += amt;
      }
      if (s.sale_date.startsWith(currentMonthStr)) {
        monthTotal += amt;
      }
    });

    return {
      todayTotal,
      monthTotal,
      allTotal,
      totalQty,
      ordersCount: sales.length,
    };
  }, [sales, todayStr, currentMonthStr]);

  const allItemsSelected = invoiceItems.length > 0 && invoiceItems.every((i) => i.selected);

  return (
    <div className="space-y-5 font-sans">
      {/* Printable Receipt CSS */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 4mm 6mm;
          }
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #epso-bill-print-area, #epso-bill-print-area * {
            visibility: visible !important;
          }
          #epso-bill-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 420px !important;
            margin: 0 auto !important;
            padding: 16px 20px !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            border: none !important;
            box-shadow: none !important;
            z-index: 999999 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* Header Bar with Sub-Tab Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-stone-200/80 dark:border-[#2E2828] font-malayalam">
        <div>
          <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-white flex items-center gap-2">
            <span>വിൽപ്പന & ബില്ലിംഗ് (Sales & Invoicing)</span>
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            വിൽപ്പന രേഖപ്പെടുത്തലും ഇൻവോയ്സ് പ്രിന്റിംഗും
          </p>
        </div>

        <div className="flex items-center gap-2 bg-stone-100 dark:bg-[#1E1B1B] p-1.5 rounded-2xl border border-stone-200 dark:border-[#2E2828]">
          <button
            type="button"
            onClick={handleCloseNewBill}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer font-malayalam ${
              viewMode === 'list'
                ? 'bg-white dark:bg-[#252020] text-stone-900 dark:text-white shadow-xs font-black'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            വിൽപ്പന ലിസ്റ്റ് (Sales List)
          </button>
          <button
            type="button"
            onClick={handleOpenNewBill}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer font-malayalam ${
              viewMode === 'new_bill'
                ? 'bg-epso-orange text-white dark:bg-amber-500 dark:text-stone-950 shadow-xs font-black'
                : 'text-stone-700 dark:text-stone-300 hover:text-epso-orange'
            }`}
          >
            <FiPlus className="w-3.5 h-3.5 stroke-[3]" />
            <span>+ വിൽപ്പന രേഖപ്പെടുത്തുക (New Bill)</span>
          </button>
        </div>
      </div>

{viewMode === 'list' && (
  <div className="space-y-4 font-sans animate-fade-in">
      {/* Clean Statistics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm">
          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam">ഇന്നത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-epso-orange dark:text-amber-400 font-mono mt-0.5">
            <AnimatedNumber value={stats.todayTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5 font-malayalam">ഇന്ന് ലഭിച്ച തുക</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm">
          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam">ഈ മാസത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-0.5">
            <AnimatedNumber value={stats.monthTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5 font-malayalam">നടപ്പു മാസം</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm">
          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam">ആകെ വിറ്റ തുക</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-0.5">
            <AnimatedNumber value={stats.allTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5 font-malayalam">{stats.ordersCount} ബില്ലുകൾ</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-sm">
          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam">ആകെ വിറ്റ അളവ്</p>
          <p className="text-xl sm:text-2xl font-black text-stone-800 dark:text-stone-200 font-mono mt-0.5">
            <AnimatedNumber value={stats.totalQty} decimals={1} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5 font-malayalam">പാക്കറ്റുകൾ / കിലോ</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828] flex flex-wrap items-center gap-2.5 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="ഉൽപ്പന്നം അല്ലെങ്കിൽ ഉപഭോക്താവിനെ തിരയുക..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white border border-stone-200 dark:border-[#2E2828] rounded-xl focus:outline-none focus:ring-1 focus:ring-epso-orange"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <FiCalendar className="w-4 h-4 text-stone-400" />
          <input
            type="date"
            value={selectedDateFilter}
            onChange={(e) => setSelectedDateFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white border border-stone-200 dark:border-[#2E2828] rounded-xl font-mono focus:outline-none"
          />
          {selectedDateFilter && (
            <button
              onClick={() => setSelectedDateFilter('')}
              className="text-[11px] text-stone-400 hover:text-epso-orange dark:hover:text-amber-400 ml-1 cursor-pointer font-bold"
            >
              എല്ലാം
            </button>
          )}
        </div>
      </div>

      {/* Sales List Table */}
      <div className="bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-stone-400 flex items-center justify-center gap-2">
            <FiRefreshCw className="w-4 h-4 animate-spin text-epso-orange" />
            <span>വിൽപ്പന വിവരങ്ങൾ ശേഖരിക്കുന്നു...</span>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-stone-400 space-y-2">
            <FiDollarSign className="w-8 h-8 mx-auto opacity-30 text-stone-400" />
            <p className="text-sm font-bold text-stone-700 dark:text-stone-300">വിൽപ്പന റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല</p>
            <p className="text-xs">മുകളിലുള്ള ബട്ടൺ ഉപയോഗിച്ച് പുതിയ വിൽപ്പന ചേർക്കുക</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="border-b border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 bg-stone-50/80 dark:bg-[#141212] font-bold">
                  <th className="py-3 px-3.5">തീയതി</th>
                  <th className="py-3 px-3.5">ഉൽപ്പന്നം (Item)</th>
                  <th className="py-3 px-3.5 text-right">അളവ് (Qty)</th>
                  <th className="py-3 px-3.5 text-right">വില (Rate)</th>
                  <th className="py-3 px-3.5 text-right">ആകെ തുക</th>
                  <th className="py-3 px-3.5">ഉപഭോക്താവ് (Customer)</th>
                  <th className="py-3 px-3.5">പേയ്‌മെന്റ്</th>
                  <th className="py-3 px-3.5 text-center">ബില്ലിംഗ്</th>
                  <th className="py-3 px-3.5 text-center">ഡിലീറ്റ്</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-orange-50/30 dark:hover:bg-[#252020] transition-colors">
                    <td className="py-3 px-3.5 font-mono text-stone-500 dark:text-stone-400">
                      {sale.sale_date}
                    </td>
                    <td className="py-3 px-3.5 font-bold text-stone-900 dark:text-white">
                      {sale.product_name}
                      {sale.notes && (
                        <p className="text-[10px] text-stone-400 font-normal mt-0.5">{sale.notes}</p>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-stone-700 dark:text-stone-300">
                      {sale.quantity} <span className="text-[10px] text-stone-400 font-sans">{sale.unit}</span>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-stone-600 dark:text-stone-400">
                      ₹{Number(sale.unit_price).toFixed(2)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900 dark:text-white">
                      ₹{Number(sale.total_amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-3.5 text-stone-700 dark:text-stone-300 font-medium">
                      {sale.customer_name || '—'}
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-stone-100 dark:bg-[#252020] text-stone-700 dark:text-stone-300">
                          {sale.payment_method || 'cash'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            sale.payment_status === 'paid'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-orange-50 dark:bg-amber-950/40 text-epso-orange dark:text-amber-300 border border-orange-200 dark:border-amber-800/40'
                          }`}
                        >
                          {sale.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <button
                        onClick={() => handlePreviewSingleSale(sale)}
                        className="p-1.5 text-stone-600 dark:text-stone-300 hover:text-epso-orange dark:hover:text-amber-400 hover:bg-stone-100 dark:hover:bg-[#282323] rounded-lg transition-colors cursor-pointer"
                        title="View Sleek Bill (Print)"
                      >
                        <FiPrinter className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        disabled={deletingSaleId === sale.id}
                        className="p-1.5 text-stone-400 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete Sale Record"
                      >
                        {deletingSaleId === sale.id ? (
                          <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                        ) : (
                          <FiTrash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


  </div>
)}
      {/* ============================================================ */}
      {/* INLINE NEW BILL TAB VIEW (SAME TAB, PRESERVES APP SHELL)      */}
      {/* ============================================================ */}
      {viewMode === 'new_bill' && (
        <div className="space-y-4 font-sans animate-fade-in">
          {/* Top Bar: Return to list & Fast Action */}
          <div className="bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseNewBill}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#252020] dark:hover:bg-[#2d2727] text-stone-800 dark:text-stone-200 text-xs font-bold transition-all cursor-pointer font-malayalam press-apple"
              >
                <FiArrowLeft className="w-4 h-4" />
                <span>വിൽപ്പന ലിസ്റ്റിലേക്ക് മടങ്ങുക (Back to Sales List)</span>
              </button>
              <span className="text-xs font-black text-stone-900 dark:text-white font-malayalam border-l border-stone-200 dark:border-[#2E2828] pl-3 hidden sm:inline-block">
                പുതിയ വിൽപ്പന രേഖപ്പെടുത്തൽ (New Bill)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCloseNewBill}
                className="px-3.5 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] text-xs font-bold transition-colors cursor-pointer font-malayalam"
              >
                റദ്ദാക്കുക (Discard)
              </button>
              <button
                type="button"
                onClick={() => handleSaveBill(true)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-xs shadow-md transition-all cursor-pointer press-apple disabled:opacity-50 font-malayalam"
              >
                {isSubmitting ? (
                  <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FiPrinter className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
                <span>സേവ് & പ്രിന്റ് (Save & Print)</span>
              </button>
            </div>
          </div>

          {/* Settings Ribbon: Customer, Invoice No, Date, Payment Mode */}
          <div className="bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Customer Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam">ഉപഭോക്താവ്:</span>
                <div className="relative">
                  <input
                    type="text"
                    list="invoice-buyers-list"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ramesh Traders"
                    className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-bold text-stone-900 dark:text-white min-w-[180px] focus:outline-none focus:ring-1 focus:ring-epso-orange"
                  />
                  <datalist id="invoice-buyers-list">
                    {buyersList.map((b, idx) => (
                      <option key={idx} value={b.name}>
                        {b.shopName ? `${b.shopName} (${b.name})` : b.name}
                      </option>
                    ))}
                  </datalist>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddBuyerModal(true)}
                  className="p-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                  title="Add / Manage Buyers"
                >
                  <FiMenu className="w-4 h-4" />
                </button>
              </div>

              {/* Invoice No */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300">Invoice No:</span>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-mono font-bold text-stone-900 dark:text-white w-28 focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              {/* Date */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam">തീയതി:</span>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-mono text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300">Mode:</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-bold text-stone-900 dark:text-white focus:outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / GPay</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="credit">Credit (കടം)</option>
                </select>
              </div>

              {/* Payment Status */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    paymentStatus === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-stone-100 dark:bg-[#252020] text-stone-600 dark:text-stone-300'
                  }`}
                >
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('unpaid')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    paymentStatus === 'unpaid'
                      ? 'bg-epso-orange text-white shadow-xs'
                      : 'bg-stone-100 dark:bg-[#252020] text-stone-600 dark:text-stone-300'
                  }`}
                >
                  Unpaid
                </button>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl text-xs flex items-center gap-2">
              <FiAlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Body: Two Column ERP Billing Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Items Table */}
              <div className="lg:col-span-8 bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] rounded-2xl shadow-sm p-4 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 font-bold bg-stone-50/80 dark:bg-[#141212]">
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={allItemsSelected}
                            onChange={(e) => handleToggleSelectAll(e.target.checked)}
                            className="rounded border-stone-300 text-epso-orange focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3 w-24 text-center">Qty</th>
                        <th className="py-2.5 px-3 w-28 text-right">Rate</th>
                        <th className="py-2.5 px-3 w-24 text-center">GST</th>
                        <th className="py-2.5 px-3 w-28 text-right">Total</th>
                        <th className="py-2.5 px-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/60">
                      {invoiceItems.map((item) => {
                        const itemAmt = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                        const itemGst = itemAmt * ((Number(item.gstRate) || 0) / 100);
                        const itemTotal = itemAmt + itemGst;

                        return (
                          <tr key={item.id} className="hover:bg-orange-50/30 dark:hover:bg-[#252020] transition-colors">
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => handleUpdateItem(item.id, { selected: e.target.checked })}
                                className="rounded border-stone-300 text-epso-orange focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={item.productId}
                                onChange={(e) => handleUpdateItem(item.id, { productId: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-semibold text-stone-900 dark:text-white focus:outline-none"
                              >
                                {products.map((p) => {
                                  const costP = costingPrices[p.id];
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {costP ? `(Costing: ₹${costP})` : p.wholesalePrice ? `(₹${p.wholesalePrice})` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-20 px-2 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-center font-mono font-bold text-xs text-stone-900 dark:text-white focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="relative inline-block w-24">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 font-mono">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.unitPrice}
                                  onChange={(e) => handleUpdateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                  className="w-full pl-5 pr-2 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-right font-mono font-bold text-xs text-stone-900 dark:text-white focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <select
                                value={item.gstRate}
                                onChange={(e) => handleUpdateItem(item.id, { gstRate: parseInt(e.target.value, 10) || 0 })}
                                className="px-2 py-1.5 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-xs font-mono font-semibold text-stone-900 dark:text-white focus:outline-none"
                              >
                                <option value="0">0%</option>
                                <option value="3">3%</option>
                                <option value="5">5%</option>
                                <option value="12">12%</option>
                                <option value="18">18%</option>
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 dark:text-white">
                              ₹{itemTotal.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1 text-stone-400 hover:text-red-500 transition-colors cursor-pointer"
                                title="Remove Item"
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add Item Button */}
                <div className="flex justify-end pt-2 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-4 py-2 rounded-xl border border-stone-300 dark:border-[#2E2828] bg-stone-50 dark:bg-[#252020] hover:bg-orange-50 hover:text-epso-orange dark:hover:bg-[#282323] text-stone-800 dark:text-stone-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <FiPlus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Invoice Summary & Action Buttons */}
              <div className="lg:col-span-4 space-y-4">
                {/* Summary Card */}
                <div className="rounded-2xl border border-stone-200 dark:border-[#2E2828] shadow-sm overflow-hidden">
                  <div className="bg-epso-orange text-white dark:bg-amber-500 dark:text-stone-950 p-4 font-black text-sm tracking-wide">
                    Summary
                  </div>
                  <div className="bg-white dark:bg-[#1E1B1B] p-4 sm:p-5 space-y-3.5 text-xs">
                    <div className="flex items-center justify-between text-stone-600 dark:text-stone-400 font-semibold">
                      <span>Subtotal:</span>
                      <span className="font-mono text-stone-900 dark:text-white font-bold">
                        ₹{invoiceCalculations.subtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-stone-600 dark:text-stone-400 font-semibold">
                      <span>Discount:</span>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 font-mono">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(e.target.value)}
                          className="w-full pl-5 pr-2 py-1 rounded-lg border border-stone-300 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-right font-mono font-bold text-xs text-stone-900 dark:text-white focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-stone-600 dark:text-stone-400 font-semibold">
                      <span>GST:</span>
                      <span className="font-mono text-stone-900 dark:text-white font-bold">
                        ₹{invoiceCalculations.totalGst.toFixed(2)}
                      </span>
                    </div>

                    <div className="border-t border-stone-200 dark:border-[#2E2828] pt-3 flex items-center justify-between">
                      <span className="font-bold text-stone-900 dark:text-white text-sm">Grand Total:</span>
                      <span className="font-mono font-black text-epso-orange dark:text-amber-400 text-xl">
                        ₹{invoiceCalculations.grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary Action Button (Save & Send removed as requested) */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => handleSaveBill(true)}
                    disabled={isSubmitting}
                    className="w-full py-4 px-4 rounded-xl bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-xs tracking-wider uppercase shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 press-apple"
                  >
                    {isSubmitting ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <FiPrinter className="w-4 h-4 stroke-[2.5]" />
                    )}
                    <span>Save & Print Bill</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseNewBill}
                    className="w-full py-2.5 px-4 rounded-xl border border-stone-300 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 font-bold text-xs hover:bg-stone-100 dark:hover:bg-[#252020] transition-colors cursor-pointer font-malayalam"
                  >
                    ലിസ്റ്റിലേക്ക് മടങ്ങുക (Discard / Back)
                  </button>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* ============================================================ */}
      {/* SLEEK BILL RECEIPT MODAL (DYNAMIC FROM SETTINGS)             */}
      {/* ============================================================ */}
      {isBillModalOpen && activeBill && createPortal(
        <div className="fixed inset-0 z-[10000] w-screen h-screen min-h-screen bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-stone-100 dark:bg-[#1E1B1B] rounded-2xl p-4 shadow-2xl border border-stone-200 dark:border-[#2E2828] max-h-[96vh] flex flex-col my-auto">
            {/* Modal Actions (Screen Only) */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-[#2E2828] mb-3 shrink-0 no-print">
              <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Sleek Bill Preview ({activeBill.invoiceNo})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBillWhatsApp}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#252020] text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                >
                  {billCopied ? (
                    <>
                      <FiCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <FiCopy className="w-3.5 h-3.5 text-epso-orange dark:text-amber-400" />
                      <span>WhatsApp</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-200 dark:bg-[#141212] text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white cursor-pointer transition-colors"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Sleek Bill Area (Dynamic from Settings) */}
            <div className="flex-1 overflow-y-auto no-scrollbar rounded-xl bg-white shadow-xs p-1">
              <div
                id="epso-bill-print-area"
                className="w-full bg-white text-black font-sans p-6 sm:p-7 text-xs select-text relative overflow-hidden"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {/* Diagonal Ribbon: Unpaid or Paid */}
                <div
                  className={`absolute -left-12 top-6 w-44 text-center font-bold text-xs py-1 shadow transform -rotate-45 select-none ${
                    activeBill.paymentStatus === 'paid'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-epso-orange dark:bg-amber-500 text-white dark:text-stone-950'
                  }`}
                  style={{ zIndex: 10 }}
                >
                  {activeBill.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                </div>

                {/* Company Header (Dynamic from Settings) */}
                <div className="text-center pt-2 pb-3">
                  {/* Epso Brand Icon without "espo production" text */}
                  <div className="flex justify-center mb-1.5">
                    <img
                      src="/epso-swirl-transparent.png"
                      alt="Pulari Bakes Logo"
                      className="w-12 h-12 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/favicon.png';
                      }}
                    />
                  </div>

                  {billProfile.name &&
                    !['epso production'].includes(
                      billProfile.name.trim().toLowerCase()
                    ) && (
                      <h1 className="text-base font-bold tracking-wider text-black uppercase">
                        {billProfile.name}
                      </h1>
                    )}

                  {billProfile.subtitle && (
                    <p className="text-[11px] font-semibold text-black mt-0.5">
                      {billProfile.subtitle}
                    </p>
                  )}

                  {(billProfile.address || billProfile.location) && (
                    <p className="text-[11px] text-black mt-0.5 leading-snug whitespace-pre-line">
                      {billProfile.address || billProfile.location}
                    </p>
                  )}

                  {/* Phone & Email in single line */}
                  {(billProfile.phone || billProfile.email) && (
                    <p className="text-[11px] text-black mt-0.5 font-medium">
                      {billProfile.phone && <span>PHONE : {billProfile.phone}</span>}
                      {billProfile.phone && billProfile.email && (
                        <span className="mx-2 font-bold text-stone-400">|</span>
                      )}
                      {billProfile.email && <span>EMAIL : {billProfile.email}</span>}
                    </p>
                  )}

                  {/* GSTIN & FSSAI in single line */}
                  {(billProfile.gst || billProfile.fssai) && (
                    <p className="text-[11px] text-black mt-0.5 font-medium">
                      {billProfile.gst && <span>GSTIN : {billProfile.gst}</span>}
                      {billProfile.gst && billProfile.fssai && (
                        <span className="mx-2 font-bold text-stone-400">|</span>
                      )}
                      {billProfile.fssai && <span>FSSAI : {billProfile.fssai}</span>}
                    </p>
                  )}
                </div>

                {/* Bill No and Date Row */}
                <div className="flex items-center justify-between text-xs py-1 mt-1 text-black font-semibold">
                  <span>Bill No: {activeBill.invoiceNo}</span>
                  <span>Date: {activeBill.date}</span>
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-2" />

                {/* Columns Header: SN | Item | Qty | Price | Amt */}
                <div className="grid grid-cols-12 text-xs font-bold py-1 text-black">
                  <div className="col-span-1">SN</div>
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right">Amt</div>
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-1" />

                {/* Items List */}
                <div className="divide-y-0 space-y-2 py-1 text-xs text-black">
                  {activeBill.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-baseline">
                      <div className="col-span-1">{item.sn || idx + 1}</div>
                      <div className="col-span-5 font-medium pr-1 leading-tight">{item.name}</div>
                      <div className="col-span-2 text-center">{item.quantity}</div>
                      <div className="col-span-2 text-right">{item.unitPrice.toFixed(2)}</div>
                      <div className="col-span-2 text-right">{item.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-2" />

                {/* Subtotal Row */}
                <div className="grid grid-cols-12 items-center text-xs font-bold text-black py-1">
                  <div className="col-span-6">Subtotal</div>
                  <div className="col-span-2 text-center">
                    {activeBill.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)}
                  </div>
                  <div className="col-span-4 text-right">
                    ₹ {activeBill.subtotal.toFixed(2)}
                  </div>
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-2" />

                {/* Tax Breakdown (IGST lines) */}
                <div className="space-y-1 text-xs text-black py-1">
                  {activeBill.discount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="pl-24 sm:pl-32">Discount:</span>
                      <span>- {activeBill.discount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="pl-24 sm:pl-32">IGST at 0%</span>
                    <span>{(activeBill.gstBreakdown[0] || 0).toFixed(2)}</span>
                  </div>

                  {activeBill.gstBreakdown[3] !== undefined && activeBill.gstBreakdown[3] > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="pl-24 sm:pl-32">IGST at 3%</span>
                      <span>{activeBill.gstBreakdown[3].toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="pl-24 sm:pl-32">IGST at 5%</span>
                    <span>{(activeBill.gstBreakdown[5] || 0).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="pl-24 sm:pl-32">IGST at 12%</span>
                    <span>{(activeBill.gstBreakdown[12] || 0).toFixed(2)}</span>
                  </div>

                  {activeBill.gstBreakdown[18] !== undefined && activeBill.gstBreakdown[18] > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="pl-24 sm:pl-32">IGST at 18%</span>
                      <span>{activeBill.gstBreakdown[18].toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-2" />

                {/* Grand Total Row */}
                <div className="flex items-center justify-between text-xs font-bold text-black py-1">
                  <span className="tracking-wider uppercase">TOTAL</span>
                  <span>₹ {activeBill.grandTotal.toFixed(2)}</span>
                </div>

                {/* Dashed Separator */}
                <div className="border-t border-dashed border-black my-3" />

                {/* Footer Note (Dynamic from Settings) */}
                <div className="text-center pt-2 pb-1">
                  <p className="text-xs text-black font-semibold">
                    {cleanFooter(billProfile.billFooter) || 'നന്ദി! വീണ്ടും സന്ദർശിക്കുക.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Buyer Modal */}
      {showAddBuyerModal && createPortal(
        <div className="fixed inset-0 z-[10001] w-screen h-screen min-h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-[#2E2828] shadow-2xl my-auto google-modal">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <FiUserPlus className="w-5 h-5 text-epso-orange dark:text-amber-400" />
                <span>പുതിയ ബയറെ ചേർക്കുക</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowAddBuyerModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 dark:bg-[#141212] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewBuyer} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  ബയറുടെ പേര് (Buyer Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ഉദാ: Ramesh Traders, പ്രവീൺ..."
                  value={newBuyerName}
                  onChange={(e) => setNewBuyerName(e.target.value)}
                  className="google-input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  കട / സ്ഥാപനം (Shop Name)
                </label>
                <input
                  type="text"
                  placeholder="ഉദാ: Royal Stores, Kozhikode"
                  value={newBuyerShop}
                  onChange={(e) => setNewBuyerShop(e.target.value)}
                  className="google-input"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  ഫോൺ നമ്പർ (Phone)
                </label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={newBuyerPhone}
                  onChange={(e) => setNewBuyerPhone(e.target.value)}
                  className="google-input font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-stone-100 dark:border-[#2E2828]">
                <button
                  type="button"
                  onClick={() => setShowAddBuyerModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 font-bold hover:bg-stone-100 dark:hover:bg-[#141212] transition-colors cursor-pointer"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm transition-colors cursor-pointer"
                >
                  ചേർക്കുക
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
