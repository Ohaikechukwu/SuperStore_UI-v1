"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Banknote,
  CheckCircle2,
  Clock3,
  CircleMinus,
  CirclePlus,
  CreditCard,
  Landmark,
  PauseCircle,
  Play,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Smartphone,
  ShoppingCart,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import AppSelect from "@/components/app-select";
import VoidReceiptModal from "@/components/void-receipt-modal";
import { useToast } from "@/components/toast-provider";
import { enqueue, pendingCommands, readOfflineSnapshot, saveOfflineSnapshot } from "@/offlineQueue";
import { api, ApiError } from "@/lib/api";
import { isConnectionFailure, reportApiReachability, useApiConnectivity } from "@/lib/connectivity";
import { hasExactProductCode, matchesProductSearch } from "@/lib/product-search";
import { formatQuantity } from "@/lib/ui";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Branch = { id: string; name: string; code: string };
type Product = {
  id: string;
  stock_code: string;
  barcode?: string | null;
  name: string;
  selling_price: string;
  available_quantity: string;
  active: boolean;
};
type CartLine = Product & { quantity: number; unit_price: string };
type CashSession = {
  cash_session_id: string;
  session_number: string;
  cash_point_id: string | null;
  cash_point_number: number | null;
  status: string;
  work_period_started_at: string | null;
  work_period_ends_at: string | null;
};
type CashPoint = { id: string; number: number; available: boolean };
type TerminalSlot = { number: number; cash_point_id: string | null; branch_id: string | null; state: "unassigned" | "available" | "in_use"; branch_name: string | null; cashier_name: string | null; session_number: string | null; opened_at: string | null };
type CashPointResponse = { cash_point_limit: number; configured_count: number; subscription_active: boolean; items: CashPoint[]; terminal_slots?: TerminalSlot[] };
type ClosedCashSession = {
  cash_session_id: string; session_number: string; cash_point_number: number | null;
  sales_count: number; gross_sales: string; refund_count: number; refund_total: string;
  net_sales: string; payments_by_method: Record<string, string>;
  expected_cash: string; closing_cash: string; variance: string;
};
type SessionPreview = Pick<ClosedCashSession, "sales_count" | "gross_sales" | "refund_count" | "refund_total" | "net_sales" | "expected_cash">;
type Customer = {
  id: string;
  customer_number: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
};
type CustomerLoyalty = { points_balance: string; program: { active: boolean; redemption_value_per_point: string; minimum_redemption_points: number } };
type Sale = {
  id: string;
  receipt_number: string;
  total: string;
  status: string;
  can_void: boolean;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_number: string | null;
  sold_by_name: string;
  line_count: number;
  total_quantity: string;
  payments: Array<{ method: string }>;
};
type LowStockItem = { product_id: string; name: string; stock_code: string; quantity: string; unit: string; reorder_level: number };
type PaymentInput = { method: string; amount: string; reference?: string | null };
type HeldSale = {
  id: string; reference: string; branch_id: string; customer_id: string | null; customer_name: string | null;
  status: string; note: string | null; subtotal: string; line_count: number; created_at: string | null;
  lines: Array<{ product_id: string; name: string; stock_code: string; barcode?: string | null; quantity: string; unit_price: string }>;
};
type PostedReceipt = {
  sale_id: string; receipt_number: string; total: string; cash_point_number: number | null;
  customer_name: string; lines: CartLine[]; payments: PaymentInput[]; duplicate?: boolean;
};
const commandId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}`;
const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(value || 0);
const localDateTime = (value: Date) => {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const defaultWorkPeriod = () => {
  const start = new Date();
  return { start: localDateTime(start), end: localDateTime(new Date(start.getTime() + 8 * 60 * 60 * 1000)) };
};
const todayDate = () => localDateTime(new Date()).slice(0, 10);
const posCatalogSnapshot = (branchId: string) => `pos:catalog:${branchId}`;
const posSessionSnapshot = (branchId: string) => `pos:session:${branchId}`;

export default function Page() {
  const toast = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [session, setSession] = useState<CashSession | null>(null);
  const [cashPoints, setCashPoints] = useState<CashPoint[]>([]);
  const [cashPointLimit, setCashPointLimit] = useState(1);
  const [terminalSlots, setTerminalSlots] = useState<TerminalSlot[]>([]);
  const [cashPointSubscriptionActive, setCashPointSubscriptionActive] = useState(false);
  const [cashPointId, setCashPointId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [workPeriodStart, setWorkPeriodStart] = useState("");
  const [workPeriodEnd, setWorkPeriodEnd] = useState("");
  const [showSession, setShowSession] = useState(false);
  const [closedSession, setClosedSession] = useState<ClosedCashSession | null>(null);
  const [sessionPreview, setSessionPreview] = useState<SessionPreview | null>(null);
  const [showCashPoints, setShowCashPoints] = useState(false);
  const [canManageCashPoints, setCanManageCashPoints] = useState(false);
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { online } = useApiConnectivity();
  const [pendingSaleCount, setPendingSaleCount] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [postedReceipt, setPostedReceipt] = useState<PostedReceipt | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [heldSaleId, setHeldSaleId] = useState<string | null>(null);
  const [heldToCancel, setHeldToCancel] = useState<HeldSale | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesFromDate, setSalesFromDate] = useState(todayDate);
  const [salesToDate, setSalesToDate] = useState(todayDate);
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMode, setCustomerMode] = useState<"quick" | "returning">("quick");
  const [customerId, setCustomerId] = useState("");
  const [customerLoyalty, setCustomerLoyalty] = useState<CustomerLoyalty | null>(null);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [approvedTaxRates, setApprovedTaxRates] = useState<{ name: string; rate: string }[]>([]);
  const [priceOverrideReason, setPriceOverrideReason] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const checkoutRequestId = useRef<string | null>(null);
  const announcedError = useRef("");
  const announcedNotice = useRef("");
  const refreshSales = useCallback(() => {
    const filters = new URLSearchParams({
      branch_id: branchId,
      limit: "200",
      from_date: salesFromDate,
      to_date: salesToDate,
    });
    return branchId
      ? api
          .get<Sale[]>(`/api/v1/pos/sales?${filters}`)
          .then(setSales)
          .catch(() => setSales([]))
      : Promise.resolve();
  }, [branchId, salesFromDate, salesToDate]);
  const refreshHeldSales = useCallback(() =>
    branchId
      ? api.get<HeldSale[]>(`/api/v1/pos/held-sales?branch_id=${branchId}&limit=50`)
        .then(setHeldSales)
        .catch(() => setHeldSales([]))
      : Promise.resolve(), [branchId]);
  async function refreshCashPoints() {
    if (!branchId) return;
    try {
      const result = await api.get<CashPointResponse>(`/api/v1/pos/cash-points?branch_id=${branchId}`);
      setCashPoints(result.items);
      setCashPointLimit(result.cash_point_limit);
      setTerminalSlots(result.terminal_slots || []);
      setCashPointSubscriptionActive(result.subscription_active);
      setCashPointId((current) => result.items.some((item) => item.id === current && item.available)
        ? current
        : result.items.find((item) => item.available)?.id || "");
    } catch (caught) {
      setCashPoints([]);
      setError(caught instanceof ApiError ? caught.message : "Unable to load cash points.");
    }
  }
  const beginPayment = useCallback(() => {
    if (!cart.length || !branchId) return;
    if (!session) {
      setError("Select an available POS terminal and open your cash session before completing a sale.");
      const period = defaultWorkPeriod();
      setWorkPeriodStart(period.start);
      setWorkPeriodEnd(period.end);
      setShowSession(true);
      return;
    }
    if (customerMode === "returning" && !customerId) {
      setError("Select the customer account, or change this sale back to walk-in.");
      return;
    }
    if (Number(loyaltyPointsToRedeem) > 0 && (!customerId || !online)) {
      setError(customerId ? "Reconnect before redeeming loyalty points so the balance can be confirmed." : "Select a customer before redeeming loyalty points.");
      return;
    }
    const requestedDiscount = Math.min(Math.max(0, Number(discount) || 0), cart.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0));
    if (requestedDiscount > 0 && !discountReason.trim()) {
      setError("Add a reason before applying a discount.");
      return;
    }
    if (cart.some((line) => line.unit_price !== line.selling_price) && !priceOverrideReason.trim()) {
      setError("Add a reason before overriding a line price.");
      return;
    }
    setShowPayment(true);
  }, [branchId, cart, customerId, customerMode, discount, discountReason, loyaltyPointsToRedeem, online, priceOverrideReason, session]);
  const holdSale = useCallback(async () => {
    if (!cart.length || !branchId) return;
    if (!online) { setError("Reconnect before holding a sale so other staff can safely find it."); return; }
    if (cart.some((line) => line.unit_price !== line.selling_price)) { setError("A basket with a price override cannot be held. Complete or clear the override first."); return; }
    try {
      const held = await api.post<HeldSale>("/api/v1/pos/held-sales", {
        branch_id: branchId,
        customer_id: customerMode === "returning" ? customerId || null : null,
        cash_session_id: session?.cash_session_id || null,
        lines: cart.map((line) => ({ product_id: line.id, quantity: String(line.quantity), unit_price: line.unit_price })),
      });
      setCart([]); setCustomerId(""); setCustomerMode("quick"); setCustomerQuery(""); setCustomerLoyalty(null); setLoyaltyPointsToRedeem("0"); setHeldSaleId(null);
      setHeldSales((current) => [held, ...current]);
      setNotice(`${held.reference} is on hold. It has not reduced stock or posted money.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to hold this sale.");
    }
  }, [branchId, cart, customerId, customerMode, online, session]);
  useEffect(() => {
    const refreshPendingSales = () => {
      void pendingCommands().then((commands) => setPendingSaleCount(
        commands.filter((command) => command.commandType === "sale.create").length,
      )).catch(() => setPendingSaleCount(0));
    };
    refreshPendingSales();
    window.addEventListener("superstore:sync-queue", refreshPendingSales);
    return () => window.removeEventListener("superstore:sync-queue", refreshPendingSales);
  }, []);
  useEffect(() => {
    if (!error) return;
    if (announcedError.current !== error) {
      toast.error("POS action needed", error);
      announcedError.current = error;
    }
  }, [error, toast]);
  useEffect(() => {
    if (!notice) return;
    if (announcedNotice.current !== notice) {
      toast.success("POS updated", notice);
      announcedNotice.current = notice;
    }
  }, [notice, toast]);
  useEffect(() => {
    void api.get<AuthorizationContext>("/api/v1/auth/me/authorization")
      .then((context) => { setAuthorization(context); setCanManageCashPoints(["owner", "admin", "platform_admin", "platform_super_admin"].includes(context.role)); })
      .catch(() => { setAuthorization(null); setCanManageCashPoints(false); });
  }, []);
  useEffect(() => {
    let alive = true;
    void api
      .get<Customer[]>("/api/v1/pos/customers?include_inactive=true")
      .then((items) => alive && setCustomers(items))
      .catch(() => alive && setCustomers([]));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    void api.get<Branch[]>("/api/v1/catalog/branches")
      .then((items) => {
        if (alive) {
          setBranches(items);
          setBranchId(items[0]?.id || "");
          void saveOfflineSnapshot("pos:branches", items);
        }
      })
      .catch(async (caught) => {
        const cached = await readOfflineSnapshot<Branch[]>("pos:branches");
        if (!alive) return;
        if (cached?.length) {
          setBranches(cached);
          setBranchId(cached[0].id);
          setNotice("Showing the last saved POS workspace. Sales will remain queued until reconnection.");
        } else setError(caught instanceof ApiError ? caught.message : "Open POS once while connected before using it offline.");
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    void refreshSales();
    void refreshHeldSales();
  }, [refreshHeldSales, refreshSales]);
  useEffect(() => {
    let alive = true;
    void api.get<{ name: string; rate: string }[]>("/api/v1/taxes")
      .then((rates) => { if (alive) setApprovedTaxRates(rates); })
      .catch(() => { if (alive) setApprovedTaxRates([]); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!showSession || !session) return;
    let alive = true;
    void api.get<SessionPreview>(`/api/v1/pos/sessions/${session.cash_session_id}`)
      .then((summary) => alive && setSessionPreview(summary))
      .catch(() => alive && setSessionPreview(null));
    return () => { alive = false; };
  }, [showSession, session]);
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    void api.get<CashPointResponse>(`/api/v1/pos/cash-points?branch_id=${branchId}`)
      .then((result) => {
        if (!alive) return;
        setCashPoints(result.items);
        setCashPointLimit(result.cash_point_limit);
        setTerminalSlots(result.terminal_slots || []);
        setCashPointSubscriptionActive(result.subscription_active);
        setCashPointId((current) => result.items.some((item) => item.id === current && item.available)
          ? current : result.items.find((item) => item.available)?.id || "");
      })
      .catch((caught) => alive && setError(caught instanceof ApiError ? caught.message : "Unable to load cash points."));
    return () => { alive = false; };
  }, [branchId]);
  useEffect(() => {
    if (!branchId || !online) return;
    const refreshLiveState = () => {
      void refreshSales();
      void refreshHeldSales();
      setCatalogVersion((value) => value + 1);
      void api.get<CashSession | null>(`/api/v1/pos/sessions/current?branch_id=${branchId}`)
        .then(setSession)
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshLiveState, 30_000);
    window.addEventListener("superstore:sync-complete", refreshLiveState);
    window.addEventListener("superstore:live-change", refreshLiveState);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("superstore:sync-complete", refreshLiveState);
      window.removeEventListener("superstore:live-change", refreshLiveState);
    };
  }, [branchId, online, refreshHeldSales, refreshSales]);
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    if (!online) {
      void readOfflineSnapshot<CashSession | null>(posSessionSnapshot(branchId)).then((cached) => {
        if (alive) setSession(cached);
      });
      return () => { alive = false; };
    }
    void api.get<CashSession | null>(`/api/v1/pos/sessions/current?branch_id=${branchId}`)
      .then((current) => {
        if (!alive) return;
        setSession(current);
        void saveOfflineSnapshot(posSessionSnapshot(branchId), current);
      })
      .catch((caught) => {
        if (!alive) return;
        setSession(null);
        if (caught instanceof ApiError && caught.status !== 403) setError(caught.message);
      });
    return () => { alive = false; };
  }, [branchId, online]);
  useEffect(() => {
    if (!branchId || !online) return;
    void api.get<Product[]>(`/api/v1/pos/offline-catalog?branch_id=${encodeURIComponent(branchId)}`)
      .then((items) => saveOfflineSnapshot(posCatalogSnapshot(branchId), items))
      .catch(() => undefined);
  }, [branchId, online]);
  useEffect(() => {
    const term = query.trim();
    if (!branchId || !term) {
      const clear = window.setTimeout(() => setProducts([]), 0);
      return () => window.clearTimeout(clear);
    }
    let alive = true;
    if (!online) {
      void readOfflineSnapshot<Product[]>(posCatalogSnapshot(branchId)).then((cached) => {
        if (!alive) return;
        if (cached) setProducts(cached.filter((item) => matchesProductSearch(item, term)).slice(0, 18));
        else setError("No offline POS catalogue is saved for this branch. Reconnect before searching products.");
      });
      return () => { alive = false; };
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ branch_id: branchId, query: term, limit: "18" });
      void api.get<Product[]>("/api/v1/pos/products?" + params.toString())
        .then((items) => alive && setProducts(items))
        .catch((caught) => alive && setError(caught instanceof ApiError ? caught.message : "Unable to search received stock."));
    }, 120);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [branchId, catalogVersion, online, query]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "F2") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "F4" && cart.length) { event.preventDefault(); beginPayment(); }
      if (event.key === "F6" && cart.length) { event.preventDefault(); void holdSale(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beginPayment, cart.length, holdSale]);
  const visible = query.trim() ? products : [];
  const subtotal = cart.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0);
  const manualDiscountValue = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const loyaltyPoints = Math.max(0, Number(loyaltyPointsToRedeem) || 0);
  const loyaltyDiscountValue = customerLoyalty?.program.active && loyaltyPoints >= customerLoyalty.program.minimum_redemption_points && loyaltyPoints <= Number(customerLoyalty.points_balance) ? Math.min(loyaltyPoints * Number(customerLoyalty.program.redemption_value_per_point), subtotal - manualDiscountValue) : 0;
  const discountValue = manualDiscountValue + loyaltyDiscountValue;
  const taxableAmount = subtotal - discountValue;
  const taxAmount = taxableAmount * Math.max(0, Number(taxRate) || 0) / 100;
  const total = taxableAmount + taxAmount;
  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const matchingCustomers = useMemo(() => {
    const term = customerQuery.trim().toLocaleLowerCase();
    if (!term) return customers.slice(0, 8);
    return customers.filter((customer) => [customer.name, customer.phone, customer.customer_number]
      .filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(term))).slice(0, 8);
  }, [customerQuery, customers]);
  const add = (item: Product) => {
    if (Number(item.available_quantity) <= 0) {
      setError(`${item.name} is out of stock at this branch. Receive stock before selling it.`);
      return;
    }
    setCart((current) => {
      const hit = current.find((line) => line.id === item.id);
      if (hit && hit.quantity >= Number(item.available_quantity)) {
        setError(`Only ${formatQuantity(item.available_quantity)} ${item.name} available at this branch.`);
        return current;
      }
      return hit
        ? current.map((line) =>
            line.id === item.id
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [...current, { ...item, quantity: 1, unit_price: item.selling_price }];
    });
    setQuery("");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };
  const change = (productId: string, amount: number) =>
    setCart((current) => current.flatMap((line) => {
      // Keep every other cart line exactly as it is.  Previously this handler
      // applied the increment/decrement to every selected product.
      if (line.id !== productId) return [line];
      const next = line.quantity + amount;
      if (next > Number(line.available_quantity)) {
        setError(`Only ${formatQuantity(line.available_quantity)} ${line.name} available at this branch.`);
        return [line];
      }
      return next > 0 ? [{ ...line, quantity: next }] : [];
    }));
  const setLineQuantity = (productId: string, rawValue: string) => {
    const next = Number(rawValue);
    setCart((current) => current.flatMap((line) => {
      if (line.id !== productId) return [line];
      if (!Number.isFinite(next) || next <= 0) return [];
      if (next > Number(line.available_quantity)) {
        setError(`Only ${formatQuantity(line.available_quantity)} ${line.name} available at this branch.`);
        return [line];
      }
      return [{ ...line, quantity: next }];
    }));
  };
  const setLinePrice = (productId: string, rawValue: string) => {
    if (!can(authorization, "sales.price_override")) return;
    const price = Number(rawValue);
    if (!Number.isFinite(price) || price < 0) return;
    setCart((current) => current.map((line) => line.id === productId ? { ...line, unit_price: rawValue } : line));
  };
  function changeBranch(nextBranchId: string) {
    if (session) { setError("Close the current cash session before switching branch."); return; }
    setBranchId(nextBranchId); setCart([]); setQuery(""); setCashPointId(""); setHeldSaleId(null); setDiscount("0"); setDiscountReason(""); setTaxRate("0"); setPriceOverrideReason(""); setError("");
  }
  function showSessionModal() {
    if (!session) {
      const period = defaultWorkPeriod();
      setWorkPeriodStart(period.start);
      setWorkPeriodEnd(period.end);
    }
    setShowSession(true);
  }
  const onScan = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim();
    let match = products.find(
      (item) => item.active && hasExactProductCode(item, code),
    );
    if (!match && code && branchId) {
      try {
        const params = new URLSearchParams({ branch_id: branchId, query: code, limit: "18" });
        const items = await api.get<Product[]>("/api/v1/pos/products?" + params.toString());
        setProducts(items);
        match = items.find((item) => item.active && hasExactProductCode(item, code));
      } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to search the scanned code."); return; }
    }
    if (match) add(match);
    else if (code) setError(`No active item matches “${query.trim()}”.`);
  };
  async function openSession() {
    if (!cashPointId) { setError("Select an available cash point before opening a session."); return; }
    const periodStart = new Date(workPeriodStart);
    const periodEnd = new Date(workPeriodEnd);
    if (!workPeriodStart || !workPeriodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      setError("Enter the work period opening and closing times."); return;
    }
    if (periodStart.getTime() > Date.now() || periodEnd.getTime() <= periodStart.getTime() || periodEnd.getTime() <= Date.now()) {
      setError("The work period must start now or earlier and end at a later time."); return;
    }
    try {
      const result = await api.post<CashSession>("/api/v1/pos/sessions/open", {
        branch_id: branchId,
        cash_point_id: cashPointId,
        opening_cash: openingCash,
        work_period_started_at: periodStart.toISOString(),
        work_period_ends_at: periodEnd.toISOString(),
      });
      setSession(result);
      setShowSession(false);
      setNotice(`Cash point ${result.cash_point_number} is now open as ${result.session_number}.`);
      await refreshCashPoints();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to open cash session.",
      );
    }
  }
  async function closeSession() {
    if (!session) return;
    try {
      const result = await api.post<ClosedCashSession>(`/api/v1/pos/sessions/${session.cash_session_id}/close`, {
        closing_cash: closingCash,
      });
      setSession(null);
      setClosingCash("");
      const period = defaultWorkPeriod();
      setWorkPeriodStart(period.start);
      setWorkPeriodEnd(period.end);
      setShowSession(false);
      setClosedSession(result);
      setNotice(`POS ${result.cash_point_number ?? ""} closed: ${result.sales_count} sale${result.sales_count === 1 ? "" : "s"}, net ${formatMoney(Number(result.net_sales))}.`);
      await refreshCashPoints();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to close cash session.",
      );
    }
  }
  async function pay(payments: PaymentInput[]) {
    if (!cart.length || !branchId || !session || isPosting) return;
    const requestId = checkoutRequestId.current || commandId();
    checkoutRequestId.current = requestId;
    const payload = {
      branch_id: branchId,
      customer_id: customerMode === "returning" ? customerId || null : null,
      cash_session_id: session.cash_session_id,
      lines: cart.map((line) => ({
        product_id: line.id,
        quantity: String(line.quantity),
        unit_price: line.unit_price === line.selling_price ? undefined : line.unit_price,
      })),
      payments,
      discount: manualDiscountValue.toFixed(2),
      discount_reason: manualDiscountValue ? discountReason.trim() || null : null,
      loyalty_points_to_redeem: loyaltyPointsToRedeem,
      price_override_reason: cart.some((line) => line.unit_price !== line.selling_price) ? priceOverrideReason.trim() || null : null,
      tax_rate: String(Math.max(0, Number(taxRate) || 0)),
      client_request_id: requestId,
      held_sale_id: heldSaleId,
    };
    const receiptLines = cart;
    const receiptCustomer = customerMode === "returning" ? selectedCustomer?.name || "Customer" : "Walk-in customer";
    setIsPosting(true);
    try {
      const queueSaleOffline = async () => {
        // The server is the price authority once a delayed sale reaches it.
        // Do not present a cached browser price as a price override.
        const offlinePayload = {
          ...payload,
          lines: payload.lines.map(({ product_id, quantity, unit_price }) => unit_price ? ({ product_id, quantity, unit_price }) : ({ product_id, quantity })),
        };
        await enqueue({
          commandId: requestId,
          commandType: "sale.create",
          payload: offlinePayload,
        });
        setPendingSaleCount((current) => current + 1);
        setShowPayment(false);
        setNotice("Sale saved offline. It will be posted in order when connection returns; the server will confirm its final price and stock availability.");
      };
      if (online) {
        try {
          const result = await api.post<{
            sale_id: string;
            receipt_number: string;
            total: string;
            cash_point_number: number | null;
            duplicate?: boolean;
            low_stock: LowStockItem[];
          }>("/api/v1/pos/sales", payload);
          setPostedReceipt({ sale_id: result.sale_id, receipt_number: result.receipt_number, total: result.total,
            cash_point_number: result.cash_point_number, customer_name: receiptCustomer, lines: receiptLines,
            payments, duplicate: result.duplicate });
          setShowPayment(false);
          if (result.duplicate) toast.info("Existing sale restored", `Receipt ${result.receipt_number} was already posted; no second sale was created.`);
          else setNotice(`Sale ${result.receipt_number} posted for ${result.total}.`);
          result.low_stock.forEach((item) => {
            toast.warning(
              `${item.name} is running low`,
              `Only ${formatQuantity(item.quantity)} ${item.unit} remain. Kindly re-stock.`,
            );
          });
          await refreshSales();
          await refreshHeldSales();
          setCatalogVersion((value) => value + 1);
        } catch (caught) {
          // A lost connection can occur between the heartbeat and checkout.
          // The shared client request ID makes this safe if the server did
          // complete the sale just before its response was lost.
          if (!isConnectionFailure(caught) && !(caught instanceof ApiError && caught.status >= 500)) throw caught;
          reportApiReachability(false);
          await queueSaleOffline();
        }
      } else {
        await queueSaleOffline();
      }
      setCart([]);
      setDiscount("0"); setDiscountReason(""); setTaxRate("0"); setPriceOverrideReason("");
      setCustomerMode("quick");
      setCustomerId("");
      setCustomerQuery("");
      setCustomerLoyalty(null);
      setLoyaltyPointsToRedeem("0");
      setHeldSaleId(null);
      checkoutRequestId.current = null;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to complete sale.",
      );
    } finally {
      setIsPosting(false);
    }
  }
  async function resumeHeldSale(held: HeldSale) {
    let lookup = products;
    const missingIds = held.lines.map((line) => line.product_id).filter((id) => !lookup.some((item) => item.id === id));
    if (missingIds.length && branchId) {
      const params = new URLSearchParams({ branch_id: branchId, limit: String(missingIds.length) });
      missingIds.forEach((id) => params.append("product_ids", id));
      try { lookup = await api.get<Product[]>("/api/v1/pos/products?" + params.toString()); }
      catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to restore this held sale."); return; }
    }
    const restored = held.lines.flatMap((line) => {
      const product = lookup.find((item) => item.id === line.product_id);
      return product ? [{ ...product, quantity: Number(line.quantity), unit_price: line.unit_price }] : [];
    });
    if (!restored.length) { setError("The products in this held sale are no longer active at this branch."); return; }
    setCart(restored);
    setHeldSaleId(held.id);
    if (held.customer_id) {
      setCustomerMode("returning");
      setCustomerId(held.customer_id);
      setCustomerQuery(held.customer_name || "");
      setLoyaltyPointsToRedeem("0");
      const customer = customers.find((item) => item.id === held.customer_id);
      if (customer) void selectCustomerForSale(customer);
      else setCustomerLoyalty(null);
    } else {
      setCustomerMode("quick"); setCustomerId(""); setCustomerQuery(""); setCustomerLoyalty(null); setLoyaltyPointsToRedeem("0");
    }
    setShowHeldSales(false);
    if (restored.some((line) => line.quantity > Number(line.available_quantity))) {
      toast.warning("Availability changed", "This held basket did not reserve stock. Review the highlighted quantities before payment.");
    }
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }
  async function cancelHeldSale(held: HeldSale) {
    try {
      await api.delete(`/api/v1/pos/held-sales/${held.id}`);
      setHeldSales((current) => current.filter((item) => item.id !== held.id));
      setHeldToCancel(null);
      setNotice(`${held.reference} was cancelled. No inventory or accounting entry was created.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to cancel the held sale.");
    }
  }
  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") || "").trim();
    const phone = String(values.get("phone") || "").trim();
    const email = String(values.get("email") || "").trim();
    const address = String(values.get("address") || "").trim();
    try {
      const customer = await api.post<Customer>("/api/v1/pos/customers", {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
      });
      setCustomers((current) => [...current, customer].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerMode("returning");
      await selectCustomerForSale(customer);
      setShowCustomer(false);
      setNotice(`${customer.name} has been saved as a buyer account.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create buyer account.");
    }
  }
  async function provisionTerminal(number: number, targetBranchId: string) {
    try {
      await api.post("/api/v1/pos/cash-points", { branch_id: targetBranchId, start_number: number, count: 1 });
      setNotice(`POS ${number} was provisioned for ${branches.find((branch) => branch.id === targetBranchId)?.name || "the selected branch"}.`);
      await refreshCashPoints();
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Unable to create cash points.");
    }
  }
  async function moveTerminal(cashPointId: string, targetBranchId: string) {
    try {
      await api.patch(`/api/v1/pos/cash-points/${cashPointId}`, { branch_id: targetBranchId });
      setNotice(`POS terminal was moved to ${branches.find((branch) => branch.id === targetBranchId)?.name || "the selected branch"}.`);
      await refreshCashPoints();
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Unable to move the POS terminal.");
    }
  }
  async function unassignTerminal(cashPointId: string) {
    try {
      await api.patch(`/api/v1/pos/cash-points/${cashPointId}`, { active: false });
      setNotice("POS terminal was removed from its branch and is now an unassigned plan slot.");
      await refreshCashPoints();
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Unable to unassign the POS terminal.");
    }
  }
  async function voidSale(sale: Sale, voidReason: string) {
    try {
      await api.delete(`/api/v1/pos/sales/${sale.id}`, { reason: voidReason.trim() });
      setNotice(`Receipt ${sale.receipt_number} was voided and its effects were reversed.`);
      toast.success("Receipt voided", "The receipt remains available in the audit history.");
      await refreshSales();
      setCatalogVersion((value) => value + 1);
    } catch (caught) {
      throw new Error(caught instanceof ApiError ? caught.message : "Unable to void this receipt.");
    }
  }
  async function selectCustomerForSale(customer: Customer) {
    setCustomerId(customer.id); setCustomerQuery(customer.name); setCustomerPickerOpen(false); setLoyaltyPointsToRedeem("0");
    try { setCustomerLoyalty(await api.get<CustomerLoyalty>(`/api/v1/pos/customers/${customer.id}/loyalty`)); }
    catch { setCustomerLoyalty(null); }
  }
  const selectedCustomer = customers.find((item) => item.id === customerId);
  return (
    <DashboardShell title="Point of sale" subtitle="Fast stock-code checkout">
      <PermissionGate permission="sales.create">
        <div className="mx-auto max-w-[1280px] space-y-6">
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">
                Checkout terminal
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Point of sale
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppSelect
                value={branchId}
                onChange={changeBranch}
                disabled={Boolean(session)}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder="Select branch"
                className="min-w-52"
                buttonClassName="font-semibold"
              />
              {!session && branchId && (
                <AppSelect
                  value={cashPointId}
                  onChange={setCashPointId}
                  options={[
                    {
                      value: "",
                      label: cashPoints.some((point) => point.available)
                        ? "Select available POS terminal"
                        : "No POS terminal available",
                      disabled: true,
                    },
                    ...cashPoints.filter((point) => point.available).map((point) => ({
                      value: point.id,
                      label: `POS ${point.number} · Available`,
                    })),
                  ]}
                  placeholder="Select POS terminal"
                  className="min-w-56"
                  buttonClassName="font-semibold"
                  aria-label="Select POS terminal"
                />
              )}
              {session ? (
                <button
                  onClick={showSessionModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700"
                >
                  <CheckCircle2 size={16} /> POS {session.cash_point_number} open · Close session
                </button>
              ) : (
                <button
                  disabled={!branchId || !cashPointId}
                  onClick={showSessionModal}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  {cashPointId ? `Open POS ${cashPoints.find((point) => point.id === cashPointId)?.number} session` : "Open cash session"}
                </button>
              )}
              <button onClick={() => setShowHeldSales(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700"><Clock3 size={16} /> Held {heldSales.length ? `(${heldSales.length})` : ""}</button>
              <button onClick={() => setShowHistory((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700"><ReceiptText size={16} /> {showHistory ? "Hide Sales History" : "Sales History"}</button>
              {canManageCashPoints && <button disabled={!branchId} onClick={() => setShowCashPoints(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"><Plus size={16} /> Manage terminals</button>}
            </div>
          </header>
          {!session && branchId && (
            <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${cashPoints.some((point) => point.available) ? "border-teal-100 bg-teal-50 text-teal-800" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/70"><Clock3 size={16} /></span>
              {cashPoints.some((point) => point.available)
                ? "Select an available POS terminal above, then open your cash session. The terminal stays reserved for you until you close that session."
                : "No POS terminal is currently available at this branch. Another cashier may have an open session, or an administrator must place a terminal here."}
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-slate-950 p-5 text-white sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-400/15 text-teal-300"><Barcode size={23} /></span>
                  <div>
                    <p className="font-bold">Find received stock</p>
                    <p className="text-xs text-slate-300">
                      Stock code (scanned from pack or manually entered), or
                      product name
                    </p>
                  </div>
                </div>
                <div className="relative mt-4">
                  <Search
                    size={18}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onKeyDown={onScan}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setError("");
                    }}
                    placeholder="Scan stock code or search item name…"
                    className="w-full rounded-2xl border border-slate-600 bg-white py-3 pl-11 pr-3 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-400/15"
                  />
                </div>
                <p className="mt-3 text-xs text-slate-400">Search product name or stock code. Zero-stock items stay visible but cannot be added. Press Enter after scanning to add immediately.</p>
              </div>
              {busy ? (
                <p className="p-10 text-center text-sm text-slate-500">Loading received stock…</p>
              ) : !query.trim() ? (
                <div className="grid min-h-[420px] place-items-center p-5 text-center sm:p-6">
                  <div>
                    <Barcode className="mx-auto text-slate-300" size={34} />
                    <p className="mt-3 font-bold text-slate-800">Ready to scan or search</p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Enter a product name or stock code to see matching items. F2 focuses this field; a scanned code is added when you press Enter.</p>
                  </div>
                </div>
              ) : (
                <div className="min-h-[420px] p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-slate-700">Search results</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{visible.length} found</span></div><div className="space-y-2">
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => add(item)}
                      disabled={Number(item.available_quantity) <= 0}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:border-rose-100 disabled:bg-rose-50 disabled:opacity-75"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 font-mono text-xs font-bold text-slate-500">{item.stock_code.slice(0, 3)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{item.name}</span><span className={`mt-1 block font-mono text-xs ${Number(item.available_quantity) <= 0 ? "font-bold text-rose-700" : "text-slate-500"}`}>{item.stock_code} · {formatQuantity(item.available_quantity)} {Number(item.available_quantity) <= 0 ? "available · OUT OF STOCK" : "available"}</span></span>
                      <span className="text-right"><span className="block text-base font-bold text-teal-700">{formatMoney(Number(item.selling_price))}</span><span className={`mt-1 block text-[11px] font-bold uppercase tracking-wide ${Number(item.available_quantity) <= 0 ? "text-rose-700" : "text-teal-600"}`}>{Number(item.available_quantity) <= 0 ? "Out of stock" : "Add"}</span></span>
                    </button>
                  ))}
                  {!visible.length && (
                    <div className="p-12 text-center">
                      <ShoppingCart
                        className="mx-auto text-slate-300"
                        size={32}
                      />
                      <p className="mt-3 font-semibold text-slate-600">
                        No matching item
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Try another stock code or product name.</p>
                    </div>
                  )}
                </div></div>
              )}
            </section>
            <section className="flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-600">Current transaction</p>
                  <h2 className="mt-1 font-bold">Sale basket</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {quantity} item{quantity === 1 ? "" : "s"} · {cart.length}{" "}
                    line{cart.length === 1 ? "" : "s"}
                  </p>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => { setCart([]); setHeldSaleId(null); }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-rose-600"
                  >
                    <Trash2 size={14} /> Clear
                  </button>
                )}
                </div>
                <div className="relative mt-4">
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><Users size={15} /></span><div className="min-w-0 flex-1">{customerMode === "quick" ? <button onClick={() => { setCustomerMode("returning"); setCustomerQuery(""); setCustomerPickerOpen(true); }} className="text-left text-xs font-bold text-slate-600 hover:text-teal-700">Walk-in customer <span className="font-normal text-slate-400">· attach customer</span></button> : <input autoComplete="off" value={customerQuery} onFocus={() => setCustomerPickerOpen(true)} onChange={(event) => { setCustomerQuery(event.target.value); setCustomerId(""); setCustomerLoyalty(null); setLoyaltyPointsToRedeem("0"); setCustomerPickerOpen(true); }} placeholder="Search customer name or phone" className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400" />}</div>{customerMode === "returning" && <button onClick={() => { setCustomerMode("quick"); setCustomerId(""); setCustomerQuery(""); setCustomerLoyalty(null); setLoyaltyPointsToRedeem("0"); setCustomerPickerOpen(false); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Walk-in</button>}<button onClick={() => setShowCustomer(true)} title="Create customer" className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-100"><UserPlus size={16} /></button></div>
                  {customerMode === "returning" && customerPickerOpen && <div className="absolute left-0 right-0 top-10 z-20 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{matchingCustomers.map((customer) => <button key={customer.id} onClick={() => { if (!customer.active) { setError(`${customer.name} is an inactive customer. Contact an administrator for clarification.`); return; } void selectCustomerForSale(customer); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-teal-50 ${customer.active ? "" : "bg-slate-50"}`}><span><span className="block text-sm font-bold text-slate-800">{customer.name}</span><span className="block text-xs text-slate-400">{customer.phone || customer.customer_number}{!customer.active && " · Inactive — contact administrator"}</span></span>{customer.id === customerId && <CheckCircle2 size={16} className="text-teal-600" />}</button>)}{!matchingCustomers.length && <p className="px-3 py-4 text-xs text-slate-500">No customer match. Create a new buyer account.</p>}</div>}
                </div>
              </div>
              <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5">
                {cart.length ? (
                  cart.map((line) => (
                    <div key={line.id} className="flex items-center gap-3 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {line.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">
                          {line.stock_code}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatMoney(Number(line.unit_price))} each · {line.available_quantity} in stock
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => change(line.id, -1)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                        >
                          <CircleMinus size={18} />
                        </button>
                        <input aria-label={`Quantity for ${line.name}`} value={line.quantity} onChange={(event) => setLineQuantity(line.id, event.target.value)} type="number" min="0.001" max={line.available_quantity} step="any" className="w-11 rounded-lg border border-slate-200 bg-white py-1 text-center text-sm font-bold outline-none focus:border-teal-500" />
                        <button
                          onClick={() => change(line.id, 1)}
                          className="rounded-lg p-1 text-teal-600 hover:bg-teal-50"
                        >
                          <CirclePlus size={18} />
                        </button>
                      </div>
                      {can(authorization, "sales.price_override") && <input aria-label={`Unit price for ${line.name}`} value={line.unit_price} onChange={(event) => setLinePrice(line.id, event.target.value)} type="number" min="0" step="0.01" className="w-20 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-right text-xs font-bold text-amber-900 outline-none focus:border-amber-500" />}
                      <p className="w-20 text-right text-sm font-bold">
                        {formatMoney(Number(line.unit_price) * line.quantity)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="grid h-full min-h-72 place-items-center text-center">
                    <div>
                      <ShoppingCart
                        className="mx-auto text-slate-300"
                        size={38}
                      />
                      <p className="mt-3 font-semibold text-slate-500">
                        Ready for the next customer
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Scan or enter a stock code.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 bg-slate-950 p-5 text-white">
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {can(authorization, "sales.discount") && <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={discount} onChange={(event) => setDiscount(event.target.value)} type="number" min="0" max={subtotal} step="0.01" placeholder="Discount amount" className="rounded-xl border border-slate-600 bg-white/10 px-3 py-2 text-sm font-bold text-white placeholder:text-slate-400" /><input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Discount reason" className="rounded-xl border border-slate-600 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400" /></div>}
                {customerId && customerLoyalty?.program.active && <div className="mt-3 rounded-xl border border-teal-300/30 bg-teal-400/10 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-teal-100">Loyalty balance: {customerLoyalty.points_balance} points</span><span className="text-xs text-teal-200">{customerLoyalty.program.redemption_value_per_point} per point</span></div><input value={loyaltyPointsToRedeem} onChange={(event) => setLoyaltyPointsToRedeem(event.target.value)} type="number" min="0" max={customerLoyalty.points_balance} step="0.001" placeholder="Points to redeem" className="mt-2 w-full rounded-lg border border-teal-300/30 bg-white/10 px-3 py-2 text-sm font-bold text-white placeholder:text-teal-100" />{loyaltyDiscountValue > 0 && <p className="mt-2 text-xs font-bold text-teal-100">Loyalty saving: −{formatMoney(loyaltyDiscountValue)}</p>}</div>}
                {cart.some((line) => line.unit_price !== line.selling_price) && <input value={priceOverrideReason} onChange={(event) => setPriceOverrideReason(event.target.value)} placeholder="Price override reason" className="mt-2 w-full rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-white placeholder:text-amber-100" />}
                <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-300"><span>VAT / tax</span><label className="flex items-center gap-2"><select value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="rounded-lg border border-slate-600 bg-white/10 px-2 py-1 text-xs font-bold text-white"><option value="0">None</option>{approvedTaxRates.map((rate) => <option key={rate.name} value={String(rate.rate)}>{rate.name} {rate.rate}%</option>)}</select></label><span>{formatMoney(taxAmount)}</span></div>
                {discountValue > 0 && <div className="mt-2 flex justify-between text-sm text-amber-200"><span>Discount</span><span>−{formatMoney(discountValue)}</span></div>}
                <div className="mt-2 flex justify-between text-3xl font-bold tracking-tight">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    disabled={!cart.length || isPosting}
                    onClick={() => void holdSale()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-white/5 px-3 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-40"
                  >
                    <PauseCircle size={16} /> Hold <span className="hidden sm:inline">sale</span>
                  </button>
                  <button
                    disabled={!cart.length || isPosting}
                    onClick={beginPayment}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-3 py-3 text-sm font-bold text-white transition hover:bg-teal-400 disabled:opacity-40"
                  >
                    <Banknote size={16} /> Pay <span className="hidden sm:inline">· F4</span>
                  </button>
                </div>
                {heldSaleId && <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-center text-xs font-semibold text-amber-200">Resuming a held basket. Stock is checked again at payment.</p>}
                {!online && (
                  <p className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-amber-300">
                    <WifiOff size={13} /> {pendingSaleCount ? `${pendingSaleCount} sale${pendingSaleCount === 1 ? "" : "s"} waiting to sync` : "Sale will sync later"}
                  </p>
                )}
              </div>
            </section>
          </div>
          {showHistory && <SalesHistory sales={sales} requestVoid={setSaleToVoid} fromDate={salesFromDate} toDate={salesToDate} setFromDate={setSalesFromDate} setToDate={setSalesToDate} />}
          {saleToVoid && <VoidReceiptModal receiptNumber={saleToVoid.receipt_number} receiptType="sale" close={() => setSaleToVoid(null)} confirm={(reason) => voidSale(saleToVoid, reason)} />}
          {showCustomer && <CustomerModal close={() => setShowCustomer(false)} save={createCustomer} />}
          {showPayment && <PaymentModal total={total} busy={isPosting} allowCredit={customerMode === "returning" && Boolean(customerId)} close={() => !isPosting && setShowPayment(false)} pay={(payments) => void pay(payments)} />}
          {postedReceipt && <SaleReceiptModal receipt={postedReceipt} close={() => { setPostedReceipt(null); window.setTimeout(() => searchRef.current?.focus(), 0); }} />}
          {showHeldSales && <HeldSalesModal heldSales={heldSales} close={() => setShowHeldSales(false)} resume={(held) => void resumeHeldSale(held)} cancel={setHeldToCancel} />}
          {heldToCancel && <ConfirmHeldSaleModal held={heldToCancel} close={() => setHeldToCancel(null)} confirm={() => void cancelHeldSale(heldToCancel)} />}
          {showSession && (
            <SessionModal
              session={session}
              cashPoints={cashPoints}
              cashPointId={cashPointId}
              openingCash={openingCash}
              closingCash={closingCash}
              workPeriodStart={workPeriodStart}
              workPeriodEnd={workPeriodEnd}
              preview={sessionPreview}
              setCashPointId={setCashPointId}
              setOpeningCash={setOpeningCash}
              setClosingCash={setClosingCash}
              setWorkPeriodStart={setWorkPeriodStart}
              setWorkPeriodEnd={setWorkPeriodEnd}
              close={() => setShowSession(false)}
              open={() => void openSession()}
              finish={() => void closeSession()}
            />
          )}
          {showCashPoints && <CashPointsModal branches={branches} cashPointLimit={cashPointLimit} terminalSlots={terminalSlots} subscriptionActive={cashPointSubscriptionActive} close={() => setShowCashPoints(false)} provision={provisionTerminal} move={moveTerminal} unassign={unassignTerminal} />}
          {closedSession && <ClosedSessionSummaryModal summary={closedSession} close={() => setClosedSession(null)} />}
        </div>
      </PermissionGate>
    </DashboardShell>
  );
}

function PaymentModal({ total, busy, close, pay, allowCredit }: { total: number; busy: boolean; close: () => void; pay: (payments: PaymentInput[]) => void; allowCredit: boolean }) {
  const [payments, setPayments] = useState<PaymentInput[]>([{ method: "cash", amount: total.toFixed(2), reference: "" }]);
  const [cashTendered, setCashTendered] = useState(total.toFixed(2));
  const paid = payments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const cashApplied = payments.filter((item) => item.method === "cash").reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const change = Math.max(0, (Number(cashTendered) || 0) - cashApplied);
  const difference = total - paid;
  const electronicNeedsReference = payments.some((item) => !["cash", "credit"].includes(item.method) && !item.reference?.trim());
  function update(index: number, patch: Partial<PaymentInput>) { setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function chooseMethod(method: string) { setPayments([{ method, amount: total.toFixed(2), reference: "" }]); setCashTendered(total.toFixed(2)); }
  function submit() {
    if (Math.abs(difference) > 0.005) return;
    if (cashApplied && (Number(cashTendered) || 0) < cashApplied) return;
    if (electronicNeedsReference) return;
    pay(payments.map((item) => ({ ...item, amount: Number(item.amount).toFixed(2), reference: item.reference?.trim() || null })));
  }
  const methods = [
    ["cash", "Cash", Banknote], ["card", "Card", CreditCard], ["bank_transfer", "Transfer", Landmark], ["mobile_money", "Mobile", Smartphone], ["credit", "Customer credit", Users],
  ] as const;
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4"><section className="my-6 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Take payment</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{formatMoney(total)}</h2><p className="mt-1 text-sm text-slate-500">Choose a method or split the payment. Card, transfer, mobile, cash, and credit settle to distinct accounts.</p></div><button onClick={close} disabled={busy} aria-label="Close payment" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={20} /></button></div><div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">{methods.map(([value, label, Icon]) => <button key={value} onClick={() => chooseMethod(value)} disabled={busy || (value === "credit" && !allowCredit)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition disabled:opacity-40 ${payments.length === 1 && payments[0].method === value ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-teal-300"}`}><Icon size={19} />{label}</button>)}</div>{!allowCredit && <p className="mt-3 text-xs font-semibold text-amber-700">Attach an active customer account before using customer credit.</p>}<div className="mt-6 space-y-3">{payments.map((payment, index) => <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[150px_1fr_1fr_auto]"><FormSelect value={payment.method} onChange={(event) => update(index, { method: event.target.value, reference: "" })} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option disabled={!allowCredit} value="credit">Customer credit</option></FormSelect><input value={payment.amount} onChange={(event) => update(index, { amount: event.target.value })} disabled={busy} type="number" min="0" step="0.01" aria-label={`${payment.method} payment amount`} placeholder="Amount applied" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-teal-500" />{payment.method === "cash" ? <span className="flex items-center px-3 text-xs font-semibold text-slate-500">Applied to sale</span> : payment.method === "credit" ? <span className="flex items-center px-3 text-xs font-semibold text-violet-700">Creates a customer receivable</span> : <input value={payment.reference || ""} onChange={(event) => update(index, { reference: event.target.value })} disabled={busy} placeholder="Reference *" aria-label={`${payment.method} reference`} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500" />}{payments.length > 1 && <button onClick={() => setPayments((current) => current.filter((_item, itemIndex) => itemIndex !== index))} disabled={busy} aria-label="Remove payment" className="rounded-xl p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={17} /></button>}</div>)}</div><button onClick={() => setPayments((current) => [...current, { method: "card", amount: "", reference: "" }])} disabled={busy} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-800"><Plus size={16} /> Split payment</button>{cashApplied > 0 && <div className="mt-5 grid gap-3 rounded-2xl bg-teal-50 p-4 sm:grid-cols-2"><label className="text-xs font-bold text-teal-900">Cash tendered<input value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} disabled={busy} type="number" min={cashApplied} step="0.01" className="mt-1.5 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500" /></label><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Change due</p><p className="mt-2 text-2xl font-bold text-teal-900">{formatMoney(change)}</p></div></div>}<div className={`mt-5 flex items-center justify-between rounded-2xl px-4 py-3 text-sm ${Math.abs(difference) <= 0.005 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><span className="font-semibold">Payment applied</span><span className="font-bold">{formatMoney(paid)} {Math.abs(difference) > 0.005 && `· ${difference > 0 ? formatMoney(difference) + " remaining" : formatMoney(Math.abs(difference)) + " over"}`}</span></div>{electronicNeedsReference && <p className="mt-3 text-xs font-semibold text-amber-700">Add the transaction reference for every card, transfer, or mobile payment.</p>}<button onClick={submit} disabled={busy || Math.abs(difference) > 0.005 || electronicNeedsReference || (cashApplied > 0 && (Number(cashTendered) || 0) < cashApplied)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Posting sale…" : <><CheckCircle2 size={17} /> Confirm payment · {formatMoney(total)}</>}</button></section></div>;
}

function SaleReceiptModal({ receipt, close }: { receipt: PostedReceipt; close: () => void }) {
  const share = async () => {
    const text = `Receipt ${receipt.receipt_number} · ${formatMoney(Number(receipt.total))} · ${receipt.customer_name}`;
    if (navigator.share) await navigator.share({ title: "Sales receipt", text });
    else await navigator.clipboard?.writeText(text);
  };
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/50 p-4 print:bg-white"><section className="mx-auto my-6 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl print:my-0 print:max-w-none print:shadow-none"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Payment complete</p><h2 className="mt-1 font-mono text-2xl font-bold text-slate-900">{receipt.receipt_number}</h2><p className="mt-1 text-sm text-slate-500">POS {receipt.cash_point_number ?? "—"} · {receipt.customer_name}</p></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 print:hidden"><X size={20} /></button></div>{receipt.duplicate && <p className="mt-4 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">This is the original receipt recovered after a retry. No duplicate sale was created.</p>}<div className="mt-6 divide-y divide-slate-100 border-y border-slate-100">{receipt.lines.map((line) => <div key={line.id} className="flex gap-4 py-3 text-sm"><div className="min-w-0 flex-1"><p className="font-bold text-slate-800">{line.name}</p><p className="mt-0.5 font-mono text-xs text-slate-400">{line.stock_code} · {line.quantity} × {formatMoney(Number(line.unit_price))}</p></div><p className="font-bold text-slate-800">{formatMoney(Number(line.unit_price) * line.quantity)}</p></div>)}</div><div className="mt-5 space-y-2">{receipt.payments.map((payment, index) => <p key={`${payment.method}-${index}`} className="flex justify-between text-sm"><span className="capitalize text-slate-500">{payment.method.replaceAll("_", " ")}{payment.reference ? ` · ${payment.reference}` : ""}</span><span className="font-bold text-slate-800">{formatMoney(Number(payment.amount))}</span></p>)}<div className="flex justify-between border-t border-slate-200 pt-4 text-2xl font-bold text-slate-950"><span>Total</span><span>{formatMoney(Number(receipt.total))}</span></div></div><div className="mt-6 flex flex-wrap gap-2 print:hidden"><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300"><Printer size={16} /> Print</button><button onClick={() => void share()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300">Share</button><button onClick={close} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> New sale</button></div></section></div>;
}

function HeldSalesModal({ heldSales, close, resume, cancel }: { heldSales: HeldSale[]; close: () => void; resume: (held: HeldSale) => void; cancel: (held: HeldSale) => void }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><section className="mx-auto my-6 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Parked baskets</p><h2 className="mt-1 text-2xl font-bold">Held sales</h2><p className="mt-1 text-sm text-slate-500">Holding a sale does not reserve stock, create a receipt, or post accounting.</p></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button></div><div className="mt-6 space-y-3">{heldSales.map((held) => <div key={held.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-mono text-sm font-bold text-slate-800">{held.reference}</p><p className="mt-1 text-sm font-semibold text-slate-700">{held.customer_name || "Walk-in customer"} · {held.line_count} line{held.line_count === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-slate-400">{held.created_at ? new Date(held.created_at).toLocaleString() : ""}{held.note ? ` · ${held.note}` : ""}</p></div><p className="text-lg font-bold text-slate-900">{formatMoney(Number(held.subtotal))}</p><div className="flex gap-2"><button onClick={() => resume(held)} className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white"><Play size={14} /> Resume</button><button onClick={() => cancel(held)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Cancel</button></div></div></div>)}{!heldSales.length && <div className="grid min-h-56 place-items-center text-center"><div><PauseCircle className="mx-auto text-slate-300" size={34} /><p className="mt-3 text-sm font-bold text-slate-700">No held sales</p><p className="mt-1 text-xs text-slate-500">Use Hold sale when a customer needs to step away.</p></div></div>}</div></section></div>;
}

function ConfirmHeldSaleModal({ held, close, confirm }: { held: HeldSale; close: () => void; confirm: () => void }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-rose-600">Cancel held sale</p><h2 className="mt-2 text-xl font-bold">Cancel {held.reference}?</h2><p className="mt-3 text-sm leading-6 text-slate-600">This only discards the parked basket. It does not reverse stock or money because neither was posted.</p><div className="mt-6 flex justify-end gap-3"><button onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Keep held sale</button><button onClick={confirm} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white">Cancel held sale</button></div></section></div>;
}

function SalesHistory({
  sales,
  requestVoid,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}: {
  sales: Sale[];
  requestVoid: (sale: Sale) => void;
  fromDate: string;
  toDate: string;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
}) {
  const pageSize = 10;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const visibleSales = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((sale) => `${sale.receipt_number} ${sale.customer_name || "walk-in"} ${sale.customer_number || ""} ${sale.sold_by_name} ${sale.payments.map((item) => item.method).join(" ")}`.toLowerCase().includes(term));
  }, [sales, query]);
  const pageCount = Math.max(1, Math.ceil(visibleSales.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageSales = visibleSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-600">Till activity</p>
          <h2 className="mt-1 text-xl font-bold">Sales history</h2>
          <p className="mt-1 text-sm text-slate-500">Showing up to 200 receipts for the selected branch and period.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
          <label className="text-xs font-bold text-slate-600">From<input type="date" value={fromDate} max={toDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 sm:w-40" /></label>
          <label className="text-xs font-bold text-slate-600">To<input type="date" value={toDate} min={fromDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 sm:w-40" /></label>
          <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Receipt, buyer, seller or payment" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />
          </div>
        </div>
      </div>
      <div className="mt-5 max-h-[650px] overflow-auto rounded-2xl border border-slate-100">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Buyer</th><th className="px-4 py-3 text-center">Qty sold</th><th className="px-4 py-3">Sold by</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageSales.map((sale) => (
              <tr key={sale.id} className="transition hover:bg-slate-50/80">
                <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-700">{sale.receipt_number}</td>
                <td className="px-4 py-3.5"><p className="font-bold text-slate-800">{sale.customer_name || "Walk-in customer"}</p>{sale.customer_number && <p className="mt-0.5 font-mono text-xs text-slate-400">{sale.customer_number}</p>}</td>
                <td className="px-4 py-3.5 text-center"><p className="font-bold text-slate-700">{sale.total_quantity}</p><p className="mt-0.5 text-[11px] text-slate-400">{sale.line_count} line{sale.line_count === 1 ? "" : "s"}</p></td>
                <td className="px-4 py-3.5 font-semibold text-slate-700">{sale.sold_by_name}</td>
                <td className="px-4 py-3.5 capitalize text-slate-600">{sale.payments.map((item) => item.method).join(", ") || "—"}</td>
                <td className="px-4 py-3.5"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${sale.status === "voided" ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"}`}>{sale.status.replaceAll("_", " ")}</span></td>
                <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(sale.created_at).toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right font-bold text-slate-800">{formatMoney(Number(sale.total))}</td>
                <td className="px-4 py-3.5 text-right">{sale.can_void && <button onClick={() => requestVoid(sale)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Void</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleSales.length && <p className="py-10 text-center text-sm text-slate-500">{sales.length ? "No receipts match your search." : "No sales receipts yet for this branch."}</p>}
      </div>
      {visibleSales.length > pageSize && <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-500">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleSales.length)} of {visibleSales.length} receipts</p>
        <div className="flex items-center gap-2"><button disabled={currentPage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="px-1 text-xs font-bold text-slate-500">Page {currentPage} of {pageCount}</span><button disabled={currentPage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>
      </div>}
    </section>
  );
}

function CustomerModal({ close, save }: { close: () => void; save: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form onSubmit={save} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">Buyer account</p><h2 className="mt-1 text-xl font-bold">Create buyer</h2></div>
          <button type="button" onClick={close} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={19} /></button>
        </div>
        <p className="mt-2 text-sm text-slate-500">Save a customer once, then select them for future sales and receipt history.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Full name *<input required name="name" minLength={2} placeholder="Customer name" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></label>
          <label className="text-xs font-bold text-slate-600">Phone<input name="phone" type="tel" placeholder="080…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></label>
          <label className="text-xs font-bold text-slate-600">Email<input name="email" type="email" placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Address<input name="address" placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700">Save buyer</button></div>
      </form>
    </div>
  );
}
function SessionModal({
  session,
  cashPoints,
  cashPointId,
  openingCash,
  closingCash,
  workPeriodStart,
  workPeriodEnd,
  preview,
  setCashPointId,
  setOpeningCash,
  setClosingCash,
  setWorkPeriodStart,
  setWorkPeriodEnd,
  close,
  open,
  finish,
}: {
  session: CashSession | null;
  cashPoints: CashPoint[];
  cashPointId: string;
  openingCash: string;
  closingCash: string;
  workPeriodStart: string;
  workPeriodEnd: string;
  preview: SessionPreview | null;
  setCashPointId: (value: string) => void;
  setOpeningCash: (value: string) => void;
  setClosingCash: (value: string) => void;
  setWorkPeriodStart: (value: string) => void;
  setWorkPeriodEnd: (value: string) => void;
  close: () => void;
  open: () => void;
  finish: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {session ? "Close POS session" : "Select POS terminal"}
          </h2>
          <button onClick={close} className="text-slate-400">
            <X size={18} />
          </button>
        </div>
        {session ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              {session.session_number}
            </p>
            {session.work_period_ends_at && <p className="mt-1 text-xs font-semibold text-amber-700">Scheduled to close at {new Date(session.work_period_ends_at).toLocaleString()}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-xs">{preview ? <><p><span className="block text-slate-400">Sales / returns</span><strong>{preview.sales_count} / {preview.refund_count}</strong></p><p><span className="block text-slate-400">Net sales</span><strong>{formatMoney(Number(preview.net_sales))}</strong></p><p className="col-span-2"><span className="block text-slate-400">Expected cash before count</span><strong className="text-sm text-slate-800">{formatMoney(Number(preview.expected_cash))}</strong></p></> : <p className="col-span-2 text-slate-500">Loading the live reconciliation summary…</p>}</div>
            <Field
              label="Counted closing cash"
              value={closingCash}
              setValue={setClosingCash}
            />
            <button
              onClick={finish}
              disabled={!closingCash}
              className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              Close session
            </button>
          </>
        ) : (
          <>
            <AppSelect
              value={cashPointId}
              onChange={setCashPointId}
              options={[{ value: "", label: cashPoints.length ? "Select available POS terminal" : "No POS terminals configured" }, ...cashPoints.filter((point) => point.available).map((point) => ({ value: point.id, label: `POS ${point.number} · Available` }))]}
            />
            <p className="mt-2 text-xs text-slate-500">You cannot complete a sale until you select an available terminal and open your session. The terminal stays reserved until you close it.</p>
            <Field
              label="Opening cash"
              value={openingCash}
              setValue={setOpeningCash}
            />
            <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Work period</p><p className="mt-1 text-xs leading-5 text-slate-600">The terminal closes automatically at the scheduled end if it is still open. No physical cash count is invented.</p></div>
              <label className="text-xs font-bold text-slate-600">Work period opens<input required type="datetime-local" value={workPeriodStart} onChange={(event) => setWorkPeriodStart(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600" /></label>
              <label className="text-xs font-bold text-slate-600">Automatically close at<input required type="datetime-local" value={workPeriodEnd} onChange={(event) => setWorkPeriodEnd(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600" /></label>
            </div>
            <button
              onClick={open}
              disabled={!cashPointId || !workPeriodStart || !workPeriodEnd}
              className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white"
            >
              Open POS session
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ClosedSessionSummaryModal({ summary, close }: { summary: ClosedCashSession; close: () => void }) {
  const rows = [
    ["Gross sales", summary.gross_sales], ["Returns", summary.refund_total], ["Net sales", summary.net_sales],
    ["Expected cash", summary.expected_cash], ["Counted cash", summary.closing_cash], ["Variance", summary.variance],
  ];
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">POS period closed</p><h2 className="mt-1 text-xl font-bold">POS {summary.cash_point_number ?? "—"} summary</h2><p className="mt-1 text-xs text-slate-500">{summary.session_number} · {summary.sales_count} sale{summary.sales_count === 1 ? "" : "s"} · {summary.refund_count} return{summary.refund_count === 1 ? "" : "s"}</p></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-bold text-slate-900">{formatMoney(Number(value))}</span></div>)}</div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Payments received</p><div className="mt-2 space-y-1">{Object.entries(summary.payments_by_method).map(([method, amount]) => <p key={method} className="flex justify-between text-sm"><span className="capitalize text-slate-600">{method.replaceAll("_", " ")}</span><span className="font-bold">{formatMoney(Number(amount))}</span></p>)}{!Object.keys(summary.payments_by_method).length && <p className="text-sm text-slate-500">No payments were recorded.</p>}</div></div><button onClick={close} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Done</button></div></div>;
}

function CashPointsModal({ branches, cashPointLimit, terminalSlots, subscriptionActive, close, provision, move, unassign }: { branches: Branch[]; cashPointLimit: number; terminalSlots: TerminalSlot[]; subscriptionActive: boolean; close: () => void; provision: (number: number, branchId: string) => Promise<void>; move: (cashPointId: string, branchId: string) => Promise<void>; unassign: (cashPointId: string) => Promise<void> }) {
  const unassignedSlots = terminalSlots.filter((slot) => slot.state === "unassigned");
  const movableSlots = terminalSlots.filter((slot) => slot.state === "available" && slot.cash_point_id);
  const [selectedNumber, setSelectedNumber] = useState(String(unassignedSlots[0]?.number || ""));
  const [placementBranchId, setPlacementBranchId] = useState("");
  const [managedCashPointId, setManagedCashPointId] = useState(String(movableSlots[0]?.cash_point_id || ""));
  const [moveBranchId, setMoveBranchId] = useState("");
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [error, setError] = useState(() => !subscriptionActive ? "No active company pricing plan is assigned yet. A platform super administrator must assign a plan before POS terminals can be provisioned." : "");
  const [busy, setBusy] = useState(false);
  const managedSlot = movableSlots.find((slot) => slot.cash_point_id === managedCashPointId);
  async function placeTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const number = Number(selectedNumber);
    if (!subscriptionActive || !unassignedSlots.some((slot) => slot.number === number) || !placementBranchId) {
      setError("Select an unassigned POS terminal and the branch where it should be placed."); return;
    }
    setBusy(true);
    try { await provision(number, placementBranchId); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to provision the POS terminal."); }
    finally { setBusy(false); }
  }
  async function moveTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!managedSlot?.cash_point_id || !moveBranchId) { setError("Select an available terminal and its destination branch."); return; }
    setBusy(true);
    try { await move(managedSlot.cash_point_id, moveBranchId); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to move the POS terminal."); }
    finally { setBusy(false); }
  }
  async function unassignSelectedTerminal() {
    if (!managedSlot?.cash_point_id) { setError("Select an available terminal first."); return; }
    if (!confirmUnassign) { setConfirmUnassign(true); return; }
    setBusy(true); setError("");
    try { await unassign(managedSlot.cash_point_id); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to unassign the POS terminal."); }
    finally { setBusy(false); }
  }
  const branchOptions = <><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</>;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">POS terminal allocation</p><h2 className="mt-1 text-xl font-bold">Company terminal slots</h2><p className="mt-1 text-sm text-slate-500">Your plan contains {cashPointLimit} fixed POS terminal{cashPointLimit === 1 ? "" : "s"}. “Available” means placed at a branch with no cashier currently using it.</p></div><button type="button" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-5 space-y-2">{terminalSlots.map((slot) => <div key={slot.number} className={`rounded-2xl border p-3 ${slot.state === "unassigned" ? "border-slate-200 bg-white" : slot.state === "in_use" ? "border-amber-200 bg-amber-50" : "border-teal-100 bg-teal-50"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">POS {slot.number}</p>{slot.state === "unassigned" ? <p className="mt-0.5 text-xs text-slate-500">Unassigned plan slot</p> : <p className="mt-0.5 text-xs text-slate-600">{slot.branch_name} · {slot.state === "in_use" ? "In use" : "Available"}</p>}{slot.state === "in_use" && <p className="mt-1 text-xs font-semibold text-amber-800">Current cashier: {slot.cashier_name || "Not recorded"}{slot.session_number ? ` · ${slot.session_number}` : ""}</p>}</div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${slot.state === "unassigned" ? "bg-slate-100 text-slate-600" : slot.state === "in_use" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{slot.state === "unassigned" ? "Unassigned" : slot.state === "in_use" ? "In use" : "Available"}</span></div></div>)}{!terminalSlots.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Terminal slots are unavailable. Refresh the page and try again.</p>}</div>{unassignedSlots.length > 0 && <form onSubmit={(event) => void placeTerminal(event)} className="mt-6 rounded-2xl border border-slate-200 p-4"><p className="font-bold text-slate-900">Place an unassigned terminal</p><p className="mt-1 text-xs text-slate-500">Choose both the numbered POS terminal and its branch. This is how you allocate, for example, 3 terminals to Pharmacy and 2 to Store.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">POS terminal<FormSelect required value={selectedNumber} onChange={(event) => setSelectedNumber(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select terminal</option>{unassignedSlots.map((slot) => <option key={slot.number} value={slot.number}>POS {slot.number}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Place at branch<FormSelect required value={placementBranchId} onChange={(event) => setPlacementBranchId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{branchOptions}</FormSelect></label></div><button disabled={busy || !subscriptionActive || !selectedNumber || !placementBranchId} className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Placing…" : "Place terminal"}</button></form>}{movableSlots.length > 0 && <form onSubmit={(event) => void moveTerminal(event)} className="mt-4 rounded-2xl border border-slate-200 p-4"><p className="font-bold text-slate-900">Move or unassign an available terminal</p><p className="mt-1 text-xs text-slate-500">Only an available terminal can be moved or removed. Close its cash session first if it is in use.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Available terminal<FormSelect value={managedCashPointId} onChange={(event) => { setManagedCashPointId(event.target.value); setConfirmUnassign(false); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{movableSlots.map((slot) => <option key={slot.cash_point_id} value={slot.cash_point_id || ""}>POS {slot.number} · {slot.branch_name}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Move to branch<FormSelect required value={moveBranchId} onChange={(event) => setMoveBranchId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{branchOptions}</FormSelect></label></div><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy || !moveBranchId} className="rounded-xl border border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-700 disabled:opacity-40">{busy ? "Moving…" : "Move terminal"}</button><button type="button" disabled={busy} onClick={() => void unassignSelectedTerminal()} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 ${confirmUnassign ? "bg-rose-600" : "bg-slate-700"}`}>{confirmUnassign ? `Confirm unassign POS ${managedSlot?.number || ""}` : "Unassign terminal"}</button>{confirmUnassign && <button type="button" onClick={() => setConfirmUnassign(false)} className="text-sm font-bold text-slate-600">Cancel</button>}</div></form>}{error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}<div className="mt-6 flex justify-end"><button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Done</button></div></div></div>;
}
function Field({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
}) {
  return (
    <label className="mt-6 block text-xs font-bold text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        type="number"
        min="0"
        step="0.01"
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
