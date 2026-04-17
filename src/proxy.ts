import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  console.log(`[proxy] ${request}`);
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
