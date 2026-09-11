const $ = (id) => document.getElementById(id);
let lastResults = [];

$("openOptions").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

chrome.storage.local.get(["lastQuery", "maxPosts"]).then((s) => {
  if (s.lastQuery) $("query").value = s.lastQuery;
  if (s.maxPosts) $("maxPosts").value = s.maxPosts;
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SCAN_PROGRESS") $("status").textContent = `Đang cuộn đọc bài... ${msg.scanned} bài (lần cuộn ${msg.scroll})`;
});

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContent(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "PING" });
  }
}

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

$("run").onclick = async () => {
  const query = $("query").value.trim();
  const maxPosts = Number($("maxPosts").value) || 60;
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
  $("run").disabled = true;
  try {
    const ping = await ensureContent(tab.id);
    if (!ping?.isGroup) $("status").textContent = "Lưu ý: tab này không phải trang nhóm, vẫn thử quét feed hiện tại...";
    else $("status").textContent = "Bắt đầu quét...";

    const scan = await chrome.tabs.sendMessage(tab.id, { type: "SCAN", opts: { maxPosts, maxScrolls: Math.ceil(maxPosts / 2) } });
    if (!scan?.ok) throw new Error(scan?.error || "Quét thất bại");
    if (!scan.posts.length) throw new Error("Không đọc được bài nào. Cuộn trang xuống một chút rồi thử lại.");
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
    $("run").disabled = false;
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
