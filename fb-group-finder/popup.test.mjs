import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("./popup.html", import.meta.url), "utf8");
const source = readFileSync(new URL("./popup.js", import.meta.url), "utf8");

test("shows scanner diagnostics without calling Gemini when no post was extracted", async (t) => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  let filterCalls = 0;
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: "0.1.2" }),
      onMessage: { addListener: () => {} },
      sendMessage: async () => { filterCalls++; },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => message.type === "PING" ? { isGroup: true, version: "0.1.2" } : {
        ok: true, posts: [], diagnostics: { candidates: 8, missingLinks: 8, missingText: 2, scrolls: 12 },
      },
    },
  };
  window.eval(source);
  window.document.querySelector("#query").value = "nồi cơm điện Tiger dưới 1,5 triệu";
  await window.document.querySelector("#run").onclick();
  const error = window.document.querySelector("#error").textContent;
  assert.match(error, /8 khung bài/);
  assert.match(error, /8 thiếu link, 2 thiếu nội dung/);
  assert.match(error, /12 lần/);
  assert.match(error, /tải lại tab Facebook/i);
  assert.equal(filterCalls, 0);
  assert.equal(window.document.querySelector("#run").disabled, false);
});

test("respects a two-post limit and uses a bounded scroll budget", async (t) => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  let requested;
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: "0.1.2" }),
      onMessage: { addListener: () => {} },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => {
        if (message.type === "PING") return { isGroup: true, version: "0.1.2" };
        requested = message.opts;
        return { ok: true, posts: [] };
      },
    },
  };
  window.eval(source);
  window.document.querySelector("#query").value = "Tiger";
  window.document.querySelector("#maxPosts").value = "2";
  await window.document.querySelector("#run").onclick();
  assert.equal(requested.maxPosts, 2);
  assert.equal(requested.maxScrolls, 6);
  assert.equal(window.document.querySelector("#maxPosts").value, "2");
});

test("stopping a scan never sends partially collected posts to Gemini", async (t) => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  let filterCalls = 0;
  let finishScan;
  let signalScanStarted;
  const scanStarted = new Promise((resolve) => { signalScanStarted = resolve; });
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: "0.1.2" }),
      onMessage: { addListener: () => {} },
      sendMessage: async () => { filterCalls++; },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => {
        if (message.type === "PING") return { isGroup: true, version: "0.1.2" };
        if (message.type === "SCAN") {
          signalScanStarted();
          return new Promise((resolve) => { finishScan = resolve; });
        }
        assert.equal(message.type, "STOP_SCAN");
        finishScan({ ok: true, canceled: true, posts: [{ text: "Tiger" }] });
        return { ok: true };
      },
    },
  };
  window.eval(source);
  window.document.querySelector("#query").value = "Tiger";
  const run = window.document.querySelector("#run").onclick();
  await scanStarted;
  assert.equal(window.document.querySelector("#stop").disabled, false);
  await window.document.querySelector("#stop").onclick();
  await run;
  assert.equal(filterCalls, 0);
  assert.match(window.document.querySelector("#status").textContent, /Đã dừng quét/);
  assert.equal(window.document.querySelector("#run").disabled, false);
});

test("requires refreshing a tab still running an older content script", async (t) => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: "0.1.2" }),
      onMessage: { addListener: () => {} },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => {
        assert.equal(message.type, "PING", "a stale tab must not start scanning");
        return { isGroup: true };
      },
    },
  };
  window.eval(source);
  window.document.querySelector("#query").value = "Tiger";
  await window.document.querySelector("#run").onclick();
  assert.match(window.document.querySelector("#error").textContent, /F5/);
});

test("downloads the diagnostic response without running a scan or calling Gemini", async (t) => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  let filename;
  let mimeType;
  window.URL.createObjectURL = (blob) => { mimeType = blob.type; return "blob:diagnostic"; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  window.chrome = {
    storage: { local: { get: async () => ({}) } },
    runtime: {
      getManifest: () => ({ version: "0.1.2" }),
      onMessage: { addListener: () => {} },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => {
        if (message.type === "PING") return { isGroup: true, version: "0.1.2" };
        assert.equal(message.type, "DIAGNOSE");
        return { ok: true, report: { candidateCount: 2 } };
      },
    },
  };
  window.eval(source);
  await window.document.querySelector("#diagnose").onclick();
  assert.equal(filename, "fb-group-diagnostic.json");
  assert.equal(mimeType, "application/json");
  assert.match(window.document.querySelector("#diagnosticStatus").textContent, /Đã tải/);
});
