import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, createApi, normalizeUrl, request } from "../api/client";
const schema = z.object({ ok: z.boolean() });
afterEach(() => vi.unstubAllGlobals());
describe("API boundary", () => {
  it("explains invalid expected range in Vietnamese without losing HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: "temperature: minimum exceeds maximum" }),
            { status: 400 },
          ),
        ),
    );
    await expect(
      request("http://api", "/config/preview", "writer", schema, {
        method: "POST",
      }),
    ).rejects.toMatchObject({
      status: 400,
      uncertain: false,
      message:
        "Thông số temperature: “Giá trị nhỏ nhất dự kiến” đang lớn hơn “Giá trị lớn nhất dự kiến”. Sửa để giá trị nhỏ nhất không vượt giá trị lớn nhất.",
    });
  });
  it.each([
    ["http://localhost:3000/", "http://localhost:3000"],
    ["https://demo.local/api/", "https://demo.local/api"],
  ])("normalizes base %s", (url, out) => expect(normalizeUrl(url)).toBe(out));
  it.each([
    "javascript:alert(1)",
    "http://user:secret@host",
    "http://host?token=x",
    "http://host#x",
  ])("rejects credentials/query/unsafe URL %s", (url) =>
    expect(() => normalizeUrl(url)).toThrow(),
  );
  it("handles HTML from proxy and retains status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>bad gateway</html>", { status: 503 }),
        ),
    );
    await expect(
      request("http://api", "/x", "secret", schema),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects empty successful JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      request("http://api", "/x", "secret", schema),
    ).rejects.toBeInstanceOf(ApiError);
  });
  it("rejects a malformed schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"ok":"yes"}')),
    );
    await expect(request("http://api", "/x", "secret", schema)).rejects.toThrow(
      "cấu trúc",
    );
  });
  it("reads Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
        ),
    );
    await expect(
      request("http://api", "/x", "secret", schema),
    ).rejects.toMatchObject({ status: 429, retryAfterMs: 12000 });
  });
  it("does not retry ambiguous POST and preserves uncertainty", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      request("http://api", "/x", "secret", schema, { method: "POST" }),
    ).rejects.toMatchObject({ uncertain: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("aborts caller cancellation without turning it into a network failure", async () => {
    const c = new AbortController();
    c.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error()));
    await expect(
      request("http://api", "/x", "secret", schema, { signal: c.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps database IDs as strings and encodes endpoint IDs", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "9223372036854775807",
          deviceId: "A",
          timestamp: 1,
          code: "OVERHEAT",
          severity: "high",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const api = createApi({
      base: "http://api",
      readToken: "reader",
      writeToken: "writer",
    });
    expect((await api.ack("9223372036854775807")).id).toBe(
      "9223372036854775807",
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer writer");
  });
});

it("marks a POST timeout uncertain without a second send", async () => {
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timeout", "TimeoutError")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    request("http://api", "/probe", "secret", schema, {
      method: "POST",
      timeoutMs: 10,
    }),
  ).rejects.toMatchObject({ uncertain: true, status: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("AI quick action dùng token đọc và POST có body, không cần token ghi", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: "demo",
          mode: "rules",
          text: "Dữ liệu backend",
          notice: null,
          results: [],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const api = createApi({
    base: "http://api",
    readToken: "reader",
    writeToken: "",
  });
  await api.copilot({ action: "underheat" });
  expect(fetch).toHaveBeenCalledWith(
    "http://api/ai/query",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer reader" }),
      body: JSON.stringify({ action: "underheat" }),
    }),
  );
});
