"use client";

import "./globals.css";

/**
 * Last-resort page when even the root layout fails. It replaces the whole
 * document, so it cannot know the language and shows both.
 */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
        <title>إنجاز | Injaz</title>
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 text-center">
          <h1 className="text-lg font-bold">حدث خطأ غير متوقع</h1>
          <p className="mt-1 text-sm text-ink-soft">حاول مرة أخرى، وإذا تكرر الخطأ تواصل مع مدير النظام.</p>
          <p className="mt-4 text-lg font-bold" dir="ltr">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-ink-soft" dir="ltr">
            Please try again. If it keeps happening, contact your administrator.
          </p>
          {error.digest && (
            <p className="mt-3 text-[11px] text-ink-soft/60" dir="ltr">
              {error.digest}
            </p>
          )}
          <button type="button" onClick={() => unstable_retry()} className="mt-5 inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep">
            إعادة المحاولة · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
