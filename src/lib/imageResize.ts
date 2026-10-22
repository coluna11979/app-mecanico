/**
 * Reduz uma foto no próprio aparelho antes do upload (JPEG, lado maior ≤ maxSide).
 * Foto de celular (3–5 MB) vira ~300–600 KB: sobe mais rápido e a IA lê igual.
 */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(b => resolve(b ?? file), 'image/jpeg', quality);
  });
}

/** createImageBitmap respeita a orientação EXIF (foto "deitada" do celular) */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* cai no <img> */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
