"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { LabelChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { createLabelAction, deleteLabelAction } from "@/lib/actions/projects";
import { LABEL_COLORS } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

type LabelItem = { id: string; name: string; color: string };

/**
 * Add and remove labels with a color: a team project's labels, or the
 * categories of a personal space (`nameLabel` names the field).
 */
export function LabelsEditor({ projectId, labels, nameLabel }: { projectId: string; labels: LabelItem[]; nameLabel?: string }) {
  const t = useT();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [pending, start] = useTransition();
  const fieldName = nameLabel ?? t(dict.project.labelName);

  const add = () =>
    start(async () => {
      const r = await createLabelAction(projectId, name, color);
      if (r?.error) toast(r.error, "error");
      else setName("");
    });

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteLabelAction(id);
      if (r?.error) toast(r.error, "error");
    });

  return (
    <>
      {labels.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-2">
          {labels.map((l) => (
            <li key={l.id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white p-1 ps-1.5">
              <LabelChip name={l.name} color={l.color} />
              <button type="button" onClick={() => remove(l.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-ink-soft hover:bg-danger/10 hover:text-danger" aria-label={`${t(dict.common.delete)}: ${l.name}`} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add();
        }}
        className="space-y-3"
      >
        <div className="flex gap-2">
          <input name="labelName" value={name} onChange={(e) => setName(e.target.value)} placeholder={fieldName} maxLength={30} className="field h-9 min-h-0 flex-1 py-0" aria-label={fieldName} />
          <Button type="submit" size="sm" loading={pending} disabled={!name.trim()} className="h-10">
            <Plus className="h-4 w-4" />
            {t(dict.common.add)}
          </Button>
        </div>
        <ColorPicker colors={LABEL_COLORS} value={color} onChange={setColor} />
      </form>
    </>
  );
}

export function LabelsManager({ projectId, labels }: { projectId: string; labels: LabelItem[] }) {
  const t = useT();
  return (
    <Card>
      <CardHeader title={t(dict.project.labelsTitle)} description={t(dict.project.labelsDesc)} />
      <LabelsEditor projectId={projectId} labels={labels} />
    </Card>
  );
}
