import { describe, expect, it } from "vitest";
import {
  readJsonBody,
  readTextBody,
  RequestBodyTooLargeError,
} from "../lib/http-body";

/** A chunked request: no content-length, body arrives as a stream. */
function chunkedRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Request("http://localhost/api/game/action", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    // Required by undici for a stream body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("Request bodies are capped before they are buffered", () => {
  it("reads a body that fits", async () => {
    const request = new Request("http://localhost/api/game/action", {
      method: "POST",
      body: JSON.stringify({ type: "sync" }),
    });
    expect(await readJsonBody(request, 2048)).toEqual({ type: "sync" });
  });

  it("rejects an oversized body declared through content-length", async () => {
    const request = new Request("http://localhost/api/game/action", {
      method: "POST",
      body: "x".repeat(4096),
    });
    await expect(readTextBody(request, 2048)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects an oversized chunked body that omits content-length", async () => {
    const request = chunkedRequest(Array.from({ length: 8 }, () => "x".repeat(512)));
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readTextBody(request, 2048)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("stops reading as soon as the cap is passed", async () => {
    const encoder = new TextEncoder();
    let pulled = 0;
    const request = new Request("http://localhost/api/game/action", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(encoder.encode("x".repeat(1024)));
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readTextBody(request, 2048)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    // Never drains an endless stream: a handful of chunks, not gigabytes.
    expect(pulled).toBeLessThan(10);
  });

  it("keeps multi-byte characters intact across chunk boundaries", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify({ name: "Rizky — Jakarta" }));
    const request = new Request("http://localhost/api/game/action", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          // Split mid-character on the em dash.
          for (let i = 0; i < bytes.length; i += 1) {
            controller.enqueue(bytes.slice(i, i + 1));
          }
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(await readJsonBody(request, 2048)).toEqual({
      name: "Rizky — Jakarta",
    });
  });

  it("treats a body-less request as empty", async () => {
    const request = new Request("http://localhost/api/game", { method: "GET" });
    expect(await readTextBody(request, 2048)).toBe("");
  });
});
