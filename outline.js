import { Skia, AlphaType, ColorType } from '@shopify/react-native-skia';

// Photo (base64) -> white Canny line-art PNG on transparent background (data URI).
export async function imageToLineArt(base64, { size = 640, blurPasses = 2, thick = true } = {}) {
  const src = Skia.Image.MakeFromEncoded(Skia.Data.fromBase64(base64));
  if (!src) throw new Error('Could not decode image');
  const k = size / Math.max(src.width(), src.height());
  const w = Math.round(src.width() * k), h = Math.round(src.height() * k);

  const surface = Skia.Surface.MakeOffscreen(w, h);
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('white'));
  canvas.drawImageRect(src, Skia.XYWHRect(0, 0, src.width(), src.height()),
    Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  surface.flush();
  const px = surface.makeImageSnapshot().readPixels(0, 0,
    { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });

  // grayscale
  let g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

  // gaussian blur (3x3 kernel, repeated)
  for (let p = 0; p < blurPasses; p++) {
    const o = new Float32Array(g);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      o[i] = (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1] + 2 * g[i - 1] + 4 * g[i] + 2 * g[i + 1] +
        g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) / 16;
    }
    g = o;
  }

  // sobel magnitude + direction (quantized to 0/45/90/135)
  const mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -g[i - w - 1] + g[i - w + 1] - 2 * g[i - 1] + 2 * g[i + 1] - g[i + w - 1] + g[i + w + 1];
    const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
    const m = Math.hypot(gx, gy); mag[i] = m; if (m > max) max = m;
    let a = (Math.atan2(gy, gx) * 180) / Math.PI; if (a < 0) a += 180;
    dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
  }

  // non-maximum suppression
  const nms = new Float32Array(w * h);
  const off = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  const hist = new Uint32Array(256); let nz = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, [dx, dy] = off[dir[i]], m = mag[i];
    if (m >= mag[i + dy * w + dx] && m >= mag[i - dy * w - dx]) {
      nms[i] = m; if (m > 0) { hist[Math.min(255, (m / max) * 255) | 0]++; nz++; }
    }
  }
  // adaptive thresholds: strong = top ~12% of surviving edge pixels
  let acc = 0, bin = 255;
  for (; bin > 0; bin--) { acc += hist[bin]; if (acc > nz * 0.12) break; }
  const hi = (bin / 255) * max, lo = hi * 0.4;

  // hysteresis
  const edge = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w * h; i++) if (nms[i] >= hi) { edge[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = i + dy * w + dx;
      if (j > 0 && j < w * h && !edge[j] && nms[j] >= lo) { edge[j] = 1; stack.push(j); }
    }
  }

  // white RGBA, alpha only where edges are (optionally 2px thick)
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    if (edge[i]) for (const j of thick ? [i, i + 1, i + w] : [i]) out.set([255, 255, 255, 255], j * 4);
  }
  const img = Skia.Image.MakeImage(
    { width: w, height: h, alphaType: AlphaType.Unpremul, colorType: ColorType.RGBA_8888 },
    Skia.Data.fromBytes(out), w * 4);
  return { uri: `data:image/png;base64,${img.encodeToBase64()}`, aspect: w / h };
}
