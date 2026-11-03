import { AppShell } from "@/components/layout/app-shell";
import { PushProvider } from "@/components/push/push-provider";
import { requireUser } from "@/lib/auth/session";
import { getMyTasksScope } from "@/lib/my-tasks/server";
import { pushPublicKey } from "@/lib/push";
import { getShellState } from "@/lib/queries/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [shell, scope] = await Promise.all([getShellState(user.id), getMyTasksScope()]);
  // The My tasks count matches what that page shows in the scope picked on this device.
  const myOpen = scope === "mine" ? shell.myOpen : scope === "general" ? shell.generalOpen : shell.myOpen + shell.generalOpen;
  return (
    <PushProvider publicKey={pushPublicKey()} sessionVersion={user.sessionVersion} unread={shell.unread}>
      <AppShell user={user} unread={shell.unread} myOpen={myOpen} personalOpen={shell.personalOpen} version={shell.version}>
        {children}
      </AppShell>
    </PushProvider>
  );
}
