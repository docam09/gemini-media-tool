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
      onMessage: { addListener: () => {} },
      sendMessage: async () => { filterCalls++; },
    },
    tabs: {
      query: async () => [{ id: 5, url: "https://www.facebook.com/groups/123/" }],
      sendMessage: async (_tab, message) => message.type === "PING" ? { isGroup: true } : {
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
