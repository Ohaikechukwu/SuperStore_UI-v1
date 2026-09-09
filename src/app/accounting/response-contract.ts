import { ApiError } from "@/lib/api";

// TypeScript API generics do not validate JSON from older or mismatched servers.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAmount(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+(\.\d{1,2})?$/.test(value);
}

export function accountingCompatibilityMessage(feature: string) {
  return (
    feature +
    " are unavailable because the backend response is missing required accounting data. Deploy the matching accounting API and verify the /edge-api upstream, then refresh. No figures have been substituted."
  );
}

export function accountingRequestError(
  error: unknown,
  feature: string,
): unknown {
  if (error instanceof ApiError && error.status === 404) {
    return new Error(
      feature +
        " are unavailable on this backend (404). Deploy the matching accounting API and verify the /edge-api upstream, then refresh.",
    );
  }
  return error;
}
