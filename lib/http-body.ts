import "server-only";

/**
 * `content-length` is optional: a chunked request omits it, so a header-only
 * guard is trivially bypassed and `request.json()` would then buffer the whole
 * stream. Racely runs as a single PM2 fork, so one oversized upload is enough
 * to push the process into its memory-restart loop. Read the body through a
 * running byte counter instead and abandon it the moment it passes the cap.
 */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readTextBody(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  const body = request.body;
  if (!body) return "";

  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let received = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new RequestBodyTooLargeError();
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    // Releases the socket for a rejected body instead of draining the rest of it.
    await reader.cancel().catch(() => undefined);
  }

  return text + decoder.decode();
}

/** Reads a JSON body under `maxBytes`. Throws SyntaxError on malformed JSON. */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  return JSON.parse(await readTextBody(request, maxBytes));
}
