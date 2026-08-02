import { getSonarrEpisodes, getSonarrSeries } from "@/lib/integrations/sonarr/client";
import { getDecryptedArrInstance, getIntegrationInstances } from "@/lib/settings/integrations";
import { episodeAvailabilityKey } from "@/lib/utils";

export { episodeAvailabilityKey };

export async function getSonarrEpisodeAvailability(tmdbId: number): Promise<Set<string>> {
  const available = new Set<string>();
  const instances = await getIntegrationInstances("sonarr");

  await Promise.all(
    instances.map(async (instance) => {
      const decrypted = await getDecryptedArrInstance(instance.id);
      if (!decrypted) return;

      try {
        const seriesList = await getSonarrSeries(decrypted);
        const series = seriesList.find((show) => show.tmdbId === tmdbId);
        if (!series) return;

        const episodes = await getSonarrEpisodes(decrypted, series.id);
        for (const episode of episodes) {
          if (episode.hasFile) {
            available.add(episodeAvailabilityKey(episode.seasonNumber, episode.episodeNumber));
          }
        }
      } catch {
        // Skip unreachable Sonarr instances
      }
    })
  );

  return available;
}
