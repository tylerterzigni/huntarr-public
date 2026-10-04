import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default async function RemindersPage() {
  const session = await requireAuth();

  return (
    <MainLayout username={session.user.name}>
      <RemindersClient />
    </MainLayout>
  );
}
