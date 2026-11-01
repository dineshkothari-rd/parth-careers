import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, safeInternalPath } from "@/lib/site-url";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const siteUrl = getSiteUrl(requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const flowId = requestUrl.searchParams.get("sb_flow_id");
  const authError = requestUrl.searchParams.get("error");
  const next = safeInternalPath(requestUrl.searchParams.get("next"));
  const requestedDestination = next && (next === "/auth/update-password" || !next.startsWith("/auth/")) ? next : "/dashboard";

  if (authError) {
    return NextResponse.redirect(new URL("/auth/login?error=oauth_cancelled", siteUrl));
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId === null ? undefined : { flowId },
      );
      if (error || !data.user) throw error || new Error("Missing authenticated user.");

      if (requestedDestination === "/auth/update-password" || requestedDestination === "/recruiter") {
        return NextResponse.redirect(new URL(requestedDestination, siteUrl));
      }

      const [profileResult, preferencesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name,target_role,current_company,location")
          .eq("id", data.user.id)
          .maybeSingle(),
        supabase
          .from("job_preferences")
          .select("preferred_roles")
          .eq("user_id", data.user.id)
          .maybeSingle(),
      ]);
      const needsProfile = Boolean(
        profileResult.error ||
        preferencesResult.error ||
        !profileResult.data?.full_name ||
        !profileResult.data.target_role ||
        !profileResult.data.current_company ||
        !profileResult.data.location ||
        !preferencesResult.data?.preferred_roles?.length,
      );

      return NextResponse.redirect(new URL(needsProfile ? "/profile" : requestedDestination, siteUrl));
    } catch (error) {
      console.error(
        "OAUTH CALLBACK ERROR:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  return NextResponse.redirect(
    new URL("/auth/login?error=oauth_callback_failed", siteUrl),
  );
}
