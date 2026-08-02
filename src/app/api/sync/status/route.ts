import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSyncJobs } from "@/lib/integrations/sync-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Poll background sync job progress (survives leaving Settings). */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ jobs: listSyncJobs() });
}
