/**
 * Client-side image compression. Resizes to max 1600px wide,
 * re-encodes JPEG at 80% quality. Keeps PDFs untouched.
 * Returns the original file object if compression fails or isn't applicable.
 */
export async function compressImageIfPossible(file: any): Promise<any> {
  if (!file || !file.dataUrl) return file;
  if (!file.type || !file.type.startsWith("image/")) return file;
  if (file.size < 200_000) return file; // already small enough

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 1600;
      const scale = Math.min(1, MAX_W / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.8);
      const compressedSize = Math.round((compressed.length * 3) / 4);
      // If compression didn't help, keep original
      if (compressedSize >= file.size) return resolve(file);
      resolve({
        name: file.name.replace(/\.[^.]+$/, ".jpg"),
        type: "image/jpeg",
        size: compressedSize,
        dataUrl: compressed,
      });
    };
    img.onerror = () => resolve(file);
    img.src = file.dataUrl;
  });
}

export async function compressAllFiles(files: Record<string, any>): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const [k, f] of Object.entries(files)) {
    out[k] = await compressImageIfPossible(f);
  }
  return out;
}

export function calcTotalSizeMB(files: Record<string, any>, signature?: string): number {
  let total = 0;
  for (const f of Object.values(files)) {
    if (f && (f as any).size) total += (f as any).size;
  }
  if (signature) total += signature.length * 0.75; // base64 → bytes ratio
  return total / (1024 * 1024);
}
