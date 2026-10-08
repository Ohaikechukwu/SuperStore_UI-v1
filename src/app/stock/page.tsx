import { redirect } from "next/navigation";

// Stock control merged into the Inventory workspace (2026-09-12 consolidation).
export default function StockPage() {
  redirect("/inventory");
}
