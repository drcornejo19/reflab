import { AppShell } from "@/components/AppShell";
import { NotificationSettingsClient } from "@/components/NotificationSettingsClient";

export default function NotificationsPage() {
  return (
    <AppShell>
      <NotificationSettingsClient />
    </AppShell>
  );
}
