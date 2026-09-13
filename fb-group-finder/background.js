import { DEFAULT_MODEL, resolveModel } from "./gemini-model.js";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_IMAGE_BYTES = 12 * 1024 * 1024;
const TEXT_BATCH = 25;
const IMAGE_BATCH = 8;

function describePost(post, index) {
  const header = `### [${index}] ${post.author || ""} ${post.time ? "(" + post.time + ")" : ""}`.trimEnd();
  const lines = [header, post.text || "(bài không có chữ, xem ảnh đính kèm)"];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  if (comments.length) {
    lines.push(`Bình luận đang hiển thị (${comments.length}):`);
    for (const comment of comments) lines.push(`- ${comment.author ? comment.author + ": " : ""}${comment.text}`);
  }
  if (post.imageParts?.length) lines.push(`Ảnh đính kèm: ${post.imageParts.length} (xem các ảnh gắn nhãn [${index}] bên dưới)`);
  return lines.join("\n");
}

function buildPrompt(query, posts) {
  return `Bạn là trợ lý lọc bài đăng trong nhóm Facebook.
Yêu cầu của người dùng: """${query}"""

Dưới đây là danh sách bài đăng, mỗi bài có chỉ số [i]. Mỗi bài có thể kèm bình luận đang hiển thị và ảnh đính kèm (ảnh được gửi sau phần chữ, mỗi ảnh có nhãn chỉ số bài).
Hãy chọn những bài THỰC SỰ phù hợp với yêu cầu, dựa trên cả nội dung bài, chữ trong ảnh (giá, địa chỉ, số điện thoại trên ảnh...) và bình luận (VD người bán trả lời giá trong bình luận).
Với mỗi bài phù hợp, trích xuất thông tin người dùng cần (giá, địa điểm, liên hệ, số lượng, thời gian... tuỳ yêu cầu). Ghi rõ trong summary nếu thông tin lấy từ ảnh hoặc bình luận.

Trả về JSON đúng schema:
{"results":[{"index":0,"score":0.0,"summary":"tóm tắt 1-2 câu","extracted":{"key":"value"}}]}
score từ 0..1 là mức độ phù hợp; chỉ đưa vào bài có score >= 0.5. Sắp xếp giảm dần theo score. Không bịa thông tin không có trong bài, ảnh hay bình luận.

${posts.map(describePost).join("\n\n")}`;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function imageOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(?:^|\.)fbcdn\.net$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function fetchImage(url, stats) {
  if (!imageOrigin(url)) {
    stats.imagesSkipped++;
    return null;
  }
  try {
    const res = await fetch(url, { credentials: "omit" });
    const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !IMAGE_TYPES.includes(mimeType)) throw new Error("unsupported image");
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("image too large");
    return { mimeType, bytes: buffer.byteLength, data: toBase64(buffer) };
  } catch {
    stats.imagesSkipped++;
    return null;
  }
}

async function attachImages(posts, stats) {
  let budget = MAX_REQUEST_IMAGE_BYTES;
  const prepared = [];
  for (const post of posts) {
    const imageParts = [];
    for (const url of Array.isArray(post.images) ? post.images : []) {
      const image = await fetchImage(url, stats);
      if (!image) continue;
      if (image.bytes > budget) {
        stats.imagesSkipped++;
        continue;
      }
      budget -= image.bytes;
      imageParts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    stats.imagesSent += imageParts.length;
    prepared.push({ ...post, imageParts });
  }
  return prepared;
}

async function callGemini({ apiKey, model, query, posts }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: buildPrompt(query, posts) }];
  posts.forEach((post, index) => {
    for (const part of post.imageParts || []) {
      parts.push({ text: `Ảnh của bài [${index}]:` }, part);
    }
  });
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = (await res.text()).replaceAll(apiKey, "[ẩn API key]").slice(0, 300);
    const guidance = res.status === 404
      ? `Model ${model} không khả dụng với API key này. Mở Cài đặt để đổi model (mặc định: ${DEFAULT_MODEL}). `
      : "";
    throw new Error(`Gemini ${res.status}: ${guidance}${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { results: [] };
  }
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  return results
    .filter((r) => Number.isInteger(r.index) && posts[r.index])
    .map((r) => {
      const post = { ...posts[r.index], score: r.score ?? 0, summary: r.summary || "", extracted: r.extracted || {} };
      delete post.imageParts;
      return post;
    });
}

async function filterPosts(query, rawPosts) {
  const settings = await chrome.storage.sync.get(["geminiApiKey", "geminiModel", "readImages", "readComments"]);
  const { geminiApiKey, geminiModel } = settings;
  if (!geminiApiKey) throw new Error("Chưa nhập Gemini API key (mở phần Cài đặt).");
  const model = resolveModel(geminiModel);
  if (model !== geminiModel) await chrome.storage.sync.set({ geminiModel: model });
  const readImages = settings.readImages !== false;
  const readComments = settings.readComments !== false;
  const posts = rawPosts.map((post) => ({
    ...post,
    images: readImages && Array.isArray(post.images) ? post.images : [],
    comments: readComments && Array.isArray(post.comments) ? post.comments : [],
  }));
  const stats = { imagesSent: 0, imagesSkipped: 0, comments: posts.reduce((sum, post) => sum + post.comments.length, 0) };
  const chunk = posts.some((post) => post.images.length) ? IMAGE_BATCH : TEXT_BATCH;
  const all = [];
  for (let i = 0; i < posts.length; i += chunk) {
    const part = await attachImages(posts.slice(i, i + chunk), stats);
    all.push(...(await callGemini({ apiKey: geminiApiKey, model, query, posts: part })));
  }
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { results: all, stats };
}

// The whole scan+filter job runs here and its state lives in chrome.storage.local, so closing the
// popup (switching tabs) neither aborts the job nor loses the results.
const JOB_KEY = "job";
const JOB_STALE_MS = 2 * 60 * 1000;
const KEEP_ALIVE_MS = 20 * 1000;
const RUNNING = ["scanning", "filtering"];

async function getJob() {
  return (await chrome.storage.local.get(JOB_KEY))[JOB_KEY] || null;
}

let jobQueue = Promise.resolve();

function writeJob(compute) {
  const next = jobQueue.then(async () => {
    const current = await getJob();
    const updated = compute(current);
    if (!updated) return current;
    const job = { ...updated, updatedAt: Date.now() };
    await chrome.storage.local.set({ [JOB_KEY]: job });
    return job;
  });
  jobQueue = next.catch(() => {});
  return next;
}

const patchJob = (patch) => writeJob((job) => ({ ...(job || {}), ...patch }));

function isRunning(job) {
  return !!job && RUNNING.includes(job.state) && Date.now() - (job.updatedAt || 0) < JOB_STALE_MS;
}

async function runJob({ tabId, query, maxPosts, maxScrolls, groupTitle }) {
  const keepAlive = setInterval(() => patchJob({}).catch(() => {}), KEEP_ALIVE_MS);
  try {
    await writeJob(() => ({
      state: "scanning", tabId, query, groupTitle, maxPosts, startedAt: Date.now(),
      status: "Đang đọc Facebook. Chưa gọi Gemini.", results: [],
    }));
    const scan = await chrome.tabs.sendMessage(tabId, { type: "SCAN", opts: { maxPosts, maxScrolls } });
    if (!scan?.ok) throw new Error(scan?.error || "Quét thất bại");
    if (scan.canceled) {
      await patchJob({ state: "done", status: `Đã dừng quét (${scan.posts.length} bài đã đọc). Chưa gọi Gemini.`, results: [], finishedAt: Date.now() });
      return;
    }
    if (!scan.posts.length) {
      const d = scan.diagnostics;
      const detail = d ? ` Nhận diện ${d.candidates} khung bài; ${d.missingLinks} thiếu link, ${d.missingText} thiếu nội dung; đã cuộn ${d.scrolls} lần.` : "";
      throw new Error(`Chưa đọc được bài có nội dung và link.${detail} Gemini chưa được gọi. Nếu vừa cập nhật extension, hãy tải lại tab Facebook. Bấm “Tải chẩn đoán” và gửi báo cáo để kiểm tra cấu trúc trang.`);
    }
    const d = scan.diagnostics || {};
    await patchJob({ state: "filtering", scanned: scan.posts.length, status: `Đã đọc ${scan.posts.length} bài (${d.images || 0} ảnh, ${d.comments || 0} bình luận). Đang tải ảnh và nhờ Gemini lọc...` });
    const { results, stats } = await filterPosts(query, scan.posts);
    const skipped = stats.imagesSkipped ? `, bỏ ${stats.imagesSkipped} ảnh không tải được` : "";
    await patchJob({
      state: "done", results, stats, finishedAt: Date.now(),
      status: `Xong: ${results.length}/${scan.posts.length} bài phù hợp (Gemini đã xem ${stats.imagesSent || 0} ảnh, ${stats.comments || 0} bình luận${skipped}).`,
    });
  } catch (e) {
    await patchJob({ state: "error", error: e.message || String(e), status: "", finishedAt: Date.now() });
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FILTER") {
    filterPosts(msg.query, msg.posts)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg?.type === "RUN") {
    getJob().then((job) => {
      if (isRunning(job)) {
        sendResponse({ ok: false, error: "Đang có lượt quét chạy. Bấm Dừng hoặc chờ lượt quét kết thúc." });
        return;
      }
      runJob(msg);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "STOP") {
    getJob()
      .then((job) => (isRunning(job) && job.tabId ? chrome.tabs.sendMessage(job.tabId, { type: "STOP_SCAN" }) : null))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg?.type === "SCAN_PROGRESS" && sender?.tab?.id) {
    writeJob((job) => job?.state === "scanning" && job.tabId === sender.tab.id ? {
      ...job,
      scanned: msg.scanned,
      status: `Đọc Facebook: ${msg.scanned} bài (${msg.images || 0} ảnh, ${msg.comments || 0} bình luận) · ${msg.candidates || 0} khung · thiếu link ${msg.missingLinks || 0}, thiếu nội dung ${msg.missingText || 0} · cuộn ${msg.scroll}. Chưa gọi Gemini.`,
    } : null).catch(() => {});
  }
});
