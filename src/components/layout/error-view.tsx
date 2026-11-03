"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

/** Friendly page shown when something fails to load, with a retry that re-fetches the page. */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[55vh] items-center justify-center p-6">
      <EmptyState
        icon={TriangleAlert}
        title={t(dict.errors.title)}
        description={
          <>
            {t(dict.errors.desc)}
            {error.digest && (
              <span className="mt-2 block font-grotesk text-[11px] text-ink-soft/60" dir="ltr">
                {error.digest}
              </span>
            )}
          </>
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              {t(dict.errors.retry)}
            </Button>
            <ButtonLink href="/dashboard" variant="secondary">
              {t(dict.errors.home)}
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
