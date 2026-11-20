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
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo inicializar el lienzo de imagen.");
    }

    // White background prevents transparent PNGs from turning black in JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    if (typeof source !== "string") {
      return readFileAsDataUrl(source);
    }
    throw err;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
