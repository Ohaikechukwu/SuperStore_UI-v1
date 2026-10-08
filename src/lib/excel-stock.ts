// Both packages only expose subpath exports; the browser build is the right
// one for this client-side module.
import readXlsxFile, { type Row } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";

export type BulkStockItem = {
  stock_code: string;
  name: string | null;
  quantity: string;
  unit_cost: string;
  selling_price: string | null;
  batch_number: string | null;
  expiry_date: string | null;
};

const HEADER_ALIASES: Record<string, string> = {
  stock_code: "stock_code",
  stockcode: "stock_code",
  sku: "stock_code",
  item_code: "stock_code",
  product_code: "stock_code",
  name: "name",
  product_name: "name",
  item_name: "name",
  product: "name",
  quantity: "quantity",
  qty: "quantity",
  unit_cost: "unit_cost",
  cost: "unit_cost",
  cost_price: "unit_cost",
  unit_price: "unit_cost",
  selling_price: "selling_price",
  sale_price: "selling_price",
  price: "selling_price",
  batch_number: "batch_number",
  batch: "batch_number",
  batch_no: "batch_number",
  expiry_date: "expiry_date",
  expiry: "expiry_date",
  exp_date: "expiry_date",
  expiration_date: "expiry_date",
};

function normalizeHeader(header: unknown) {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+$/, "");
}

function asText(cell: unknown) {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function asIsoDate(cell: unknown): string | null {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const text = asText(cell);
  return text || null;
}

/** Parse an .xlsx stock sheet into bulk-receive items.

 * Every problem is reported (never silently skipped) — an upload that would
 * half-post is worse than one that refuses to start. */
export async function parseStockWorkbook(
  file: File,
): Promise<{ items: BulkStockItem[]; errors: string[] }> {
  let rows: Row[];
  try {
    const sheets = await readXlsxFile(file);
    rows = sheets[0]?.data ?? [];
  } catch {
    return { items: [], errors: ["That file could not be read as an .xlsx spreadsheet."] };
  }
  const populated = rows.filter((row) =>
    row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""),
  );
  if (populated.length < 2) {
    return {
      items: [],
      errors: ["The spreadsheet needs a header row and at least one stock line."],
    };
  }
  const columns = new Map<string, number>();
  populated[0].forEach((header, position) => {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];
    if (canonical && !columns.has(canonical)) columns.set(canonical, position);
  });
  // stock_code becomes optional when a name column can create new products.
  const missing = ["quantity", "unit_cost"].filter((name) => !columns.has(name));
  if (missing.length || (!columns.has("stock_code") && !columns.has("name"))) {
    return {
      items: [],
      errors: [
        `The spreadsheet needs a stock_code (or name) column plus ${missing.length ? "the " + missing.join(", ") + " column(s)." : ""}`.trim() +
          ` Found: ${populated[0].map(asText).filter(Boolean).join(", ")}.`,
      ],
    };
  }
  const cell = (row: Row, name: string) => row[columns.get(name) as number];

  const errors: string[] = [];
  const firstRowByCode = new Map<string, number>();
  const firstRowByName = new Map<string, number>();
  const items: BulkStockItem[] = [];
  populated.slice(1).forEach((row, position) => {
    // +2: one-based sheet rows, plus the header row.
    const excelRow = position + 2;
    const stockCode = asText(cell(row, "stock_code")).toUpperCase();
    const name = columns.has("name") ? asText(cell(row, "name")) || null : null;
    const quantity = Number(cell(row, "quantity"));
    const unitCost = Number(cell(row, "unit_cost"));
    if (!stockCode && !name) {
      errors.push(`Excel row ${excelRow}: needs a stock code or a product name.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Excel row ${excelRow}: quantity must be a positive number.`);
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      errors.push(`Excel row ${excelRow}: unit cost must be a number, zero or more.`);
      return;
    }
    let sellingPrice: string | null = null;
    if (columns.has("selling_price")) {
      const parsed = Number(cell(row, "selling_price"));
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push(`Excel row ${excelRow}: selling price must be a number, zero or more.`);
        return;
      }
      sellingPrice = String(parsed);
    }
    const batchNumber = asText(cell(row, "batch_number")) || null;
    const expiryText = asText(cell(row, "expiry_date"));
    if (expiryText) {
      const expiry = asIsoDate(cell(row, "expiry_date"));
      if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        errors.push(`Excel row ${excelRow}: expiry date "${expiryText}" is not a date.`);
        return;
      }
      // A batch number is no longer required with an expiry: the server
      // assigns one when the sheet leaves it blank.
    }
    if (stockCode) {
      const earlier = firstRowByCode.get(stockCode);
      if (earlier) {
        errors.push(
          `Excel row ${excelRow}: stock code ${stockCode} appears more than once (first on row ${earlier}).`,
        );
        return;
      }
      firstRowByCode.set(stockCode, excelRow);
    } else {
      const nameKey = (name as string).trim().toLowerCase();
      const earlier = firstRowByName.get(nameKey);
      if (earlier) {
        errors.push(
          `Excel row ${excelRow}: product name appears more than once (first on row ${earlier}).`,
        );
        return;
      }
      firstRowByName.set(nameKey, excelRow);
    }
    items.push({
      stock_code: stockCode,
      name,
      quantity: String(quantity),
      unit_cost: String(unitCost),
      selling_price: sellingPrice,
      batch_number: batchNumber,
      expiry_date: expiryText ? (asIsoDate(cell(row, "expiry_date")) as string) : null,
    });
  });
  if (errors.length) return { items: [], errors };
  return { items, errors: [] };
}

/** Download an .xlsx template matching the parser and the upsert API.
 * Batch numbers are system-assigned, so the template omits the column. */
export async function downloadStockTemplateXlsx() {
  await writeXlsxFile([
    ["stock_code", "name", "quantity", "unit_cost", "selling_price", "expiry_date"],
    ["PARA999", "Paracetamol 500mg", 100, 900, 1400, "2028-12-31"],
    ["", "New product without a code", 50, 500, 900, ""],
  ]).toFile("opening-stock-template.xlsx");
}
