import { PageSkeleton } from "@/components/layout/page-skeleton";

/** Shown while switching between the sections of a project; the project sidebar stays in place. */
export default function Loading() {
  return <PageSkeleton withStats={false} />;
}
