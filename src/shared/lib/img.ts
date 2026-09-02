/** Rasm bilan ishlash: resize (max 1200px) + siqish (WebP/JPEG q=0.8) + thumbnail (200px) */

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function dims(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  if ('naturalWidth' in src) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

function drawScaled(src: ImageBitmap | HTMLImageElement, max: number): HTMLCanvasElement {
  const { w, h } = dims(src);
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function compressCanvas(canvas: HTMLCanvasElement, quality: number): string {
  let out = canvas.toDataURL('image/webp', quality);
  if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality);
  return out;
}

export interface ProcessedImage {
  data: string;
  thumb: string;
  size: number;
}

export async function processImageFile(file: Blob): Promise<ProcessedImage> {
  const bmp = await loadBitmap(file);
  try {
    const full = drawScaled(bmp, 1200);
    const thumb = drawScaled(bmp, 200);
    const data = compressCanvas(full, 0.8);
    const thumbData = compressCanvas(thumb, 0.75);
    return { data, thumb: thumbData, size: data.length + thumbData.length };
  } finally {
    if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
  }
}

/** Mavjud base64 rasmni qayta siqish (xotira sozlamalari uchun) */
export async function recompressDataUrl(dataUrl: string, max = 1200, quality = 0.8): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('img_load_error'));
    img.src = dataUrl;
  });
  const canvas = drawScaled(img, max);
  return compressCanvas(canvas, quality);
}

export function base64Size(b64: string): number {
  return Math.round((b64.length * 3) / 4);
}
