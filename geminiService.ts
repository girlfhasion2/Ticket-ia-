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
  const response = await fetch("/api/parse-ticket", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageBase64: base64Image }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error || "No se pudo procesar el ticket automáticamente."
    );
  }

  return data as ParsedTicketResponse;
}
