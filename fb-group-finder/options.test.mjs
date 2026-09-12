import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("./options.html", import.meta.url), "utf8");
let sequence = 0;

async function fixture(t, settings = {}) {
  const dom = new JSDOM(html);
  const storage = { ...settings };
  const writes = [];
  globalThis.document = dom.window.document;
  globalThis.chrome = { storage: { sync: {
    get: async () => ({ ...storage }),
    set: async (values) => { writes.push(values); Object.assign(storage, values); },
  } } };
  t.mock.method(globalThis, "setTimeout", () => 0);
  t.after(() => {
    delete globalThis.document;
    delete globalThis.chrome;
    dom.window.close();
  });
  await import(`./options.js?test=${++sequence}`);
  const document = dom.window.document;
  return {
    document, storage, writes,
    model: document.querySelector("#model"),
    save: () => document.querySelector("#save").onclick(),
  };
}

test("opens legacy settings with the migrated model and saves without losing the key", async (t) => {
  const f = await fixture(t, { geminiModel: "gemini-2.5-flash", geminiApiKey: "test-api-key" });
  assert.equal(f.model.value, "gemini-3.6-flash");
  assert.equal(f.document.querySelector("#key").value, "test-api-key");
  await f.save();
  assert.deepEqual(f.storage, { geminiModel: "gemini-3.6-flash", geminiApiKey: "test-api-key" });
  assert.equal(f.document.querySelector("#msg").textContent, "Đã lưu.");
});

test("uses the same default for new settings and a cleared model field", async (t) => {
  const f = await fixture(t);
  assert.equal(f.model.value, "gemini-3.6-flash");
  f.model.value = "";
  await f.save();
  assert.equal(f.storage.geminiModel, "gemini-3.6-flash");
});

test("preserves a custom model missing from the suggestions and accepts a models/ prefix", async (t) => {
  const f = await fixture(t, { geminiModel: "gemini-2.5-pro" });
  assert.equal(f.model.value, "gemini-2.5-pro");
  f.model.value = " models/gemini-3.6-flash ";
  await f.save();
  assert.equal(f.model.value, "gemini-3.6-flash");
  assert.equal(f.storage.geminiModel, "gemini-3.6-flash");
});

test("shows invalid model errors without persisting invalid settings", async (t) => {
  const f = await fixture(t);
  f.model.value = "https://example.com/model";
  await f.save();
  assert.match(f.document.querySelector("#msg").textContent, /Tên model không hợp lệ/);
  assert.equal(f.writes.length, 0);
});

test("loads both entry points as modules for their shared model resolver", () => {
  const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.background.type, "module");
  assert.match(html, /<script type="module" src="options.js"><\/script>/);
});
