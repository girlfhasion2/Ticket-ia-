export interface ParsedTicketItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ParsedTicketResponse {
  merchant: string;
  totalAmount: number;
  items: ParsedTicketItem[];
}

export async function parseTicketImage(
  base64Image: string
): Promise<ParsedTicketResponse> {
  let response: Response;
  try {
    response = await fetch("/api/parse-ticket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: base64Image }),
    });
  } catch {
    throw new Error(
      "No se pudo contactar con el servidor de lectura. Comprueba la conexión e inténtalo de nuevo."
    );
  }

  // Si el fallo viene de la plataforma (no de nuestro servidor) la respuesta no es JSON.
  const raw = await response.text().catch(() => "");
  let data: any = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (data?.error) {
      throw new Error(data.error);
    }
    const kb = Math.round(base64Image.length / 1024);
    if (response.status === 413) {
      throw new Error(
        `La imagen es demasiado grande para enviarla (${kb} KB). Prueba con otra foto más ligera.`
      );
    }
    if (response.status === 504 || response.status === 408) {
      throw new Error(
        `El servidor tardó demasiado en responder (código ${response.status}). Inténtalo de nuevo.`
      );
    }
    if (response.status === 429) {
      throw new Error("Demasiadas peticiones seguidas. Espera unos segundos e inténtalo de nuevo.");
    }
    throw new Error(
      `No se pudo procesar el ticket automáticamente (código ${response.status}, imagen ${kb} KB).`
    );
  }

  return data as ParsedTicketResponse;
}
