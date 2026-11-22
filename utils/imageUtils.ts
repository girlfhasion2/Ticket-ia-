// ~1,3 MB de imagen una vez codificada en base64.
const MAX_DATA_URL_CHARS = 1_800_000;

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de imagen."));
    reader.readAsDataURL(file);
  });
};

/**
 * Normalizes and compresses a receipt photo (from camera or gallery) to a crisp JPEG data URL
 * so it stays fast for OCR and lightweight in local IndexedDB storage.
 */
export async function prepareReceiptImage(
  source: File | string,
  maxDimension = 1600,
  quality = 0.86
): Promise<string> {
  let objectUrl: string | null = null;

  try {
    const src =
      typeof source === "string"
        ? source
        : (objectUrl = URL.createObjectURL(source));

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Formato de imagen no compatible para preprocesado."));
      image.src = src;
    });

    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight) {
      throw new Error("La imagen seleccionada está vacía.");
    }

    const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
    const targetWidth = Math.round(naturalWidth * scale);
    const targetHeight = Math.round(naturalHeight * scale);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo inicializar el lienzo de imagen.");
    }

    const render = (w: number, h: number, q: number) => {
      canvas.width = w;
      canvas.height = h;
      // White background prevents transparent PNGs from turning black in JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", q);
    };

    // Se garantiza un tamaño razonable: la plataforma rechaza peticiones de más de ~4,5 MB
    // y en móvil las fotos de cámara son muy pesadas.
    let w = targetWidth;
    let h = targetHeight;
    let q = quality;
    let out = render(w, h, q);
    for (let i = 0; i < 6 && out.length > MAX_DATA_URL_CHARS; i++) {
      if (q > 0.61) {
        q = Math.max(0.6, q - 0.1);
      } else {
        w = Math.round(w * 0.8);
        h = Math.round(h * 0.8);
      }
      out = render(w, h, q);
    }
    return out;
  } catch (err) {
    if (typeof source !== "string") {
      if (source.size > 3 * 1024 * 1024) {
        throw new Error(
          "No se pudo reducir la foto para enviarla. Prueba a hacerla de nuevo o elige otra imagen."
        );
      }
      return readFileAsDataUrl(source);
    }
    throw err;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
