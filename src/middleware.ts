import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const ROLE_REDIRECTS: Record<string, string> = {
  seller: "/sell",
  buyer: "/buy",
  agent: "/agent",
  org_admin: "/org",
  platform_admin: "/admin",
};

const PROTECTED_PREFIXES = ["/sell", "/buy", "/agent", "/org", "/admin"];
const AUTH_PATHS = ["/sign-in", "/sign-up", "/verify"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: request.headers } });
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

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtected) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signIn);
  }

  // Redirect authenticated users away from auth pages to their dashboard
  if (user && isAuthPage) {
    const userType = (user.user_metadata["user_type"] as string | undefined) ?? "seller";
    const dest = ROLE_REDIRECTS[userType] ?? "/sell";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Role-based route protection
  if (user && isProtected) {
    const userType = (user.user_metadata["user_type"] as string | undefined) ?? "";
    const allowedPrefix = ROLE_REDIRECTS[userType];

    if (allowedPrefix && !pathname.startsWith(allowedPrefix) && pathname !== "/") {
      return NextResponse.redirect(new URL(allowedPrefix, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
