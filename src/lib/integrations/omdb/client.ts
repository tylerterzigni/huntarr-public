import { getOmdbApiKey } from "@/lib/settings/global";

export interface OmdbTitleResult {
  imdbId: string;
  title: string;
  type: "movie" | "series" | "episode" | "other";
  year?: string;
}

function parseOmdbType(type: string | undefined): OmdbTitleResult["type"] {
  if (type === "movie") return "movie";
  if (type === "series") return "series";
  if (type === "episode") return "episode";
  return "other";
}

async function omdbFetch(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const apiKey = await getOmdbApiKey();
  if (!apiKey) return null;

  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  if (data.Response === "False") return null;
  return data;
}

export async function findOmdbByTitle(
  title: string,
  preferredType?: "movie" | "series"
): Promise<OmdbTitleResult | null> {
  const types: Array<"movie" | "series" | undefined> = preferredType
    ? [preferredType, preferredType === "series" ? "movie" : "series", undefined]
    : [undefined, "series", "movie"];

  for (const type of types) {
    const data = await omdbFetch({
      t: title,
      ...(type ? { type } : {}),
    });
    if (!data?.imdbID || typeof data.imdbID !== "string") continue;

    return {
      imdbId: data.imdbID,
      title: typeof data.Title === "string" ? data.Title : title,
      type: parseOmdbType(typeof data.Type === "string" ? data.Type : undefined),
      year: typeof data.Year === "string" ? data.Year : undefined,
    };
  }

  const searchData = await omdbFetch({ s: title, type: preferredType ?? "series" });
  const searchResults = searchData?.Search;
  if (!Array.isArray(searchResults) || searchResults.length === 0) return null;

  const first = searchResults[0] as Record<string, unknown>;
  if (typeof first.imdbID !== "string") return null;

  return {
    imdbId: first.imdbID,
    title: typeof first.Title === "string" ? first.Title : title,
    type: parseOmdbType(typeof first.Type === "string" ? first.Type : undefined),
    year: typeof first.Year === "string" ? first.Year : undefined,
  };
}

export async function testOmdbConnection(): Promise<void> {
  const apiKey = await getOmdbApiKey();
  if (!apiKey) throw new Error("OMDb API key not configured");

  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("t", "The Matrix");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    throw new Error(
      "OMDb API key is not activated yet. Check your email from omdbapi.com and click the activation link, then try again."
    );
  }
  if (!res.ok) throw new Error(`OMDb request failed (${res.status})`);

  const data = (await res.json()) as Record<string, unknown>;
  if (data.Response === "False") {
    const message = typeof data.Error === "string" ? data.Error : "Invalid OMDb API key";
    if (/invalid api key|401/i.test(message)) {
      throw new Error(
        "OMDb API key is not activated yet. Check your email from omdbapi.com and click the activation link, then try again."
      );
    }
    throw new Error(message);
  }
}
