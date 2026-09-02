export type SearchableProduct = {
  name: string;
  manufacturer?: string | null;
  stock_code: string;
  barcode?: string | null;
};

function searchTokens(value: string): string[] {
  return value.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Match the start of meaningful name, stock-code, or barcode segments.
 *
 * This keeps product lookup precise ("p" does not match the middle of
 * "Amlodipine") while remaining practical for counter use: terms can be
 * partial and supplied in any order (for example, "teva amlo" or "500 para").
 */
export function matchesProductSearch(product: SearchableProduct, query: string) {
  const terms = searchTokens(query);
  if (!terms.length) return true;
  const productTokens = [product.name, product.manufacturer, product.stock_code, product.barcode]
    .filter((value): value is string => Boolean(value))
    .flatMap(searchTokens);
  return terms.every((term) => productTokens.some((token) => token.startsWith(term)));
}

/** A scanner sends a complete code, so favour an exact stock-code/barcode match. */
export function hasExactProductCode(product: SearchableProduct, code: string) {
  const scanned = code.trim().toLocaleLowerCase();
  return Boolean(scanned) && [product.stock_code, product.barcode]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase() === scanned);
}
