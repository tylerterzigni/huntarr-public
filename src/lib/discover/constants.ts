/** Default discover filters when searching movies/TV with filters enabled. */
export const DEFAULT_DISCOVER_LANGUAGE = "en";
export const DEFAULT_DISCOVER_COUNTRIES = ["US", "GB"] as const;

export const TOP_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
] as const;

export const TV_STATUS_OPTIONS = [
  { code: "0", label: "Returning Series" },
  { code: "1", label: "Planned" },
  { code: "2", label: "In Production" },
  { code: "3", label: "Ended" },
  { code: "4", label: "Canceled" },
  { code: "5", label: "Pilot" },
] as const;
