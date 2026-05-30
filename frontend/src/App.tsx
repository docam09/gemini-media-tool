import { FormEvent, useMemo, useState } from "react";

type Suggestion = {
  text: string;
  rationale: string;
};

type ApiResponse = {
  suggestions: Suggestion[];
  safety_note: string;
};

type FormState = {
  postUrl: string;
  postText: string;
  tone: string;
  language: string;
  relationshipContext: string;
  extraGuidance: string;
  suggestionCount: number;
};

const initialForm: FormState = {
  postUrl: "",
  postText: "",
  tone: "friendly",
  language: "Vietnamese",
  relationshipContext: "",
  extraGuidance: "",
  suggestionCount: 3
};

function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [safetyNote, setSafetyNote] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(form.postUrl.trim() || form.postText.trim()),
    [form.postText, form.postUrl]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuggestions([]);
    setSafetyNote("");
    setCopiedIndex(null);
    setIsLoading(true);

    const payload = {
      post_text: form.postText.trim(),
      post_url: form.postUrl.trim() || null,
      tone: form.tone.trim(),
      language: form.language.trim(),
      relationship_context: form.relationshipContext.trim(),
      extra_guidance: form.extraGuidance.trim(),
      suggestion_count: form.suggestionCount
    };

    try {
      const response = await fetch("/api/comment-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Could not generate suggestions.");
      }

      const data = (await response.json()) as ApiResponse;
      setSuggestions(data.suggestions);
      setSafetyNote(data.safety_note);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected error while generating suggestions."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copySuggestion(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Human-reviewed Facebook replies</p>
          <h1>Gợi ý bình luận Facebook để bạn duyệt thủ công</h1>
          <p className="hero-copy">
            Dán nội dung bài viết hoặc link bài viết, chọn giọng văn, rồi để
            Gemini tạo vài bình luận tự nhiên. Tool không đọc feed bạn bè và
            không tự đăng bình luận.
          </p>
        </div>
        <div className="policy-card">
          <strong>Compliant workflow</strong>
          <span>
            Bạn luôn là người quyết định comment cuối cùng. Nếu cần tự động hóa
            Page, chỉ nên dùng cho Page bạn quản trị và quyền Meta được duyệt.
          </span>
        </div>
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <label>
          Facebook post URL
          <input
            type="url"
            placeholder="https://www.facebook.com/..."
            value={form.postUrl}
            onChange={(event) =>
              setForm((current) => ({ ...current, postUrl: event.target.value }))
            }
          />
        </label>

        <label>
          Nội dung bài viết
          <textarea
            placeholder="Dán nội dung bài viết ở đây để Gemini hiểu ngữ cảnh..."
            rows={8}
            value={form.postText}
            onChange={(event) =>
              setForm((current) => ({ ...current, postText: event.target.value }))
            }
          />
        </label>

        <div className="grid">
          <label>
            Giọng văn
            <select
              value={form.tone}
              onChange={(event) =>
                setForm((current) => ({ ...current, tone: event.target.value }))
              }
            >
              <option value="friendly">Thân thiện</option>
              <option value="warm">Ấm áp</option>
              <option value="funny">Vui vẻ</option>
              <option value="professional">Lịch sự/chuyên nghiệp</option>
              <option value="supportive">Động viên</option>
            </select>
          </label>

          <label>
            Ngôn ngữ
            <select
              value={form.language}
              onChange={(event) =>
                setForm((current) => ({ ...current, language: event.target.value }))
              }
            >
              <option value="Vietnamese">Tiếng Việt</option>
              <option value="Korean">한국어</option>
              <option value="English">English</option>
              <option value="Vietnamese and Korean">Việt + Hàn</option>
            </select>
          </label>

          <label>
            Số gợi ý
            <input
              min={1}
              max={5}
              type="number"
              value={form.suggestionCount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  suggestionCount: Number(event.target.value)
                }))
              }
            />
          </label>
        </div>

        <label>
          Quan hệ/ngữ cảnh
          <input
            placeholder="Ví dụ: bạn thân, đồng nghiệp, người quen..."
            value={form.relationshipContext}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                relationshipContext: event.target.value
              }))
            }
          />
        </label>

        <label>
          Yêu cầu thêm
          <input
            placeholder="Ví dụ: ngắn gọn, không dùng emoji, hỏi thăm nhẹ..."
            value={form.extraGuidance}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                extraGuidance: event.target.value
              }))
            }
          />
        </label>

        <button disabled={!canSubmit || isLoading} type="submit">
          {isLoading ? "Đang tạo gợi ý..." : "Tạo gợi ý bình luận"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {suggestions.length > 0 && (
        <section className="results">
          <div className="results-header">
            <h2>Gợi ý</h2>
            {form.postUrl && (
              <a href={form.postUrl} target="_blank" rel="noreferrer">
                Mở bài viết
              </a>
            )}
          </div>
          <p className="safety">{safetyNote}</p>
          <div className="suggestion-list">
            {suggestions.map((suggestion, index) => (
              <article className="suggestion-card" key={`${suggestion.text}-${index}`}>
                <p>{suggestion.text}</p>
                <small>{suggestion.rationale}</small>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void copySuggestion(suggestion.text, index)}
                >
                  {copiedIndex === index ? "Đã copy" : "Copy"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
