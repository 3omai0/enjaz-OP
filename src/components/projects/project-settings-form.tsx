"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { ColorPicker, Field, FormError, SubmitButton } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { Project } from "@/db/schema";
import { updateProjectAction } from "@/lib/actions/projects";
import type { ActionState } from "@/lib/actions/types";
import { PROJECT_COLORS, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/** Owner candidates. The page always includes the current owner, even when deactivated, so saving never changes the owner by accident. */
type OwnerOption = { id: string; name: string; isActive: boolean };

/** Two side-by-side choices, the selected one highlighted. */
function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn("rounded-lg border px-4 py-3 text-start text-sm font-bold transition-colors", value === o.value ? "border-brand bg-brand/6 text-brand" : "border-line bg-white text-ink-soft hover:border-brand/40")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProjectSettingsForm({ project, owners, canTransfer }: { project: Project; owners: OwnerOption[]; canTransfer: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [color, setColor] = useState(project.color);
  const [visibility, setVisibility] = useState(project.taskVisibility === "all" ? "all" : "assigned");
  const [approval, setApproval] = useState(project.requireApproval ? "true" : "false");

  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await updateProjectAction(prev, fd);
    if (r?.ok) toast(r.message ?? t(dict.common.changesSaved));
    return r;
  }, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      <CardHeader title={t(dict.project.settingsTitle)} description={t(dict.project.settingsDesc)} />
      <form action={action} className="space-y-5">
        <input type="hidden" name="projectId" value={project.id} />
        <input type="hidden" name="taskVisibility" value={visibility} />
        <input type="hidden" name="requireApproval" value={approval} />
        <FormError message={state?.error} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_160px]">
          <Field label={t(dict.projects.name)} htmlFor="s-name" error={errors.name}>
            <input id="s-name" name="name" defaultValue={project.name} required maxLength={120} className="field" />
          </Field>
          <Field label={t(dict.projects.key)} htmlFor="s-key" error={errors.key} hint={t(dict.projects.keyHint)}>
            <input id="s-key" name="key" defaultValue={project.key} dir="ltr" maxLength={6} required className="field font-grotesk uppercase" />
          </Field>
        </div>
        <Field label={t(dict.projects.description)} htmlFor="s-desc" optional>
          <textarea id="s-desc" name="description" rows={4} dir="auto" maxLength={2000} defaultValue={project.description ?? ""} className="field resize-y" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t(dict.projects.status)} htmlFor="s-status">
            <select id="s-status" name="status" defaultValue={project.status} className="field">
              {PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {t(PROJECT_STATUS_META[s].label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(dict.projects.owner)} htmlFor="s-owner" error={errors.ownerId} hint={canTransfer ? undefined : t(dict.projects.ownerLocked)}>
            <select id="s-owner" name={canTransfer ? "ownerId" : undefined} defaultValue={project.ownerId} disabled={!canTransfer} className="field">
              {owners.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.isActive && m.id !== project.ownerId}>
                  {m.name}
                  {!m.isActive ? ` (${t(dict.projects.ownerInactive)})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(dict.projects.startDate)} htmlFor="s-start" error={errors.startDate} optional>
            <input id="s-start" name="startDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={project.startDate ?? ""} className="field" />
          </Field>
          <Field label={t(dict.projects.dueDate)} htmlFor="s-due" error={errors.dueDate} optional>
            <input id="s-due" name="dueDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={project.dueDate ?? ""} className="field" />
          </Field>
        </div>
        <Field label={t(dict.projects.color)}>
          <ColorPicker name="color" colors={PROJECT_COLORS} value={color} onChange={setColor} />
        </Field>

        <Field label={t(dict.project.visibility)} hint={t(dict.project.visibilityHint)}>
          <Choice
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "assigned", label: t(dict.project.visibilityAssigned) },
              { value: "all", label: t(dict.project.visibilityAll) },
            ]}
          />
        </Field>

        <Field label={t(dict.project.approval)} hint={t(dict.project.approvalHint)}>
          <Choice
            value={approval}
            onChange={setApproval}
            options={[
              { value: "true", label: t(dict.project.approvalRequired) },
              { value: "false", label: t(dict.project.approvalOpen) },
            ]}
          />
        </Field>

        <div className="flex justify-end pt-2">
          <SubmitButton pendingText={t(dict.common.saving)}>{t(dict.common.save)}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
