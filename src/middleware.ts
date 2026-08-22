import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protects /admin/** — the owner's approval console. Everything else
// (the public console, tool pages) stays open; auth is layered in only
// where it actually matters.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Everything under /admin and /tools is owner-only for now — there's no
  // public-facing flow yet (Apply.ai, the candidate side, is deferred).
  const isAdminRoute =
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/tools") ||
    request.nextUrl.pathname.startsWith("/org") ||
    request.nextUrl.pathname.startsWith("/chat");
  const isLoginRoute = request.nextUrl.pathname === "/login";

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    // Previously this always sent signed-in visitors to /admin, which
    // meant any non-owner who landed on /login (e.g. via the "Forgot
    // password?" round trip, or just re-visiting the URL) got redirected
    // into the owner's approval console. Send them home instead --
    // /login's own submit handler is what knows to route the actual
    // platform owner to /admin.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/tools/:path*", "/org/:path*", "/chat/:path*", "/login"],
};
