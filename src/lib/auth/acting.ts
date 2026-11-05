import { AsyncLocalStorage } from "node:async_hooks";
import type { SafeUser } from "@/db/schema";

/**
 * The person a request acts for when it does not come from the browser.
 *
 * Requests from Claude (the MCP endpoint) carry an access token instead of
 * the session cookie. Once the token is checked, the tool runs inside
 * runAsUser(), so getCurrentUser() and the language helpers see that person
 * and every existing action applies its usual permissions, notifications and
 * activity log, exactly as when the person clicks in the app.
 */
const store = new AsyncLocalStorage<SafeUser>();

export function runAsUser<T>(user: SafeUser, run: () => Promise<T>): Promise<T> {
  return store.run(user, run);
}

/** The person set by runAsUser for this call, or undefined for an ordinary browser request. */
export const actingUser = (): SafeUser | undefined => store.getStore();
