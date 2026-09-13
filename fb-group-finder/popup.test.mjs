import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("./popup.html", import.meta.url), "utf8");
const source = readFileSync(new URL("./popup.js", import.meta.url), "utf8");
const { version } = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));

const tick = () => new Promise((r) => setTimeout(r, 5));
const result = (id, extra = {}) => ({
  url: `https://www.facebook.com/groups/123/posts/${id}/`, text: `Tiger ${id}`, author: "Seller", score: 0.9,
  summary: `Nồi ${id}`, extracted: { price: "900k" }, ...extra,
});

async function popup(t, { local = {}, tab = { id: 5, url: "https://www.facebook.com/groups/123/" }, onTab, onRuntime } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const runtimeMessages = [];
  const tabMessages = [];
  const storageListeners = [];
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([keys].flat().filter((k) => k in local).map((k) => [k, local[k]])),
        set: async (values) => { Object.assign(local, values); },
        remove: async (key) => { delete local[key]; },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      getManifest: () => ({ version }),
      onMessage: { addListener: () => {} },
      sendMessage: async (message) => { runtimeMessages.push(JSON.parse(JSON.stringify(message))); return onRuntime ? onRuntime(message) : { ok: true }; },
    },
    tabs: {
      query: async () => [tab],
      sendMessage: async (_tab, message) => {
        tabMessages.push(message);
        if (onTab) return onTab(message);
        return message.type === "PING" ? { ok: true, isGroup: true, version, title: "Nhóm test | Facebook" } : { ok: true };
      },
    },
  };
  window.eval(source);
  await tick();
  const $ = (id) => window.document.getElementById(id);
  return {
    window, $, local, runtimeMessages, tabMessages,
    text: (id) => $(id).textContent,
    visible: (id) => $(id).style.display !== "none",
    change: async (job) => { for (const fn of storageListeners) fn({ job: { newValue: job } }, "local"); await tick(); },
  };
}

test("restores the last finished job with its results, query and tools when reopened", async (t) => {
  const p = await popup(t, { local: {
    lastQuery: "nồi cơm Tiger", maxPosts: 7,
    job: { state: "done", query: "nồi cơm Tiger", groupTitle: "Chợ Yên Phong", status: "Xong: 2/9 bài phù hợp", finishedAt: Date.now(), updatedAt: Date.now(), results: [result(1), result(2, { comments: [{ author: "A", text: "850k" }] })] },
  } });
  assert.equal(p.$("query").value, "nồi cơm Tiger");
  assert.equal(p.$("maxPosts").value, "7");
  assert.equal(p.text("status"), "Xong: 2/9 bài phù hợp");
  assert.match(p.text("resultsHeader"), /Kết quả cho “nồi cơm Tiger” · Chợ Yên Phong/);
  const links = [...p.window.document.querySelectorAll("#results a")].map((a) => a.href);
  assert.deepEqual(links, [result(1).url, result(2).url]);
  assert.match(p.text("results"), /1 bình luận/);
  assert.equal(p.visible("tools"), true);
  assert.equal(p.visible("clear"), true);
  assert.equal(p.$("run").disabled, false);
  assert.equal(p.$("stop").disabled, true);
  assert.equal(p.tabMessages.length, 0, "reopening must not touch the Facebook tab");

  await p.$("clear").onclick();
  assert.equal(p.local.job, undefined);
  assert.equal(p.text("results"), "");
  assert.equal(p.visible("tools"), false);
  assert.equal(p.visible("clear"), false);
});

test("starts the job in the background instead of scanning from the popup", async (t) => {
  const p = await popup(t);
  p.$("query").value = "Tiger";
  p.$("maxPosts").value = "2";
  await p.$("run").onclick();
  assert.deepEqual(p.tabMessages.map((m) => m.type), ["PING"]);
  assert.deepEqual(p.runtimeMessages, [{ type: "RUN", tabId: 5, query: "Tiger", maxPosts: 2, groupTitle: "Nhóm test | Facebook", maxScrolls: 6 }]);
  assert.equal(p.local.lastQuery, "Tiger");
  assert.equal(p.$("maxPosts").value, "2");
  assert.match(p.text("status"), /kết quả được giữ lại/);
  assert.equal(p.$("run").disabled, true);
});

test("mirrors background job state: progress, errors with diagnostics, and results", async (t) => {
  const p = await popup(t);
  await p.change({ state: "scanning", updatedAt: Date.now(), status: "Đọc Facebook: 3 bài · cuộn 2. Chưa gọi Gemini." });
  assert.match(p.text("status"), /3 bài/);
  assert.equal(p.$("run").disabled, true);
  assert.equal(p.$("stop").disabled, false);
  assert.equal(p.visible("clear"), false);

  await p.change({ state: "error", updatedAt: Date.now(), error: "Chưa đọc được bài có nội dung và link. Nhận diện 8 khung bài; 8 thiếu link, 2 thiếu nội dung; đã cuộn 12 lần." });
  assert.match(p.text("error"), /8 khung bài/);
  assert.match(p.text("error"), /12 lần/);
  assert.equal(p.$("run").disabled, false);
  assert.equal(p.$("stop").disabled, true);
  assert.equal(p.visible("clear"), true);

  await p.change({ state: "done", updatedAt: Date.now(), query: "Tiger", status: "Xong: 1/3 bài phù hợp", results: [result(1)] });
  assert.equal(p.text("error"), "");
  assert.equal(p.window.document.querySelectorAll("#results .card").length, 1);
  assert.equal(p.visible("tools"), true);

  await p.change({ state: "done", updatedAt: Date.now(), query: "Tiger", status: "Đã dừng quét (2 bài đã đọc). Chưa gọi Gemini.", results: [] });
  assert.match(p.text("results"), /Không tìm thấy bài phù hợp/);
  assert.equal(p.visible("tools"), false);
});

test("Stop is forwarded to the background job", async (t) => {
  const p = await popup(t);
  await p.change({ state: "scanning", updatedAt: Date.now(), status: "Đang đọc Facebook." });
  await p.$("stop").onclick();
  assert.deepEqual(p.runtimeMessages, [{ type: "STOP" }]);
  assert.equal(p.$("stop").disabled, true);
  assert.equal(p.text("error"), "");
});

test("a running job whose service worker died is shown as interrupted and lets the user scan again", async (t) => {
  const p = await popup(t, { local: { job: { state: "filtering", updatedAt: Date.now() - 3 * 60 * 1000, status: "Đang nhờ Gemini lọc..." } } });
  assert.match(p.text("error"), /bị gián đoạn/);
  assert.equal(p.text("status"), "");
  assert.equal(p.$("run").disabled, false);
  assert.equal(p.$("stop").disabled, true);
});

test("requires refreshing a tab still running an older content script", async (t) => {
  const p = await popup(t, { onTab: (message) => {
    assert.equal(message.type, "PING", "a stale tab must not start scanning");
    return { isGroup: true };
  } });
  p.$("query").value = "Tiger";
  await p.$("run").onclick();
  assert.match(p.text("error"), /F5/);
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.$("run").disabled, false);
});

test("shows the background's refusal when a job is already running", async (t) => {
  const p = await popup(t, { onRuntime: () => ({ ok: false, error: "Đang có lượt quét chạy." }) });
  p.$("query").value = "Tiger";
  await p.$("run").onclick();
  assert.match(p.text("error"), /Đang có lượt quét/);
  assert.equal(p.$("run").disabled, false);
});

test("downloads the diagnostic response without running a scan or calling Gemini", async (t) => {
  let filename;
  let mimeType;
  const p = await popup(t, { onTab: (message) => {
    if (message.type === "PING") return { isGroup: true, version };
    assert.equal(message.type, "DIAGNOSE");
    return { ok: true, report: { candidateCount: 2 } };
  } });
  p.window.URL.createObjectURL = (blob) => { mimeType = blob.type; return "blob:diagnostic"; };
  p.window.URL.revokeObjectURL = () => {};
  p.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  await p.$("diagnose").onclick();
  assert.equal(filename, "fb-group-diagnostic.json");
  assert.equal(mimeType, "application/json");
  assert.match(p.text("diagnosticStatus"), /Đã tải/);
  assert.equal(p.runtimeMessages.length, 0);
});
