import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await requireAuth();

  return (
    <MainLayout username={session.user.name}>
      <SettingsClient />
    </MainLayout>
  );
}
