/**
 * AI photo restoration / colorization for uploaded portraits.
 *
 * SAFETY: these photos are real, often-deceased relatives. Generative image
 * models CAN drift facial features, which would be deeply upsetting. We mitigate
 * with (1) an identity-lock prompt that forbids any change to likeness, (2)
 * OpenAI's highest-fidelity edit model (gpt-image-2 preserves input faces; older
 * models use input_fidelity=high), and (3) a mandatory human before/after review
 * in the UI — the result is NEVER auto-applied and the original is never altered.
 * Even so, the result must always be reviewed; it is a suggestion, not truth.
 */
import type { AiAuth } from "@/lib/openai";

const IMAGES_EDIT_URL = "https://api.openai.com/v1/images/edits";
const PROXY_URL = "/api/ai/images/edit";

export type EnhanceMode = "restore" | "colorize";

/** Non-negotiable preamble repeated for every enhancement. */
const IDENTITY_LOCK = `You are restoring a real, historical family photograph of
specific real people — some of them deceased. The single most important rule,
above all else: preserve every person's identity and likeness with absolute,
total fidelity. Keep each face EXACTLY as in the original — the same facial
features, bone structure, eyes, eyebrows, nose, mouth, lips, jaw, chin, ears,
facial proportions, apparent age, wrinkles, skin, complexion, hairline,
hairstyle, facial hair, expression, gaze direction, head angle, posture, body
shape, and clothing. Do NOT beautify, smooth, slim, de-age, age, sharpen-beyond-
recognition, reshape, retouch, re-pose, or "improve" any face or body. Do NOT
add, remove, swap, or invent any person, feature, accessory, or object. Do NOT
fill in or guess detail that is genuinely missing — leave it as-is. Make zero
changes to WHO these people are or HOW they look. The output must be photo-
realistic and indistinguishable in likeness from the input — a faithful
conservation of the original, never a reinterpretation.`;

const MODE_PROMPT: Record<EnhanceMode, string> = {
  restore: `Within those constraints, perform only gentle physical restoration:
reduce film grain and noise; remove dust, scratches, creases, tears, spots and
stains; repair small areas of physical damage; and correct fading, low contrast,
and uneven exposure. Keep the photograph's original black-and-white, sepia, or
color tonality — do not add color to a monochrome photo.`,
  colorize: `Within those constraints, gently restore physical damage (noise,
dust, scratches, fading, contrast) AND add natural, realistic, period-accurate
color to this black-and-white or sepia photograph: believable, restrained skin
tones, hair, eyes, clothing, and background. Use muted, neutral, true-to-life
colors; when a color is genuinely uncertain, choose a plausible understated tone
rather than a vivid guess. Never oversaturate or stylize. The colorization must
not change any facial feature or identity.`,
};

export function buildEnhancePrompt(mode: EnhanceMode): string {
  return `${IDENTITY_LOCK}\n\n${MODE_PROMPT[mode]}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "image/png" });
}

async function directEdit(
  apiKey: string,
  dataUrl: string,
  prompt: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("image", dataUrlToBlob(dataUrl), "photo.png");
  fd.append("prompt", prompt);
  fd.append("size", "1024x1024");
  fd.append("quality", "high");
  if (model.startsWith("gpt-image-1")) fd.append("input_fidelity", "high");
  const res = await fetch(IMAGES_EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal,
  });
  const json = (await res.json()) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg = json.error?.message || `OpenAI ${res.status}`;
    // Account may lack gpt-image-2 access — retry with a high-fidelity fallback.
    if (model === "gpt-image-2" && (res.status === 400 || res.status === 404)) {
      return directEdit(apiKey, dataUrl, prompt, "gpt-image-1.5", signal);
    }
    throw new Error(msg);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned.");
  return `data:image/png;base64,${b64}`;
}

/** Returns a data-URL of the enhanced image. Throws on failure. */
export async function enhancePhoto(opts: {
  auth: AiAuth;
  dataUrl: string;
  mode: EnhanceMode;
  signal?: AbortSignal;
}): Promise<string> {
  const { auth, dataUrl, mode, signal } = opts;
  const prompt = buildEnhancePrompt(mode);

  if (auth.mode === "proxy") {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-passcode": auth.passcode,
      },
      body: JSON.stringify({ image: dataUrl, prompt, mode }),
      signal,
    });
    const json = (await res.json()) as { image?: string; error?: { message?: string } };
    if (!res.ok || !json.image) {
      throw new Error(json.error?.message || `Server ${res.status}`);
    }
    return json.image;
  }

  return directEdit(auth.apiKey, dataUrl, prompt, "gpt-image-2", signal);
}
