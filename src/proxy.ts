import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MAX_BODY_CHARS = 50_000;

/**
 * `request.geo` is not available on the Node.js proxy (`proxy.ts`) in current Next.js
 * builds — geo was an Edge/Vercel concern and the Node adapter does not attach it.
 * On Vercel, the platform still sends IP/location as request headers; we surface those.
 * Locally you will usually see `null` unless you mock these headers yourself.
 */
function geoFromHeaders(
  request: NextRequest,
): Record<string, string | undefined> | null {
  const h = request.headers;
  const country = h.get("x-vercel-ip-country") ?? undefined;
  const region = h.get("x-vercel-ip-country-region") ?? undefined;
  const city = h.get("x-vercel-ip-city") ?? undefined;
  const latitude = h.get("x-vercel-ip-latitude") ?? undefined;
  const longitude = h.get("x-vercel-ip-longitude") ?? undefined;
  const timezone = h.get("x-vercel-ip-timezone") ?? undefined;

  if (!country && !city && !latitude && !longitude && !region && !timezone) {
    return null;
  }

  return { country, region, city, latitude, longitude, timezone };
}

/** All request headers as a plain object (duplicate names become `string[]`). */
function headersObject(
  request: NextRequest,
): Record<string, string | string[]> {
  const merged = new Map<string, { displayKey: string; values: string[] }>();

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    const slot = merged.get(lower) ?? { displayKey: key, values: [] };
    slot.values.push(value);
    merged.set(lower, slot);
  });

  const out: Record<string, string | string[]> = {};
  for (const { displayKey, values } of merged.values()) {
    out[displayKey] = values.length === 1 ? values[0]! : values;
  }

  return out;
}

/** Read body from a clone so the real request stream is still usable downstream. */
async function bodySnapshot(request: NextRequest): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }

  try {
    const clone = request.clone();
    const ct = request.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const fd = await clone.formData();
      const fields: Record<string, unknown> = {};
      for (const [key, value] of fd.entries()) {
        if (value instanceof File) {
          fields[key] = {
            _kind: "File",
            name: value.name,
            type: value.type,
            size: value.size,
          };
        } else {
          fields[key] = value;
        }
      }
      return fields;
    }

    const raw = await clone.text();
    if (!raw) return null;

    if (ct.includes("application/json")) {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return { _invalidJson: true, raw: truncate(raw) };
      }
    }

    if (ct.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(raw));
    }

    return truncate(raw);
  } catch (err) {
    return { _bodyReadError: String(err) };
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  return `${text.slice(0, MAX_BODY_CHARS)}… [truncated, ${text.length} chars total]`;
}

export async function proxy(request: NextRequest) {
  const headers = headersObject(request);
  const body = await bodySnapshot(request);
  const geo = geoFromHeaders(request);

  console.log("[proxy]", JSON.stringify({ geo, headers, body }, null, 2));

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Skip static assets and prefetch payloads so logs stay readable in dev.
     * Remove or adjust `matcher` if you need those logged too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
