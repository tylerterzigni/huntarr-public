const HISTORY_KEY = "huntarr-ai-model-history";
const DENY_KEY = "huntarr-ai-model-history-denied";
const MAX_MODELS = 50;

function normalize(model: string): string {
  return model.trim();
}

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalize)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeList(key: string, models: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(models.slice(0, MAX_MODELS)));
}

export function readModelHistory(): string[] {
  return readList(HISTORY_KEY);
}

function readDeniedModels(): string[] {
  return readList(DENY_KEY);
}

function isDenied(model: string, denied: string[]): boolean {
  const key = normalize(model).toLowerCase();
  return denied.some((item) => item.toLowerCase() === key);
}

export function mergeModelHistory(models: string[]): string[] {
  const denied = readDeniedModels();
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const model of [...readModelHistory(), ...models.map(normalize)]) {
    if (!model || isDenied(model, denied)) continue;
    const key = model.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(model);
  }

  writeList(HISTORY_KEY, merged);
  return merged;
}

export function rememberModel(model: string): string[] {
  const normalized = normalize(model);
  if (!normalized) return readModelHistory();

  const denied = readDeniedModels().filter(
    (item) => item.toLowerCase() !== normalized.toLowerCase()
  );
  writeList(DENY_KEY, denied);

  const rest = readModelHistory().filter(
    (item) => item.toLowerCase() !== normalized.toLowerCase()
  );
  const next = [normalized, ...rest].slice(0, MAX_MODELS);
  writeList(HISTORY_KEY, next);
  return next;
}

export function forgetModel(model: string): string[] {
  const normalized = normalize(model);
  if (!normalized) return readModelHistory();

  const denied = readDeniedModels();
  if (!isDenied(normalized, denied)) {
    writeList(DENY_KEY, [normalized, ...denied]);
  }

  const next = readModelHistory().filter(
    (item) => item.toLowerCase() !== normalized.toLowerCase()
  );
  writeList(HISTORY_KEY, next);
  return next;
}
