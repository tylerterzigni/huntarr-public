import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLanguages } from "@/lib/integrations/tmdb/client";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const languages = await getLanguages();
    return NextResponse.json({ languages });
  } catch {
    return NextResponse.json({ languages: [] });
  }
}
