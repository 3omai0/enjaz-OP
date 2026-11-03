"use client";

import { ErrorView } from "@/components/layout/error-view";

export default function RootError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorView error={error} retry={unstable_retry} />;
}
