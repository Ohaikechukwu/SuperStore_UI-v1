export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatMoney(value: string | number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

export function formatQuantity(value: string | number | null | undefined) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return String(value ?? "");
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 }).format(quantity);
}
