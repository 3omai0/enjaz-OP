"use client";

import { Archive, ArchiveRestore, Trash2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ProjectStatus } from "@/db/schema";
import { deleteProjectAction, setProjectStatusAction } from "@/lib/actions/projects";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export function DangerZone({ project, canDelete }: { project: { id: string; key: string; status: ProjectStatus }; canDelete: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = project.status === "archived";

  const toggleArchive = () =>
    start(async () => {
      const r = await setProjectStatusAction(project.id, archived ? "active" : "archived");
      if (r?.error) toast(r.error, "error");
      else toast(r?.message ?? t(dict.common.changesSaved));
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const r = await deleteProjectAction(project.id, typed);
      if (r?.error) setError(r.error);
    });

  return (
    <Card className="border-danger/20">
      <CardHeader title={<span className="inline-flex items-center gap-2 text-danger"><TriangleAlert className="h-4 w-4" />{t(dict.project.dangerZone)}</span>} />
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-4">
          <div>
            <p className="text-sm font-bold text-ink">{archived ? t(dict.project.unarchive) : t(dict.project.archive)}</p>
            <p className="mt-1 text-xs font-medium text-ink-soft">{t(dict.project.archiveDesc)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={toggleArchive} loading={pending}>
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {archived ? t(dict.project.unarchive) : t(dict.project.archive)}
          </Button>
        </div>
        {canDelete && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-danger/20 bg-danger/[0.03] p-4">
            <div>
              <p className="text-sm font-bold text-ink">{t(dict.project.deleteProject)}</p>
              <p className="mt-1 text-xs font-medium text-ink-soft">{t(dict.project.deleteDesc)}</p>
            </div>
            <Button variant="dangerSoft" size="sm" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {t(dict.common.delete)}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={remove} loading={pending} title={t(dict.project.deleteProject)} description={t(dict.project.deleteDesc)} confirmLabel={t(dict.common.delete)}>
        <div className="space-y-3">
          <FormError message={error} />
          <label className="label" htmlFor="confirm-key">
            {t(dict.project.deleteTyped)}: <span className="font-grotesk text-brand">{project.key}</span>
          </label>
          <input id="confirm-key" value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" className="field font-grotesk uppercase" autoComplete="off" />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
