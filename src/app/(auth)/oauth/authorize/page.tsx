import { Check, Link2, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { fill } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { AUTHORIZE_FIELDS, validateAuthorizeRequest, withParams, type AuthorizeParams } from "@/lib/mcp/authorize";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.mcp.cardTitle), robots: { index: false } };
}

type Search = Record<string, string | string[] | undefined>;

/**
 * Consent page of the OAuth flow: Claude (or another MCP app) sends the
 * person here to approve access to their account. The proxy sends anyone
 * signed out to the login page first and back here afterwards.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const params: AuthorizeParams = {};
  for (const key of AUTHORIZE_FIELDS) {
    const value = sp[key];
    if (typeof value === "string") params[key] = value;
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params as Record<string, string>)}`)}`);

  const { t } = await getT();
  const checked = await validateAuthorizeRequest(params);

  if ("redirect" in checked) {
    const { redirectUri, state, error, description } = checked.redirect;
    redirect(withParams(redirectUri, { error, error_description: description, state }));
  }

  if ("fatal" in checked) {
    return (
      <div>
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{t(dict.mcp.invalidTitle)}</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">{t(checked.fatal === "unknown_client" ? dict.mcp.invalidClient : dict.mcp.invalidRedirect)}</p>
      </div>
    );
  }

  const { ok } = checked;
  const returnHost = new URL(ok.redirectUri).host;

  return (
    <div>
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Link2 className="h-5 w-5" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-ink">{fill(t(dict.mcp.consentTitle), { app: ok.client.name })}</h1>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-soft">{t(dict.mcp.consentSubtitle)}</p>

      <div className="mt-6 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
        <span className="font-medium text-ink-soft">{t(dict.mcp.signedInAs)} </span>
        <span className="font-bold text-ink">{user.name}</span>
        <span className="block font-grotesk text-xs font-medium text-ink-soft" dir="ltr">
          {user.email}
        </span>
      </div>

      <p className="mt-6 text-sm font-bold text-ink">{t(dict.mcp.canDo)}</p>
      <ul className="mt-3 space-y-2.5">
        {t(dict.mcp.abilities).map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-ink">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs font-medium text-ink-soft">
        {t(dict.mcp.returnsTo)}{" "}
        <span className="font-grotesk font-bold text-ink" dir="ltr">
          {returnHost}
        </span>
      </p>

      <form method="post" action="/api/oauth/authorize" className="mt-5 grid grid-cols-2 gap-3">
        {AUTHORIZE_FIELDS.map((key) => (params[key] !== undefined ? <input key={key} type="hidden" name={key} value={params[key]} /> : null))}
        <button type="submit" name="decision" value="deny" className={buttonClasses("secondary", "lg", "w-full")}>
          {t(dict.mcp.deny)}
        </button>
        <button type="submit" name="decision" value="allow" className={buttonClasses("primary", "lg", "w-full")}>
          {t(dict.mcp.allow)}
        </button>
      </form>
      <p className="mt-4 text-center text-xs font-medium text-ink-soft">{t(dict.mcp.revokeHint)}</p>
    </div>
  );
}

export const dynamic = "force-dynamic";
