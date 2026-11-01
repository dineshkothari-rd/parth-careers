import { safeInternalPath } from "@/lib/site-url";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LEGACY_CAREERS_HOSTS = new Set([
  "jobpilot-murex.vercel.app",
  "jobpilot-dineshkothari-rds-projects.vercel.app",
  "jobpilot-git-main-dineshkothari-rds-projects.vercel.app",
]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // Local, illustrative design review; never expose preview content in production.
  if (pathname === "/design-preview") {
    return process.env.NODE_ENV === "development"
      ? response
      : new NextResponse(null, { status: 404 });
  }

  // Route handlers return their own predictable JSON authentication errors.
  if (pathname.startsWith("/api/") || pathname === "/reminder-sw.js")
    return response;

  if (LEGACY_CAREERS_HOSTS.has(request.nextUrl.hostname) &&
      (request.method === "GET" || request.method === "HEAD")) {
    const target = new URL("https://parth-careers.vercel.app");
    target.pathname = pathname;
    target.search = request.nextUrl.search;
    // An empty fragment stops browsers carrying old auth tokens across hosts.
    target.hash = "#";
    if (pathname.startsWith("/auth/") || request.nextUrl.searchParams.has("code")) {
      // Auth cookies cannot cross hosts; restart instead of forwarding old codes.
      const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
      target.pathname = "/auth/login";
      target.search = "";
      if (next && !next.startsWith("/auth/")) target.searchParams.set("next", next);
    }
    return NextResponse.redirect(target, 307);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthCallback = pathname === "/auth/callback";
  const isPublicPage =
    pathname === "/" ||
    pathname === "/help" ||
    pathname === "/plans" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/opportunities" ||
    /^\/opportunities\/[0-9a-f-]{36}$/i.test(pathname) ||
    /^\/employers\/[0-9a-f-]{36}$/i.test(pathname) ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/auth/login" ||
    pathname === "/auth/update-password" ||
    isAuthCallback ||
    /^\/verify\/learning\/[0-9a-f-]{36}$/i.test(pathname);

  if (!user && !isPublicPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/auth/login") {
    const nextPath = safeInternalPath(request.nextUrl.searchParams.get("next"));
    const dashboardUrl = request.nextUrl.clone();
    const target =
      nextPath && !nextPath.startsWith("/auth/")
        ? new URL(nextPath, request.nextUrl.origin)
        : new URL("/dashboard", request.nextUrl.origin);
    dashboardUrl.pathname = target.pathname;
    dashboardUrl.search = target.search;
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
