"use client";

import { Tags } from "lucide-react";
import { useState } from "react";
import { LabelsEditor } from "@/components/projects/labels-manager";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

/** Opens the categories of the person's personal space (add, color, remove). */
export function CategoriesButton({ projectId, labels }: { projectId: string; labels: Array<{ id: string; name: string; color: string }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
        <Tags className="h-4 w-4" />
        {t(dict.personal.categories)}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t(dict.personal.categories)} description={t(dict.personal.categoriesDesc)} size="sm">
        <LabelsEditor projectId={projectId} labels={labels} nameLabel={t(dict.personal.categoryName)} />
      </Dialog>
    </>
  );
}
