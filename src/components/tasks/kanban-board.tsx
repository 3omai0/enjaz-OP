"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type Announcements,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Lock, Plus } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskFormDialog, type LabelOption, type MemberOption } from "@/components/tasks/task-form-dialog";
import { useToast } from "@/components/ui/toast";
import type { SafeUser, TaskStatus } from "@/db/schema";
import { moveTaskAction } from "@/lib/actions/tasks";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { fill } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { canCompleteTask, canMoveTask } from "@/lib/permissions";
import type { TaskCard as TaskCardData } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";

type Columns = Record<TaskStatus, TaskCardData[]>;
type Actor = Pick<SafeUser, "id" | "role">;

const COL_PREFIX = "col:";

function group(tasks: TaskCardData[]): Columns {
  const cols: Columns = { backlog: [], todo: [], in_progress: [], in_review: [], done: [] };
  for (const t of tasks) cols[t.status].push(t);
  for (const s of TASK_STATUS_ORDER) cols[s].sort((a, b) => a.position - b.position || a.number - b.number);
  return cols;
}

function findColumn(cols: Columns, id: string): TaskStatus | null {
  if (id.startsWith(COL_PREFIX)) return id.slice(COL_PREFIX.length) as TaskStatus;
  for (const s of TASK_STATUS_ORDER) if (cols[s].some((t) => t.id === id)) return s;
  return null;
}

/**
 * Board with one column per status. All five columns share the width and the
 * board scrolls sideways (with a visible scrollbar) only when the screen is
 * too narrow; each column grows with its cards so there is one page scroll.
 * When the project needs approval, employees cannot drop cards into Done.
 */
export function KanbanBoard({
  tasks,
  projectId,
  projectKey,
  requireApproval,
  openProject = false,
  currentUser,
  members,
  labels,
  statuses = TASK_STATUS_ORDER,
  personal = false,
}: {
  tasks: TaskCardData[];
  projectId: string;
  projectKey: string;
  requireApproval: boolean;
  /** Every member of the project sees every task. */
  openProject?: boolean;
  currentUser: Actor;
  members: MemberOption[];
  labels: LabelOption[];
  /** The columns, in order (personal tasks have no review column). */
  statuses?: TaskStatus[];
  /** A personal space: its add dialog asks no people and offers no review. */
  personal?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const [cols, setCols] = useState<Columns>(() => group(tasks));
  const [source, setSource] = useState(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<TaskStatus | null>(null);
  const suppressClick = useRef(false);
  const canFinish = canCompleteTask(currentUser, { requireApproval });
  // dnd-kit numbers its accessibility ids with a module counter that differs between the
  // server and the browser; React's useId is identical on both, so hydration matches.
  const dndId = useId();

  // Re-sync local state whenever the server sends fresh tasks, but never in the middle
  // of a drag: a live refresh then would scramble the columns. It applies on drop.
  if (tasks !== source && activeId === null) {
    setSource(tasks);
    setCols(group(tasks));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeTask = useMemo(() => (activeId ? Object.values(cols).flat().find((x) => x.id === activeId) ?? null : null), [activeId, cols]);

  // What screen readers hear while a card is moved with the keyboard, in the interface language.
  const accessibility = useMemo(() => {
    const taskName = (id: UniqueIdentifier) => {
      const task = Object.values(cols).flat().find((x) => x.id === id);
      return task ? `${projectKey}-${task.number} ${task.title}` : "";
    };
    const columnName = (id: UniqueIdentifier) => {
      const status = findColumn(cols, String(id));
      return status ? t(TASK_STATUS_META[status].label) : "";
    };
    const announcements: Announcements = {
      onDragStart: ({ active }) => fill(t(dict.board.pickedUp), { task: taskName(active.id) }),
      onDragOver: ({ active, over }) =>
        over ? fill(t(dict.board.over), { task: taskName(active.id), column: columnName(over.id) }) : fill(t(dict.board.outside), { task: taskName(active.id) }),
      onDragEnd: ({ active, over }) =>
        over ? fill(t(dict.board.dropped), { task: taskName(active.id), column: columnName(over.id) }) : fill(t(dict.board.cancelled), { task: taskName(active.id) }),
      onDragCancel: ({ active }) => fill(t(dict.board.cancelled), { task: taskName(active.id) }),
    };
    return { announcements, screenReaderInstructions: { draggable: t(dict.board.dragInstructions) } };
  }, [cols, projectKey, t]);

  const canDrag = (task: TaskCardData) => canMoveTask(currentUser, { assigneeIds: task.assignees.map((a) => a.id), creatorId: task.creatorId }, task.project) && (canFinish || task.status !== "done");

  const onDragStart = (e: DragStartEvent) => {
    suppressClick.current = true;
    setActiveId(String(e.active.id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(cols, String(active.id));
    const to = findColumn(cols, String(over.id));
    if (!from || !to || from === to) return;
    if (to === "done" && !canFinish) return;
    setCols((prev) => {
      const moving = prev[from].find((x) => x.id === active.id);
      if (!moving) return prev;
      const fromList = prev[from].filter((x) => x.id !== active.id);
      const toList = [...prev[to]];
      const overIndex = toList.findIndex((x) => x.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : toList.length;
      toList.splice(insertAt, 0, { ...moving, status: to });
      return { ...prev, [from]: fromList, [to]: toList };
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (!over) {
      setCols(group(source));
      return;
    }
    const id = String(active.id);
    const col = findColumn(cols, id);
    const target = findColumn(cols, String(over.id)) ?? col;
    if (!col || !target) return;
    if (target === "done" && col !== "done" && !canFinish) {
      toast(t(dict.task.completeLocked), "info");
      setCols(group(source));
      return;
    }

    let list = cols[col];
    if (col === target && String(over.id) !== id && !String(over.id).startsWith(COL_PREFIX)) {
      const oldIndex = list.findIndex((x) => x.id === id);
      const newIndex = list.findIndex((x) => x.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) list = arrayMove(list, oldIndex, newIndex);
    }
    const idx = list.findIndex((x) => x.id === id);
    const prevPos = list[idx - 1]?.position;
    const nextPos = list[idx + 1]?.position;
    const position = prevPos != null && nextPos != null ? (prevPos + nextPos) / 2 : prevPos != null ? prevPos + 1 : nextPos != null ? nextPos - 1 : 1;

    const original = source.find((x) => x.id === id);
    const changed = original && (original.status !== target || original.position !== position);
    setCols((prev) => ({ ...prev, [target]: list.map((x) => (x.id === id ? { ...x, status: target, position } : x)) }));
    if (!changed) return;

    const result = await moveTaskAction(id, target, position);
    if (result?.error) {
      toast(result.error, "error");
      setCols(group(source));
    }
  };

  return (
    <>
      <DndContext
        id={dndId}
        accessibility={accessibility}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setCols(group(source));
        }}
      >
        <div
          className="relative -mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0"
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="flex items-start gap-2">
            {statuses.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={cols[status]}
                projectKey={projectKey}
                canDrag={canDrag}
                locked={status === "done" && !canFinish}
                onAdd={status === "done" && !canFinish ? undefined : () => setAddStatus(status)}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>{activeTask ? <TaskCard task={activeTask} projectKey={projectKey} overlay className="w-[240px]" /> : null}</DragOverlay>
      </DndContext>
      <TaskFormDialog
        open={addStatus !== null}
        onClose={() => setAddStatus(null)}
        projectId={projectId}
        requireApproval={requireApproval}
        openProject={openProject}
        members={members}
        labels={labels}
        currentUser={currentUser}
        initial={addStatus ? { status: addStatus } : undefined}
        personal={personal}
      />
    </>
  );
}

function Column({
  status,
  tasks,
  projectKey,
  canDrag,
  locked,
  onAdd,
}: {
  status: TaskStatus;
  tasks: TaskCardData[];
  projectKey: string;
  canDrag: (task: TaskCardData) => boolean;
  locked: boolean;
  onAdd?: () => void;
}) {
  const t = useT();
  const meta = TASK_STATUS_META[status];
  // A locked column still reports drops so the board can explain why the card went back.
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${status}` });

  return (
    <section className={cn("flex min-w-[200px] flex-1 basis-0 flex-col rounded-lg border border-line bg-paper transition-colors", isOver && !locked && "border-brand/50")}>
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
          <h3 className="truncate text-xs font-bold text-ink">{t(meta.label)}</h3>
          <span className="font-grotesk text-xs text-ink-soft" dir="ltr">
            {tasks.length}
          </span>
        </div>
        {locked ? (
          <span className="flex h-6 w-6 items-center justify-center text-ink-soft/70" title={t(dict.task.completeLocked)} aria-label={t(dict.task.completeLocked)}>
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : (
          onAdd && (
            <button type="button" onClick={onAdd} className="flex h-6 w-6 items-center justify-center rounded text-ink-soft transition-colors hover:bg-white hover:text-ink" aria-label={`${t(dict.project.newTask)}: ${t(meta.label)}`}>
              <Plus className="h-4 w-4" />
            </button>
          )
        )}
      </header>
      <div ref={setNodeRef} className="flex min-h-[100px] flex-1 flex-col gap-2 px-2 pb-2">
        <SortableContext items={tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} projectKey={projectKey} disabled={!canDrag(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line text-xs font-medium text-ink-soft/60">{t(dict.common.none)}</div>}
      </div>
    </section>
  );
}

function SortableCard({ task, projectKey, disabled }: { task: TaskCardData; projectKey: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("touch-manipulation", isDragging && "opacity-30", !disabled && "cursor-grab active:cursor-grabbing")}
    >
      <TaskCard task={task} projectKey={projectKey} />
    </div>
  );
}
