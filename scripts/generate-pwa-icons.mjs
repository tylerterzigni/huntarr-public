/**
 * Generate PWA install icons from Huntarr source assets.
 *
 * Sources (in priority order):
 *   - src/app/apple-icon.png  (180×180, primary)
 *   - src/app/icon.png        (32×32 favicon fallback)
 *   - public/huntarr-logo.png (128×150 logo)
 *
 * Usage: npm install sharp --save-dev && npm run generate:pwa-icons
 */
import { mkdir, copyFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "icons");

const SOURCES = {
  primary: join(ROOT, "src", "app", "apple-icon.png"),
  favicon: join(ROOT, "src", "app", "icon.png"),
  logo: join(ROOT, "public", "huntarr-logo.png"),
};

/** Matches tailwind seerr-bg / manifest background_color */
const BG_COLOR = "#e5e7eb";
const ICON_STROKE = "#374151";

async function pickSourceBuffer() {
  for (const path of [SOURCES.primary, SOURCES.logo, SOURCES.favicon]) {
    try {
      return await sharp(path).png().toBuffer();
    } catch {
      /* try next */
    }
  }
  throw new Error("No icon source found (apple-icon.png, huntarr-logo.png, icon.png)");
}

/**
 * Standard "any" icon — logo fills ~84% of canvas on seerr-bg.
 */
async function createStandardIcon(sourceBuffer, size, outputPath) {
  const inner = Math.round(size * 0.84);

  const logo = await sharp(sourceBuffer)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outputPath);
}

/**
 * Maskable icon — logo kept inside ~80% center safe zone (Android/iOS adaptive icons).
 */
async function createMaskableIcon(sourceBuffer, size, outputPath) {
  const safeZone = Math.round(size * 0.8);

  const logo = await sharp(sourceBuffer)
    .resize(safeZone, safeZone, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outputPath);
}

/** Lucide-style shortcut icons on seerr-bg (192×192). */
const SHORTCUT_SVGS = {
  home: `<g transform="translate(48 48)" fill="none" stroke="${ICON_STROKE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M48 18 L12 48 V84 H36 V60 H60 V84 H84 V48 Z"/>
  </g>`,
  movies: `<g transform="translate(40 48)" fill="none" stroke="${ICON_STROKE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="12" width="88" height="72" rx="6"/>
    <line x1="8" y1="36" x2="96" y2="36"/>
    <line x1="8" y1="60" x2="96" y2="60"/>
    <line x1="32" y1="12" x2="32" y2="84"/>
    <line x1="56" y1="12" x2="56" y2="84"/>
    <line x1="80" y1="12" x2="80" y2="84"/>
  </g>`,
  tv: `<g transform="translate(44 52)" fill="none" stroke="${ICON_STROKE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="16" width="96" height="64" rx="6"/>
    <line x1="56" y1="80" x2="56" y2="92"/>
    <line x1="32" y1="92" x2="80" y2="92"/>
  </g>`,
  settings: `<g transform="translate(48 48)" fill="none" stroke="${ICON_STROKE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="48" cy="48" r="18"/>
    <path d="M48 8 V20 M48 76 V88 M88 48 H76 M20 48 H8 M76.2 19.8 L68 28 M28 68 L19.8 76.2 M76.2 76.2 L68 68 M28 28 L19.8 19.8"/>
  </g>`,
};

async function createShortcutIcon(svgInner, outputPath) {
  const size = 192;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG_COLOR}"/>
  ${svgInner}
</svg>`;

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outputPath);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const sourceBuffer = await pickSourceBuffer();

  const tasks = [
    ["android-chrome-192x192.png", () => createStandardIcon(sourceBuffer, 192, join(OUT_DIR, "android-chrome-192x192.png"))],
    ["android-chrome-512x512.png", () => createStandardIcon(sourceBuffer, 512, join(OUT_DIR, "android-chrome-512x512.png"))],
    ["android-chrome-192x192_maskable.png", () => createMaskableIcon(sourceBuffer, 192, join(OUT_DIR, "android-chrome-192x192_maskable.png"))],
    ["android-chrome-512x512_maskable.png", () => createMaskableIcon(sourceBuffer, 512, join(OUT_DIR, "android-chrome-512x512_maskable.png"))],
    ["apple-touch-icon.png", () => createStandardIcon(sourceBuffer, 180, join(OUT_DIR, "apple-touch-icon.png"))],
    ["badge-128x128.png", () => createStandardIcon(sourceBuffer, 128, join(OUT_DIR, "badge-128x128.png"))],
    ["shortcut-home-192x192.png", () => createShortcutIcon(SHORTCUT_SVGS.home, join(OUT_DIR, "shortcut-home-192x192.png"))],
    ["shortcut-movies-192x192.png", () => createShortcutIcon(SHORTCUT_SVGS.movies, join(OUT_DIR, "shortcut-movies-192x192.png"))],
    ["shortcut-tv-192x192.png", () => createShortcutIcon(SHORTCUT_SVGS.tv, join(OUT_DIR, "shortcut-tv-192x192.png"))],
    ["shortcut-settings-192x192.png", () => createShortcutIcon(SHORTCUT_SVGS.settings, join(OUT_DIR, "shortcut-settings-192x192.png"))],
  ];

  for (const [name, fn] of tasks) {
    await fn();
    console.log(`  ✓ ${name}`);
  }

  // Keep Next.js apple-icon in sync with generated 180px asset
  await copyFile(join(OUT_DIR, "apple-touch-icon.png"), SOURCES.primary);
  console.log("  ✓ synced src/app/apple-icon.png");

  console.log(`\nGenerated ${tasks.length} icons in public/icons/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
