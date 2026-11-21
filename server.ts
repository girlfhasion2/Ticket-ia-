import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  try {
    const raw = fs.readFileSync(envLocalPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore if env file cannot be read
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "25mb" }));

app.get("/api/public-config", (_req, res) => {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";

  res.json({ supabaseUrl, supabaseAnonKey });
});

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

app.post("/api/parse-ticket", async (req, res) => {
  try {
    const { imageBase64 } = req.body as { imageBase64?: string };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "No se proporcionó ninguna imagen válida." });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error: "Falta configurar la clave GEMINI_API_KEY en Settings > Secrets.",
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
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const modelsToTry = [
      {
        model: "gemini-3.1-flash-lite",
        retries: 1,
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
      {
        model: "gemini-4-hydrogen",
        retries: 1,
        thinkingLevel: ThinkingLevel.LOW,
      },
    ];

    let lastError: any = null;

    for (const candidate of modelsToTry) {
      for (let attempt = 0; attempt <= candidate.retries; attempt++) {
        try {
          const parsed = await generateTicketExtraction(
            ai,
            candidate.model,
            candidate.thinkingLevel,
            mimeType,
            base64Data
          );
          res.json(parsed);
          return;
        } catch (err: any) {
          lastError = err;
          if (!isTransientError(err)) {
            throw err;
          }
          if (attempt < candidate.retries) {
            await sleep(700 * (attempt + 1));
          }
        }
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error("Error parsing ticket with Gemini:", error);
    const formatted = formatGeminiErrorMessage(error);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    res.status(413).json({
      error: "La imagen es demasiado grande. Prueba con otra foto más ligera.",
    });
    return;
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "spa",
    });
    app.get("/@vite/client", (_req, res) => {
      res.type("application/javascript").send(
        `export class ErrorOverlay {}
export function createHotContext() {
  return {
    accept() {},
    prune() {},
    dispose() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function updateStyle(id, css) {
  let el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (el) el.remove();
}
export function injectQuery(url) {
  return url;
}`
      );
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
