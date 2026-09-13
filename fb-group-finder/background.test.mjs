import assert from "node:assert/strict";
import { test } from "node:test";

let sequence = 0;
const post = (id) => ({ url: `https://www.facebook.com/groups/123/posts/${id}/`, text: `Tiger ${id}` });
const success = (results = [{ index: 0, score: 0.9, summary: "Phù hợp", extracted: { price: "900k" } }]) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }] }));

async function fixture(t, settings = {}, respond = () => success(), tabReply = async () => ({ ok: true, posts: [] })) {
  const storage = { geminiApiKey: "test-api-key", ...settings };
  const local = {};
  const requests = [];
  const tabMessages = [];
  let listener;
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({ ...storage }),
        set: async (values) => { Object.assign(storage, values); },
      },
      local: {
        get: async (key) => (key in local ? { [key]: structuredClone(local[key]) } : {}),
        set: async (values) => { Object.assign(local, structuredClone(values)); },
      },
    },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
    tabs: { sendMessage: async (tabId, message) => { tabMessages.push({ tabId, message }); return tabReply(message, tabId); } },
  };
  t.after(() => { delete globalThis.chrome; });
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const request = { url, headers: options.headers, options, body: options.body ? JSON.parse(options.body) : null };
    requests.push(request);
    return respond(request, requests.length);
  });
  await import(`./background.js?test=${++sequence}`);
  const send = (message, sender = {}) => new Promise((resolve) => {
    assert.equal(listener(message, sender, resolve), true);
  });
  const settled = async () => {
    for (let i = 0; i < 100 && (!local.job || ["scanning", "filtering"].includes(local.job.state)); i++) await new Promise((r) => setTimeout(r, 5));
    return local.job;
  };
  return {
    storage,
    local,
    requests,
    tabMessages,
    send,
    notify: (message, sender) => { listener(message, sender, () => {}); },
    settled,
    filter: (posts = [post(1)]) => send({ type: "FILTER", query: "Tiger dưới 1 triệu", posts }),
    run: (extra = {}) => send({ type: "RUN", tabId: 5, query: "Tiger dưới 1 triệu", maxPosts: 2, maxScrolls: 6, groupTitle: "Nhóm test", ...extra }),
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

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const imageResponse = (type = "image/png", bytes = PNG) => new Response(bytes, { headers: { "content-type": type } });
const geminiCalls = (f) => f.requests.filter((r) => r.url.includes("generativelanguage"));
const imageCalls = (f) => f.requests.filter((r) => !r.url.includes("generativelanguage"));
const withMedia = (id, images, comments = []) => ({ ...post(id), images, comments });

test("sends post images as inline parts labelled by batch index with comments in the prompt", async (t) => {
  const f = await fixture(t, {}, (request) => request.body ? success([{ index: 1, score: 0.8 }]) : imageResponse("image/jpeg; charset=binary"));
  const result = await f.filter([
    withMedia(1, [], [{ author: "Seller", text: "Còn hàng, 850k" }, { author: "", text: "Inbox" }]),
    withMedia(2, ["https://scontent.xx.fbcdn.net/v/t39/p1.jpg", "https://scontent-hkg.xx.fbcdn.net/v/t39/p2.jpg"]),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(imageCalls(f).map((r) => r.url), ["https://scontent.xx.fbcdn.net/v/t39/p1.jpg", "https://scontent-hkg.xx.fbcdn.net/v/t39/p2.jpg"]);
  assert.ok(imageCalls(f).every((r) => r.options.credentials === "omit"));
  const [gemini] = geminiCalls(f);
  const parts = gemini.body.contents[0].parts;
  assert.equal(parts.length, 5);
  assert.match(parts[0].text, /### \[0\][\s\S]*Bình luận đang hiển thị \(2\):\n- Seller: Còn hàng, 850k\n- Inbox/);
  assert.match(parts[0].text, /### \[1\][\s\S]*Ảnh đính kèm: 2/);
  assert.deepEqual(parts.slice(1), [
    { text: "Ảnh của bài [1]:" }, { inlineData: { mimeType: "image/jpeg", data: Buffer.from(PNG).toString("base64") } },
    { text: "Ảnh của bài [1]:" }, { inlineData: { mimeType: "image/jpeg", data: Buffer.from(PNG).toString("base64") } },
  ]);
  assert.deepEqual(result.stats, { imagesSent: 2, imagesSkipped: 0, comments: 2 });
  assert.equal(result.results[0].url, post(2).url);
  assert.equal(result.results[0].images.length, 2);
  assert.equal("imageParts" in result.results[0], false);
});

test("skips failed, non-image, oversized and non-Facebook images without failing the filter", async (t) => {
  const f = await fixture(t, {}, (request) => {
    if (request.body) return success();
    if (request.url.endsWith("fail.jpg")) return new Response("nope", { status: 403 });
    if (request.url.endsWith("page.html")) return imageResponse("text/html");
    if (request.url.endsWith("huge.jpg")) return imageResponse("image/jpeg", new Uint8Array(4 * 1024 * 1024 + 1));
    if (request.url.endsWith("throw.jpg")) throw new Error("network");
    return imageResponse();
  });
  const result = await f.filter([withMedia(1, [
    "https://scontent.xx.fbcdn.net/fail.jpg", "https://scontent.xx.fbcdn.net/page.html", "https://scontent.xx.fbcdn.net/huge.jpg",
    "https://scontent.xx.fbcdn.net/throw.jpg", "https://evil.example.com/fbcdn.net/x.jpg", "http://scontent.xx.fbcdn.net/plain.jpg",
    "https://scontent.xx.fbcdn.net/ok.png",
  ])]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.stats, { imagesSent: 1, imagesSkipped: 6, comments: 0 });
  assert.equal(imageCalls(f).length, 5);
  assert.ok(imageCalls(f).every((r) => r.url.startsWith("https://scontent.xx.fbcdn.net/")));
  const parts = geminiCalls(f)[0].body.contents[0].parts;
  assert.equal(parts.filter((p) => p.inlineData).length, 1);
  assert.equal(parts[0].text.includes("evil.example.com"), false);
});

test("respects disabled image and comment settings and keeps text-only batches at 25", async (t) => {
  const f = await fixture(t, { readImages: false, readComments: false }, (request) => request.body ? success() : imageResponse());
  const posts = Array.from({ length: 26 }, (_, i) => withMedia(i, ["https://scontent.xx.fbcdn.net/p.jpg"], [{ author: "A", text: "SECRET COMMENT" }]));
  const result = await f.filter(posts);
  assert.equal(result.ok, true);
  assert.equal(imageCalls(f).length, 0);
  assert.equal(geminiCalls(f).length, 2);
  assert.ok(geminiCalls(f).every((r) => !JSON.stringify(r.body).includes("SECRET COMMENT") && r.body.contents[0].parts.length === 1));
  assert.deepEqual(result.stats, { imagesSent: 0, imagesSkipped: 0, comments: 0 });
  assert.deepEqual(result.results[0].images, []);
  assert.deepEqual(result.results[0].comments, []);
});

test("uses smaller batches when images are present and keeps image labels batch-local", async (t) => {
  const f = await fixture(t, {}, (request) => request.body ? success([{ index: 0, score: 0.7 }]) : imageResponse());
  const posts = Array.from({ length: 9 }, (_, i) => withMedia(i, i === 8 ? ["https://scontent.xx.fbcdn.net/p8.jpg"] : []));
  const result = await f.filter(posts);
  assert.equal(geminiCalls(f).length, 2);
  assert.equal(geminiCalls(f)[0].body.contents[0].parts.length, 1);
  assert.deepEqual(geminiCalls(f)[1].body.contents[0].parts[1], { text: "Ảnh của bài [0]:" });
  assert.deepEqual(result.results.map((p) => p.url), [post(0).url, post(8).url]);
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

test("runs the scan and Gemini filter as a background job whose results persist in storage", async (t) => {
  const scanned = [{ ...post(1), images: [], comments: [{ author: "A", text: "850k" }] }];
  const f = await fixture(t, {}, () => success(), async (message) => {
    assert.equal(message.type, "SCAN");
    assert.deepEqual(message.opts, { maxPosts: 2, maxScrolls: 6 });
    return { ok: true, posts: scanned, diagnostics: { images: 0, comments: 1 } };
  });
  assert.deepEqual(await f.run(), { ok: true });
  const job = await f.settled();
  assert.equal(job.state, "done");
  assert.equal(job.query, "Tiger dưới 1 triệu");
  assert.equal(job.groupTitle, "Nhóm test");
  assert.equal(job.tabId, 5);
  assert.deepEqual(job.results.map((r) => r.url), [post(1).url]);
  assert.equal(job.results[0].extracted.price, "900k");
  assert.match(job.status, /Xong: 1\/1 bài phù hợp/);
  assert.match(job.status, /1 bình luận/);
  assert.ok(job.finishedAt >= job.startedAt);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.tabMessages.map((m) => m.tabId), [5]);
});

test("records scanner diagnostics as a job error without calling Gemini when no post was extracted", async (t) => {
  const f = await fixture(t, {}, () => success(), async () => ({
    ok: true, posts: [], diagnostics: { candidates: 8, missingLinks: 8, missingText: 2, scrolls: 12 },
  }));
  await f.run();
  const job = await f.settled();
  assert.equal(job.state, "error");
  assert.match(job.error, /8 khung bài/);
  assert.match(job.error, /8 thiếu link, 2 thiếu nội dung/);
  assert.match(job.error, /12 lần/);
  assert.equal(f.requests.length, 0);
});

test("a stopped scan finishes without Gemini and a failed scan surfaces its error", async (t) => {
  const f = await fixture(t, {}, () => success(), async () => ({ ok: true, canceled: true, posts: [post(1)] }));
  await f.run();
  let job = await f.settled();
  assert.equal(job.state, "done");
  assert.deepEqual(job.results, []);
  assert.match(job.status, /Đã dừng quét \(1 bài đã đọc\)/);
  assert.equal(f.requests.length, 0);

  const g = await fixture(t, {}, () => success(), async () => { throw new Error("Could not establish connection"); });
  await g.run();
  job = await g.settled();
  assert.equal(job.state, "error");
  assert.match(job.error, /Could not establish connection/);
});

test("reports scan progress only for the scanning tab, refuses a second job and forwards Stop", async (t) => {
  let finishScan;
  const f = await fixture(t, {}, () => success(), async (message) => {
    if (message.type === "STOP_SCAN") { finishScan({ ok: true, canceled: true, posts: [] }); return { ok: true }; }
    return new Promise((resolve) => { finishScan = resolve; });
  });
  await f.run();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.local.job.state, "scanning");
  f.notify({ type: "SCAN_PROGRESS", scanned: 3, scroll: 2, candidates: 4 }, { tab: { id: 5 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.match(f.local.job.status, /3 bài .*4 khung .*cuộn 2/);
  const before = f.local.job.status;
  f.notify({ type: "SCAN_PROGRESS", scanned: 9, scroll: 9 }, { tab: { id: 7 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.local.job.status, before);

  const rejected = await f.run({ tabId: 7 });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /Đang có lượt quét/);
  assert.equal(f.tabMessages.filter((m) => m.message.type === "SCAN").length, 1);

  assert.deepEqual(await f.send({ type: "STOP" }), { ok: true });
  assert.deepEqual(f.tabMessages.at(-1), { tabId: 5, message: { type: "STOP_SCAN" } });
  const job = await f.settled();
  assert.equal(job.state, "done");
  assert.equal(f.requests.length, 0);
});

test("a job left running by a dead service worker is treated as stale and can be replaced", async (t) => {
  const f = await fixture(t, {}, () => success(), async () => ({ ok: true, posts: [post(2)] }));
  f.local.job = { state: "filtering", tabId: 9, updatedAt: Date.now() - 3 * 60 * 1000 };
  assert.deepEqual(await f.run(), { ok: true });
  const job = await f.settled();
  assert.equal(job.state, "done");
  assert.equal(job.tabId, 5);
});
