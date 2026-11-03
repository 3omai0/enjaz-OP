"use client";

import { ErrorView } from "@/components/layout/error-view";

/** Errors inside the app keep the sidebar and top bar, so the user can simply go elsewhere. */
export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorView error={error} retry={unstable_retry} />;
}
