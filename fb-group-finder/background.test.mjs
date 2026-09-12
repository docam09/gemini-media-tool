import assert from "node:assert/strict";
import { test } from "node:test";

let sequence = 0;
const post = (id) => ({ url: `https://www.facebook.com/groups/123/posts/${id}/`, text: `Tiger ${id}` });
const success = (results = [{ index: 0, score: 0.9, summary: "Phù hợp", extracted: { price: "900k" } }]) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }] }));

async function fixture(t, settings = {}, respond = () => success()) {
  const storage = { geminiApiKey: "test-api-key", ...settings };
  const requests = [];
  let listener;
  globalThis.chrome = {
    storage: { sync: {
      get: async () => ({ ...storage }),
      set: async (values) => { Object.assign(storage, values); },
    } },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  };
  t.after(() => { delete globalThis.chrome; });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const request = { url, headers: options.headers, body: JSON.parse(options.body) };
    requests.push(request);
    return respond(request, requests.length);
  });
  await import(`./background.js?test=${++sequence}`);
  return {
    storage,
    requests,
    filter: (posts = [post(1)]) => new Promise((resolve) => {
      assert.equal(listener({ type: "FILTER", query: "Tiger dưới 1 triệu", posts }, {}, resolve), true);
    }),
  };
}

for (const geminiModel of [undefined, "", "gemini-2.5-flash", " models/gemini-2.5-flash ", "gemini-3.6-flash"]) {
  test(`uses the supported default for stored model ${JSON.stringify(geminiModel)}`, async (t) => {
    const f = await fixture(t, { geminiModel });
    const result = await f.filter();
    assert.equal(result.ok, true);
    assert.equal(result.results[0].url, post(1).url);
    assert.equal(result.results[0].extracted.price, "900k");
    assert.equal(f.storage.geminiModel, "gemini-3.6-flash");
    assert.equal(f.storage.geminiApiKey, "test-api-key");
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
    assert.equal(f.requests[0].headers["x-goog-api-key"], "test-api-key");
    assert.deepEqual(f.requests[0].body.generationConfig, { temperature: 0.1, responseMimeType: "application/json" });
  });
}

test("preserves an explicitly selected different model while normalizing its resource prefix", async (t) => {
  const f = await fixture(t, { geminiModel: " models/gemini-2.5-pro " });
  assert.equal((await f.filter()).ok, true);
  assert.equal(f.storage.geminiModel, "gemini-2.5-pro");
  assert.match(f.requests[0].url, /models\/gemini-2.5-pro:generateContent$/);
});

test("rejects an invalid model or missing API key before making a request", async (t) => {
  const f = await fixture(t, { geminiModel: "gemini?key=wrong" });
  assert.match((await f.filter()).error, /Tên model không hợp lệ/);
  f.storage.geminiApiKey = "";
  assert.match((await f.filter()).error, /Chưa nhập Gemini API key/);
  assert.equal(f.requests.length, 0);
});

test("makes model-not-found actionable and redacts the key without retrying other models", async (t) => {
  const f = await fixture(t, {}, () => new Response(
    JSON.stringify({ error: { message: "Model not available for test-api-key" } }), { status: 404 },
  ));
  const result = await f.filter();
  assert.equal(result.ok, false);
  assert.match(result.error, /Gemini 404.*gemini-3.6-flash.*Cài đặt/);
  assert.ok(!result.error.includes("test-api-key"));
  assert.equal(f.requests.length, 1);
});

test("surfaces quota and request errors without model switching or thinking retries", async (t) => {
  const f = await fixture(t, {}, (_request, n) => new Response(
    n === 1 ? "Quota exceeded" : "Invalid thinking configuration",
    { status: n === 1 ? 429 : 400 },
  ));
  assert.match((await f.filter()).error, /Gemini 429: Quota exceeded/);
  assert.match((await f.filter()).error, /Gemini 400: Invalid thinking configuration/);
  assert.equal(f.requests.length, 2);
});

test("uses one resolved model across batches and maps batch-local indices to original links", async (t) => {
  const f = await fixture(t, { geminiModel: "gemini-2.5-flash" }, (_request, n) =>
    success([{ index: n === 1 ? 24 : 0, score: n === 1 ? 0.6 : 0.9 }, { index: 999 }]));
  const result = await f.filter(Array.from({ length: 26 }, (_, i) => post(i)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map((p) => p.url), [post(25).url, post(24).url]);
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every((r) => r.url.endsWith("/gemini-3.6-flash:generateContent")));
});
