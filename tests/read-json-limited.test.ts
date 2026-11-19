import { describe, expect, it } from "vitest";
import {
  HttpError,
  MAX_REQUEST_BODY_BYTES,
  readJsonLimited,
} from "../src/lib/http/read-json-limited";

function streamedRequest(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readJsonLimited", () => {
  it("rejects a declared oversized body before consuming the stream", async () => {
    const request = streamedRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ok":true}'));
          controller.close();
        },
      }),
      { "content-length": "4097" },
    );

    await expect(readJsonLimited(request, MAX_REQUEST_BODY_BYTES)).rejects.toMatchObject({
      status: 413,
      message: "Request too large",
    } satisfies Partial<HttpError>);
    expect(request.bodyUsed).toBe(false);
  });

  it("counts streamed bytes when Content-Length is absent", async () => {
    const request = streamedRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3_000));
        controller.enqueue(new Uint8Array(1_097));
        controller.close();
      },
    }));

    expect(request.headers.has("content-length")).toBe(false);
    await expect(readJsonLimited(request, MAX_REQUEST_BODY_BYTES)).rejects.toMatchObject({
      status: 413,
      message: "Request too large",
    } satisfies Partial<HttpError>);
  });

  it("returns a readable 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/actions", {
      method: "POST",
      body: "{",
    });

    await expect(readJsonLimited(request, MAX_REQUEST_BODY_BYTES)).rejects.toMatchObject({
      status: 400,
      message: "Invalid JSON",
    } satisfies Partial<HttpError>);
  });
});
