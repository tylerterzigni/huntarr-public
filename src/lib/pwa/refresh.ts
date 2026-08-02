export const HUNTARR_REFRESH_EVENT = "huntarr:refresh";

export function dispatchHuntarrRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HUNTARR_REFRESH_EVENT));
  }
}
