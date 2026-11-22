import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const OCR_PROMPT = `Analyze this receipt image. Extract all line items into a structured list.
If the text is in Spanish, keep it in Spanish.
Focus on:
1. Merchant / store name
2. Item description
3. Quantity (as a number)
4. Unit Price
5. Total price of the line
6. The grand total of the ticket.

Ignore taxes, discounts, or loyalty points if possible, just list the items.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING },
    totalAmount: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          total: { type: Type.NUMBER },
        },
        required: ["description", "quantity", "unitPrice", "total"],
      },
    },
  },
  required: ["merchant", "totalAmount", "items"],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(error: any): boolean {
  const status = typeof error?.status === "number" ? error.status : 0;
  const msg = String(error?.message || "");
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("503")
  );
}

function formatGeminiErrorMessage(error: any): { status: number; message: string } {
  const status = typeof error?.status === "number" ? error.status : 500;
  const rawMessage = String(error?.message || "");

  if (status === 403 || rawMessage.includes("PERMISSION_DENIED")) {
    return {
      status: 403,
      message:
        "Permiso denegado por la API de Gemini. Verifica la clave en Settings > Secrets.",
    };
  }
  if (status === 400 && rawMessage.includes("API_KEY_INVALID")) {
    return {
      status: 400,
      message:
        "La clave de API de Gemini no es válida. Revísala en Settings > Secrets.",
    };
  }
  if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Se ha alcanzado el límite temporal de peticiones. Espera unos segundos e inténtalo de nuevo.",
    };
  }
  if (status === 503 || rawMessage.includes("UNAVAILABLE")) {
    return {
      status: 503,
      message:
        "El servicio de IA está saturado temporalmente. Pulsa «Re-escanear ticket con IA» en unos segundos.",
    };
  }
  if (status === 400) {
    return {
      status: 400,
      message:
        "No se pudo leer ese formato de imagen. Prueba con una foto JPG o PNG.",
    };
  }

  return {
    status,
    message:
      "No se pudo interpretar la imagen del ticket. Inténtalo de nuevo o edita los productos manualmente.",
  };
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

async function generateTicketExtraction(
  ai: GoogleGenAI,
  model: string,
  thinkingLevel: ThinkingLevel,
  mimeType: string,
  base64Data: string
) {
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        { text: OCR_PROMPT },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel },
    },
  });

  const jsonStr = extractJsonText(response.text ?? "{}");
  return JSON.parse(jsonStr);
}


export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { imageBase64 } = (body || {}) as { imageBase64?: string };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "No se proporcionó ninguna imagen válida." });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: "Falta configurar la variable GEMINI_API_KEY en Vercel (Settings > Environment Variables).",
      });
      return;
    }

    const dataUrlMatch = imageBase64.match(
      /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/
    );
    const mimeType = dataUrlMatch ? dataUrlMatch[1] : "image/jpeg";
    const base64Data = dataUrlMatch
      ? dataUrlMatch[2]
      : imageBase64.split(",")[1] || imageBase64;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const modelsToTry = [
      { model: "gemini-3.1-flash-lite", retries: 1, thinkingLevel: ThinkingLevel.MINIMAL },
      { model: "gemini-4-hydrogen", retries: 1, thinkingLevel: ThinkingLevel.LOW },
    ];

    let lastError: any = null;
    for (const candidate of modelsToTry) {
      for (let attempt = 0; attempt <= candidate.retries; attempt++) {
        try {
          const parsed = await generateTicketExtraction(
            ai, candidate.model, candidate.thinkingLevel, mimeType, base64Data
          );
          res.status(200).json(parsed);
          return;
        } catch (err: any) {
          lastError = err;
          if (!isTransientError(err)) throw err;
          if (attempt < candidate.retries) await sleep(700 * (attempt + 1));
        }
      }
    }
    throw lastError;
  } catch (error: any) {
    console.error("Error parsing ticket with Gemini:", error);
    const formatted = formatGeminiErrorMessage(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
}
