import { cookies } from "next/headers";
import { isMyTasksScope, MY_TASKS_SCOPE_COOKIE, type MyTasksScope } from "./index";

/** The My tasks scope picked on this device: everything that is yours or general until another is chosen. */
export async function getMyTasksScope(): Promise<MyTasksScope> {
  const store = await cookies();
  const value = store.get(MY_TASKS_SCOPE_COOKIE)?.value;
  return isMyTasksScope(value) ? value : "all";
}
