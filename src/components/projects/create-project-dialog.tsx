"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ColorPicker, Field, FormError, MoreOptions, SubmitButton } from "@/components/ui/form";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { createProjectAction } from "@/lib/actions/projects";
import type { ActionState } from "@/lib/actions/types";
import { PROJECT_COLORS, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import type { PersonOption } from "@/lib/queries/projects";
import { suggestProjectKey } from "@/lib/utils";

/**
 * A name is all that is required. Who can see the project is picked right
 * away; key, dates, color and status live under "More options".
 */
export function CreateProjectDialog({ people, currentUserId, variant = "primary" }: { people: PersonOption[]; currentUserId: string; variant?: "primary" | "secondary" }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await createProjectAction(prev, fd);
    if (result?.ok && result.id) {
      toast(result.message ?? t(dict.projects.created));
      setOpen(false);
      setName("");
      setMemberIds([]);
      router.push(`/projects/${result.id}`);
    }
    return result;
  }, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t(dict.projects.newProject)}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t(dict.projects.createTitle)} description={t(dict.projects.createDesc)} size="md">
        <form action={action} className="space-y-4">
          <FormError message={state?.error} />
          <Field label={t(dict.projects.name)} htmlFor="p-name" error={errors.name}>
            <input id="p-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder={t(dict.projects.namePlaceholder)} className="field" />
          </Field>
          <Field label={t(dict.projects.description)} htmlFor="p-desc" optional>
            <textarea id="p-desc" name="description" rows={2} dir="auto" maxLength={2000} placeholder={t(dict.projects.descriptionPlaceholder)} className="field min-h-0 resize-y" />
          </Field>
          <Field label={t(dict.projects.whoSees)} hint={t(dict.projects.whoSeesHint)} error={errors.memberIds}>
            <PeoplePicker
              people={people.filter((p) => p.id !== currentUserId)}
              value={memberIds}
              onChange={setMemberIds}
              name="memberIds"
              emptyLabel={t(dict.projects.onlyYou)}
              allOption={{ kind: "every", label: t(dict.projects.everyone) }}
            />
          </Field>

          <MoreOptions forceOpen={!!(errors.key || errors.startDate || errors.dueDate)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(dict.projects.key)} htmlFor="p-key" error={errors.key} hint={t(dict.projects.keyHint)} optional>
                <input id="p-key" name="key" dir="ltr" maxLength={6} placeholder={suggestProjectKey(name || "PRJ")} className="field font-grotesk uppercase" />
              </Field>
              <Field label={t(dict.projects.status)} htmlFor="p-status">
                <select id="p-status" name="status" defaultValue="active" className="field">
                  {PROJECT_STATUS_ORDER.filter((s) => s !== "archived").map((s) => (
                    <option key={s} value={s}>
                      {t(PROJECT_STATUS_META[s].label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(dict.projects.startDate)} htmlFor="p-start" error={errors.startDate} optional>
                <input id="p-start" name="startDate" type="date" min="2000-01-01" max="2100-12-31" className="field" />
              </Field>
              <Field label={t(dict.projects.dueDate)} htmlFor="p-due" error={errors.dueDate} optional>
                <input id="p-due" name="dueDate" type="date" min="2000-01-01" max="2100-12-31" className="field" />
              </Field>
            </div>
            <Field label={t(dict.projects.color)}>
              <ColorPicker name="color" colors={PROJECT_COLORS} value={color} onChange={setColor} />
            </Field>
          </MoreOptions>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t(dict.common.cancel)}
            </Button>
            <SubmitButton pendingText={t(dict.common.saving)}>{t(dict.projects.createTitle)}</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
