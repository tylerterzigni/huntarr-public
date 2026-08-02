import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDecryptedArrInstance,
  getDecryptedPlexInstance,
  getDecryptedTautulliInstance,
} from "@/lib/settings/integrations";
import { testRadarrConnection } from "@/lib/integrations/radarr/client";
import { testSonarrConnection } from "@/lib/integrations/sonarr/client";
import { testPlexConnection } from "@/lib/integrations/plex/client";
import { testTautulliConnection } from "@/lib/integrations/tautulli/client";
import { getTmdbApiKey } from "@/lib/settings/global";
import { getPopularMovies } from "@/lib/integrations/tmdb/client";
import { testOmdbConnection } from "@/lib/integrations/omdb/client";
import { getAIProviderById, testAIConnection } from "@/lib/ai/provider";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { service } = await params;

  try {
    switch (service) {
      case "tmdb": {
        const key = await getTmdbApiKey();
        if (!key) throw new Error("TMDB API key not configured");
        await getPopularMovies(1);
        return NextResponse.json({ success: true, message: "TMDB connection OK" });
      }
      case "omdb": {
        await testOmdbConnection();
        return NextResponse.json({ success: true, message: "OMDb connection OK" });
      }
      case "radarr": {
        const { searchParams } = new URL(_request.url);
        const id = searchParams.get("id");
        if (!id) throw new Error("Instance ID required");
        const instance = await getDecryptedArrInstance(id);
        if (!instance) throw new Error("Instance not found");
        await testRadarrConnection(instance);
        return NextResponse.json({ success: true, message: "Radarr connection OK" });
      }
      case "sonarr": {
        const { searchParams } = new URL(_request.url);
        const id = searchParams.get("id");
        if (!id) throw new Error("Instance ID required");
        const instance = await getDecryptedArrInstance(id);
        if (!instance) throw new Error("Instance not found");
        await testSonarrConnection(instance);
        return NextResponse.json({ success: true, message: "Sonarr connection OK" });
      }
      case "plex": {
        const instance = await getDecryptedPlexInstance();
        if (!instance) throw new Error("Plex not configured");
        await testPlexConnection(instance);
        return NextResponse.json({ success: true, message: "Plex connection OK" });
      }
      case "tautulli": {
        const instance = await getDecryptedTautulliInstance();
        if (!instance) throw new Error("Tautulli not configured");
        await testTautulliConnection(instance);
        return NextResponse.json({ success: true, message: "Tautulli connection OK" });
      }
      case "ai": {
        const { searchParams } = new URL(_request.url);
        const id = searchParams.get("id");
        if (!id) throw new Error("Provider ID required");
        const provider = await getAIProviderById(session.user.id, id);
        if (!provider) throw new Error("AI provider not found");
        await testAIConnection(provider);
        return NextResponse.json({
          success: true,
          message: `${provider.name} connection OK`,
        });
      }
      default:
        return NextResponse.json({ error: "Unknown service" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Connection failed" },
      { status: 500 }
    );
  }
}
