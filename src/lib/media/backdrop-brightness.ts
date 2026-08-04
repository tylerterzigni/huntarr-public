/** Perceived brightness 0–255 for the top strip of a backdrop (nav overlay zone). */
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 48;
/** Top fraction of the image that sits behind the sticky navbar. */
const TOP_STRIP_RATIO = 0.22;

/**
 * Average perceived brightness (0–255) of the top strip of an image.
 * Returns null when the image cannot be sampled (CORS, load failure, etc.).
 */
export function sampleTopStripBrightness(imageUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        const srcH = Math.max(1, Math.floor(img.naturalHeight * TOP_STRIP_RATIO));
        ctx.drawImage(
          img,
          0,
          0,
          img.naturalWidth,
          srcH,
          0,
          0,
          SAMPLE_WIDTH,
          SAMPLE_HEIGHT
        );

        const { data } = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        let sum = 0;
        const pixels = SAMPLE_WIDTH * SAMPLE_HEIGHT;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        resolve(sum / pixels);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/** Light page body behind the glass nav once the hero has scrolled away. */
export const PAGE_BODY_BRIGHTNESS = 235;

/**
 * How much the nav should use white text (1) vs dark grey (0), given the
 * effective background brightness behind the glass bar (0–255).
 */
export function whiteTextMixFromBrightness(brightness: number): number {
  // Dark fanart → white; light fanart / page body → dark grey. Soft ramp between.
  const start = 120;
  const end = 175;
  if (brightness <= start) return 1;
  if (brightness >= end) return 0;
  return 1 - (brightness - start) / (end - start);
}
