import { redirect } from "next/navigation";

// The catalogue moved into the Inventory workspace (Catalogue tab).
export default function ProductsPage() {
  redirect("/inventory?tab=catalogue");
}
