import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIntegrationInstances } from "@/lib/settings/integrations";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as "radarr" | "sonarr" | null;

  if (!type || (type !== "radarr" && type !== "sonarr")) {
    return NextResponse.json({ error: "type required (radarr|sonarr)" }, { status: 400 });
  }

  const instances = await getIntegrationInstances(type);
  return NextResponse.json({
    instances: instances.map((i) => ({ id: i.id, name: i.name, type: i.type })),
  });
}
