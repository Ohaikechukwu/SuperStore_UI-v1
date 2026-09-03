import { apiFetch } from "@/auth";
import { API_BASE } from "@/lib/config";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function messageFrom(response: Response) {
  try {
    const body = await response.json() as {
      detail?: unknown;
      message?: string;
      error?: { message?: string };
    };
    return (typeof body.detail === "string" ? body.detail : undefined)
      || body.message
      || body.error?.message
      || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function jsonFrom<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      response.status,
      "The API returned HTML instead of JSON. Check the /edge-api proxy and the deployed frontend version.",
    );
  }
  return response.json() as Promise<T>;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(API_BASE, path, init);
  if (!response.ok) throw new ApiError(response.status, await messageFrom(response));
  if (response.status === 204) return undefined as T;
  return jsonFrom<T>(response);
}

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
}

/** Browser links cannot attach the in-memory Bearer token used by the API. */
export async function downloadApiFile(path: string, fallbackFilename: string) {
  const response = await apiFetch(API_BASE, path);
  if (!response.ok) throw new ApiError(response.status, await messageFrom(response));
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown) => apiRequest<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  delete: <T>(path: string, body?: unknown) => apiRequest<T>(path, {
    method: "DELETE",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
};
