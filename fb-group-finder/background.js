// Service worker: calls Gemini to filter scraped posts against the user's query.

const DEFAULT_MODEL = "gemini-2.5-flash";

function buildPrompt(query, posts) {
  const items = posts
    .map((p, i) => `### [${i}] ${p.author || ""} ${p.time ? "(" + p.time + ")" : ""}\n${p.text}`)
    .join("\n\n");
  return `Bạn là trợ lý lọc bài đăng trong nhóm Facebook.
Yêu cầu của người dùng: """${query}"""

Dưới đây là danh sách bài đăng, mỗi bài có chỉ số [i]. Hãy chọn những bài THỰC SỰ phù hợp với yêu cầu.
Với mỗi bài phù hợp, trích xuất thông tin người dùng cần (giá, địa điểm, liên hệ, số lượng, thời gian... tuỳ yêu cầu).

Trả về JSON đúng schema:
{"results":[{"index":0,"score":0.0,"summary":"tóm tắt 1-2 câu","extracted":{"key":"value"}}]}
score từ 0..1 là mức độ phù hợp; chỉ đưa vào bài có score >= 0.5. Sắp xếp giảm dần theo score. Không bịa thông tin không có trong bài.

${items}`;
}

async function callGemini({ apiKey, model, query, posts }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(query, posts) }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  let res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    if (/thinking/i.test(errText)) {
      delete body.generationConfig.thinkingConfig;
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
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
    .map((r) => ({ ...posts[r.index], score: r.score ?? 0, summary: r.summary || "", extracted: r.extracted || {} }));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "FILTER") return;
  (async () => {
    const { geminiApiKey, geminiModel } = await chrome.storage.sync.get(["geminiApiKey", "geminiModel"]);
    if (!geminiApiKey) throw new Error("Chưa nhập Gemini API key (mở phần Cài đặt).");
    const chunk = 25;
    const all = [];
    for (let i = 0; i < msg.posts.length; i += chunk) {
      const part = msg.posts.slice(i, i + chunk);
      all.push(...(await callGemini({ apiKey: geminiApiKey, model: geminiModel, query: msg.query, posts: part })));
    }
    all.sort((a, b) => (b.score || 0) - (a.score || 0));
    sendResponse({ ok: true, results: all });
  })().catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
