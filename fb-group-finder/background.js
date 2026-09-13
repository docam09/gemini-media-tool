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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "FILTER") return;
  (async () => {
    const settings = await chrome.storage.sync.get(["geminiApiKey", "geminiModel", "readImages", "readComments"]);
    const { geminiApiKey, geminiModel } = settings;
    if (!geminiApiKey) throw new Error("Chưa nhập Gemini API key (mở phần Cài đặt).");
    const model = resolveModel(geminiModel);
    if (model !== geminiModel) await chrome.storage.sync.set({ geminiModel: model });
    const readImages = settings.readImages !== false;
    const readComments = settings.readComments !== false;
    const posts = msg.posts.map((post) => ({
      ...post,
      images: readImages && Array.isArray(post.images) ? post.images : [],
      comments: readComments && Array.isArray(post.comments) ? post.comments : [],
    }));
    const stats = { imagesSent: 0, imagesSkipped: 0, comments: posts.reduce((sum, post) => sum + post.comments.length, 0) };
    const chunk = posts.some((post) => post.images.length) ? IMAGE_BATCH : TEXT_BATCH;
    const all = [];
    for (let i = 0; i < posts.length; i += chunk) {
      const part = await attachImages(posts.slice(i, i + chunk), stats);
      all.push(...(await callGemini({ apiKey: geminiApiKey, model, query: msg.query, posts: part })));
    }
    all.sort((a, b) => (b.score || 0) - (a.score || 0));
    sendResponse({ ok: true, results: all, stats });
  })().catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
