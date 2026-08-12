import type { APIRoute } from "astro";
import OpenAI from "openai";
import { buildSystemPrompt, type UiMode } from "../../lib/stodkompassen";
import { detectCrisis, crisisDirective } from "../../lib/crisisDetect";

// On-demand server route (everything else on the site stays static).
export const prerender = false;

// ── Limits / guards ─────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 40_000; // whole request payload
const MAX_MESSAGES = 24; // turns in one conversation
const MAX_MESSAGE_CHARS = 4_000; // a single message
const MAX_OUTPUT_TOKENS = 768; // keeps replies short + caps cost

// Per-IP token bucket (in-memory; one Render instance). ~12 msgs burst,
// refilling at 12/min.
const BUCKET_CAPACITY = 12;
const REFILL_PER_SEC = 12 / 60;
const buckets = new Map<string, { tokens: number; ts: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > 5_000) buckets.clear(); // crude guard against unbounded growth
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, ts: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.ts) / 1000) * REFILL_PER_SEC);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

// Reject browser calls coming from another site. Non-browser callers (no
// Origin header) fall through to the rate limiter.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

const REFUSAL_TEXT =
  "Jag kan tyvärr inte hjälpa till med just det. Men om du mår dåligt eller behöver prata finns det stöd att få — vid akut fara för liv, ring 112, och du kan alltid ringa Självmordslinjen på 90 101, dygnet runt.";
const ERROR_TEXT =
  "Något gick fel på vägen och jag kunde inte svara just nu. Vid akut fara för liv, ring 112. Du kan alltid ringa Självmordslinjen på 90 101 (dygnet runt) eller bläddra bland stödlinjerna här på sidan.";

// Env i Astro kommer från två håll, och bara ett av dem fungerar per miljö:
// `astro dev` laddar .env till import.meta.env (INTE till process.env), medan
// Render sätter riktiga miljövariabler som bara syns i process.env. Läs därför
// alltid båda — annars fungerar chatten i produktion men aldrig lokalt.
const env = (name: string): string | undefined =>
  (import.meta.env[name] as string | undefined) ?? process.env[name];

// Global daglig budget (in-memory; one Render instance) — ett tak oberoende
// av hur många olika IP:er som frågar, så att ett spammat/utnyttjat läge inte
// kan dränera hela AI-kreditsaldot på en dag (det hände 2026-08-12). Justera
// vid behov med STODKOMPASSEN_DAILY_BUDGET i Render, ingen kodändring krävs.
const DAILY_MESSAGE_BUDGET = Number(env("STODKOMPASSEN_DAILY_BUDGET")) || 300;
let budgetDay = "";
let budgetCount = 0;

function dailyBudgetOk(): boolean {
  const today = new Date().toISOString().slice(0, 10); // UTC-dygn
  if (today !== budgetDay) {
    budgetDay = today;
    budgetCount = 0;
  }
  if (budgetCount >= DAILY_MESSAGE_BUDGET) return false;
  budgetCount += 1;
  return true;
}

// 2026-08-12: bytte leverantör från Anthropic till OpenAI (samma leverantör
// och nyckel-/modellvariabler som MittPsykes huvudchatt använder) sedan
// Anthropic-kontots kreditsaldo tog slut. Se OPENAI_API_KEY/OPENAI_CHAT_MODEL
// i .env.example.
const apiKey = env("OPENAI_API_KEY");

type Msg = { role: "user" | "assistant"; content: string };

function parseMessages(value: unknown): Msg[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  const out: Msg[] = [];
  for (const m of value) {
    if (!m || typeof m !== "object") return null;
    const role = (m as Msg).role;
    const content = (m as Msg).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_MESSAGE_CHARS)
      return null;
    out.push({ role, content });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!apiKey) {
    console.error(
      "[chat] OPENAI_API_KEY saknas — satt varken i .env (dev) eller i miljön (Render).",
    );
    return json(503, { error: "chat_unavailable" });
  }
  if (!sameOrigin(request)) {
    return json(403, { error: "forbidden_origin" });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (!rateLimit(ip)) {
    return json(429, { error: "rate_limited" });
  }
  if (!dailyBudgetOk()) {
    console.error(
      `[chat] Daglig budget nådd (${DAILY_MESSAGE_BUDGET} meddelanden) — avvisar tills UTC-dygnet vänder.`,
    );
    return json(503, { error: "daily_budget_reached" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  let parsed: { messages?: unknown; uiMode?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const messages = parseMessages(parsed?.messages);
  if (!messages) {
    return json(400, { error: "invalid_request" });
  }
  const uiMode: UiMode = parsed?.uiMode === "widget" ? "widget" : "page";

  // Pre-LLM safety gate. Doesn't replace the reply — prepends a high-priority
  // directive so the model leads, warmly, with the right safety step.
  const crisis = detectCrisis(messages);
  const directive = crisisDirective(crisis);

  const system = await buildSystemPrompt(uiMode);
  // Samma variabelnamn som MittPsykes huvudchatt (src/lib/server/ai/text-generation.ts),
  // så samma Render-konvention gäller på båda tjänsterna.
  const model = env("OPENAI_CHAT_MODEL") || "gpt-5.4";
  // apiKey skickas in explicit så att den funkar lika i `astro dev` (import.meta.env)
  // och i Render (process.env) — se env()-hjälparen ovan.
  const client = new OpenAI({ apiKey });

  // Crisis-direktivet (om något) läggs allra först i systempromten, före den
  // stabila katalogtexten — samma prioritetsordning som tidigare.
  const systemContent = directive ? `${directive}\n\n${system}` : system;

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        const stream = await client.chat.completions.create({
          model,
          // gpt-5.x (och andra resonerande modeller) stödjer inte längre
          // `max_tokens` — samma fält som MittPsykes "support-chat"-syfte
          // använder för sin chattmodell.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          messages: [
            { role: "system", content: systemContent },
            ...messages,
          ],
        });

        let finishReason: string | null = null;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) send("delta", { text: delta });
          finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
        }

        if (finishReason === "content_filter") send("notice", { text: REFUSAL_TEXT });
        send("done", {});
      } catch (err) {
        // Aldrig meddelandeinnehåll (privacy-first) — men feltyp, status och
        // OpenAIs egen felbeskrivning av *vår request* (t.ex. "insufficient
        // quota") är ofarliga att logga och gör 401/404/429 mycket lättare
        // att skilja åt än en tom loggrad.
        const status = (err as { status?: number })?.status;
        const name = (err as { name?: string })?.name ?? "UnknownError";
        const detail = (err as { message?: string })?.message ?? "";
        console.error(`[chat] OpenAI-anrop misslyckades: ${name}${status ? ` (HTTP ${status})` : ""} — modell: ${model} — detalj: ${detail}`);
        send("error", { text: ERROR_TEXT });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
