const $ = (id) => document.getElementById(id);
/** @type {HTMLTextAreaElement} */
const queryInput = document.querySelector("#query");
/** @type {HTMLInputElement} */
const maxPostsInput = document.querySelector("#maxPosts");
/** @type {HTMLButtonElement} */
const runButton = document.querySelector("#run");
/** @type {HTMLButtonElement} */
const stopButton = document.querySelector("#stop");
/** @type {HTMLButtonElement} */
const diagnoseButton = document.querySelector("#diagnose");
let lastResults = [];
let scanningTabId = null;

$("openOptions").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

chrome.storage.local.get(["lastQuery", "maxPosts"]).then((s) => {
  if (s.lastQuery) queryInput.value = s.lastQuery;
  if (s.maxPosts) maxPostsInput.value = s.maxPosts;
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "SCAN_PROGRESS") return;
  $("status").textContent = `Đọc Facebook: ${msg.scanned} bài · ${msg.candidates || 0} khung · thiếu link ${msg.missingLinks || 0}, thiếu nội dung ${msg.missingText || 0} · cuộn ${msg.scroll}. Chưa gọi Gemini.`;
  if (sender?.tab?.id) {
    scanningTabId = sender.tab.id;
    stopButton.disabled = false;
  }
});

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContent(tabId) {
  let ping;
  try {
    ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
  }
  if (ping?.version !== chrome.runtime.getManifest().version) throw new Error("Tab Facebook đang chạy bản cũ. Hãy bấm F5 trên tab Facebook rồi thử lại.");
  return ping;
}

stopButton.onclick = async () => {
  stopButton.disabled = true;
  try {
    const tabId = scanningTabId ?? (await getTab())?.id;
    if (tabId) await chrome.tabs.sendMessage(tabId, { type: "STOP_SCAN" });
  } catch {
    $("error").textContent = "Không liên lạc được với tab Facebook. Bấm F5 trên tab để dừng quét.";
  }
};

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

diagnoseButton.onclick = async () => {
  diagnoseButton.disabled = true;
  try {
    const tab = await getTab();
    if (!tab?.url?.startsWith("https://www.facebook.com/")) throw new Error("Hãy mở nhóm Facebook trước khi tải chẩn đoán.");
    await ensureContent(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "DIAGNOSE" });
    if (!result?.ok) throw new Error("Không lấy được chẩn đoán. Tải lại tab Facebook và thử lại.");
    download(new Blob([JSON.stringify(result.report, null, 2)], { type: "application/json" }), "fb-group-diagnostic.json");
    $("diagnosticStatus").textContent = "Đã tải báo cáo chẩn đoán. Gửi file này để kiểm tra lỗi đọc Facebook.";
  } catch (error) {
    $("diagnosticStatus").textContent = error.message;
  } finally {
    diagnoseButton.disabled = false;
  }
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render(results) {
  const box = $("results");
  box.innerHTML = "";
  if (!results.length) { box.innerHTML = "<p>Không tìm thấy bài phù hợp.</p>"; return; }
  for (const r of results) {
    const ex = Object.entries(r.extracted || {}).map(([k, v]) => `<span><b>${esc(k)}</b>: ${esc(v)}</span>`).join("");
    box.insertAdjacentHTML("beforeend", `
      <div class="card">
        <span class="score">${Math.round((r.score || 0) * 100)}%</span>
        <div class="meta">${esc(r.author)} ${r.time ? "· " + esc(r.time) : ""}</div>
        <div>${esc(r.summary)}</div>
        <div class="extract">${ex}</div>
        <a href="${esc(r.url)}" target="_blank">Mở bài viết ↗</a>
        <details><summary>Nội dung gốc</summary><pre>${esc(r.text)}</pre></details>
      </div>`);
  }
}

runButton.onclick = async () => {
  const query = queryInput.value.trim();
  const maxPosts = Math.min(300, Math.max(1, Math.floor(Number(maxPostsInput.value) || 60)));
  maxPostsInput.value = String(maxPosts);
  $("error").textContent = "";
  $("results").innerHTML = "";
  $("tools").style.display = "none";
  if (!query) { $("error").textContent = "Nhập yêu cầu tìm kiếm trước."; return; }
  chrome.storage.local.set({ lastQuery: query, maxPosts });

  const tab = await getTab();
  if (!tab?.url?.startsWith("https://www.facebook.com/")) {
    $("error").textContent = "Hãy mở một nhóm Facebook (www.facebook.com/groups/...) rồi bấm lại.";
    return;
  }
  runButton.disabled = true;
  try {
    const ping = await ensureContent(tab.id);
    if (!ping?.isGroup) throw new Error("Hãy mở trang một nhóm Facebook rồi quét lại.");
    scanningTabId = tab.id;
    stopButton.disabled = false;
    $("status").textContent = "Đang đọc Facebook. Chưa gọi Gemini.";

    const scan = await chrome.tabs.sendMessage(tab.id, { type: "SCAN", opts: { maxPosts, maxScrolls: Math.max(6, Math.min(120, maxPosts * 2)) } });
    stopButton.disabled = true;
    if (!scan?.ok) throw new Error(scan?.error || "Quét thất bại");
    if (scan.canceled) {
      $("status").textContent = `Đã dừng quét (${scan.posts.length} bài đã đọc). Chưa gọi Gemini.`;
      return;
    }
    if (!scan.posts.length) {
      const d = scan.diagnostics;
      const detail = d ? ` Nhận diện ${d.candidates} khung bài; ${d.missingLinks} thiếu link, ${d.missingText} thiếu nội dung; đã cuộn ${d.scrolls} lần.` : "";
      throw new Error(`Chưa đọc được bài có nội dung và link.${detail} Gemini chưa được gọi. Nếu vừa cập nhật extension, hãy tải lại tab Facebook. Bấm “Tải chẩn đoán” và gửi báo cáo để kiểm tra cấu trúc trang.`);
    }
    $("status").textContent = `Đã đọc ${scan.posts.length} bài. Đang nhờ Gemini lọc...`;

    const filt = await chrome.runtime.sendMessage({ type: "FILTER", query, posts: scan.posts });
    if (!filt?.ok) throw new Error(filt?.error || "Lọc thất bại");
    lastResults = filt.results;
    $("status").textContent = `Xong: ${filt.results.length}/${scan.posts.length} bài phù hợp.`;
    render(filt.results);
    $("tools").style.display = filt.results.length ? "flex" : "none";
  } catch (e) {
    $("error").textContent = e.message || String(e);
    $("status").textContent = "";
  } finally {
    runButton.disabled = false;
    stopButton.disabled = true;
    scanningTabId = null;
  }
};

$("copy").onclick = () => {
  const txt = lastResults.map((r) => `- ${r.summary}\n  ${r.url}`).join("\n");
  navigator.clipboard.writeText(txt);
  $("status").textContent = "Đã copy.";
};

$("csv").onclick = () => {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["score", "author", "time", "summary", "extracted", "url"]];
  for (const r of lastResults) rows.push([r.score, r.author, r.time, r.summary, JSON.stringify(r.extracted), r.url]);
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fb-group-results.csv";
  a.click();
};
