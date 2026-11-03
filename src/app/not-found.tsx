import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState icon={FileQuestion} title={t(dict.errors.notFoundTitle)} description={t(dict.errors.notFoundDesc)} action={<ButtonLink href="/dashboard">{t(dict.errors.home)}</ButtonLink>} />
    </div>
  );
}
