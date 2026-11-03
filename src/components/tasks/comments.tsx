"use client";

import { MessageSquare, Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { TimeAgo } from "@/components/ui/time-ago";
import { useToast } from "@/components/ui/toast";
import type { SafeUser } from "@/db/schema";
import { addCommentAction, deleteCommentAction } from "@/lib/actions/tasks";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

/** `author` is null once the person who wrote it has been deleted; the comment stays. */
type CommentItem = { id: string; body: string; createdAt: Date; author: { id: string; name: string } | null };

/** The discussion on a task; on a personal task it reads as the owner's own notes. */
export function Comments({ taskId, comments, currentUser, personal = false }: { taskId: string; comments: CommentItem[]; currentUser: Pick<SafeUser, "id" | "role">; personal?: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const post = () => {
    if (pending) return;
    const text = body;
    start(async () => {
      const r = await addCommentAction(taskId, text);
      if (r?.error) toast(r.error, "error");
      else setBody("");
    });
  };

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteCommentAction(id);
      if (r?.error) toast(r.error, "error");
    });

  return (
    <Card>
      <CardHeader title={t(personal ? dict.personal.notes : dict.task.comments)} action={<span className="font-grotesk text-xs font-bold text-ink-soft" dir="ltr">{comments.length}</span>} />
      {comments.length === 0 ? (
        <p className="mb-5 flex items-center gap-2 text-sm font-medium text-ink-soft">
          <MessageSquare className="h-4 w-4" />
          {t(personal ? dict.personal.noNotes : dict.task.noComments)}
        </p>
      ) : (
        <ul className="mb-5 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-3">
              <Avatar id={c.author?.id} name={c.author?.name ?? "?"} size="sm" />
              <div className="min-w-0 flex-1 rounded-lg rounded-ss-md bg-paper px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={c.author ? "text-sm font-bold text-ink" : "text-sm font-bold text-ink-soft"}>{c.author?.name ?? t(dict.team.formerMember)}</p>
                  <div className="flex items-center gap-2">
                    <TimeAgo date={c.createdAt} className="text-[11px] font-bold text-ink-soft/70" />
                    {(c.author?.id === currentUser.id || currentUser.role === "admin") && (
                      <button type="button" onClick={() => remove(c.id)} className="text-ink-soft opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" aria-label={t(dict.common.delete)} disabled={pending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p dir="auto" className="prose-plain mt-1 text-start text-sm font-medium text-ink">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post();
        }}
        className="space-y-2"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim() && !pending) post();
          }}
          rows={3}
          dir="auto"
          maxLength={5000}
          placeholder={t(personal ? dict.personal.notesPlaceholder : dict.task.commentPlaceholder)}
          className="field resize-y"
          aria-label={t(personal ? dict.personal.notes : dict.task.comments)}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending} disabled={!body.trim()}>
            <Send className="h-4 w-4 rtl:-scale-x-100" />
            {t(personal ? dict.personal.addNote : dict.task.postComment)}
          </Button>
        </div>
      </form>
    </Card>
  );
}
