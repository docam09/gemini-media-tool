import { FormEvent, useMemo, useState } from "react";

type Suggestion = {
  text: string;
  rationale: string;
};

type ApiResponse = {
  suggestions: Suggestion[];
  safety_note: string;
};

type ContextResponse = {
  extracted_text: string;
  note: string;
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
  const [isReadingUrl, setIsReadingUrl] = useState(false);
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false);
  const [contextNote, setContextNote] = useState("");

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

  function appendContext(extractedText: string, note: string) {
    setForm((current) => ({
      ...current,
      postText: [current.postText.trim(), extractedText.trim()]
        .filter(Boolean)
        .join("\n\n")
    }));
    setContextNote(note);
  }

  async function readPostUrl() {
    if (!form.postUrl.trim()) {
      setError("Nhập Facebook post URL trước.");
      return;
    }

    setError("");
    setContextNote("");
    setIsReadingUrl(true);

    try {
      const response = await fetch(
        `/api/url-context?url=${encodeURIComponent(form.postUrl.trim())}`
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Không đọc được nội dung URL.");
      }

      const data = (await response.json()) as ContextResponse;
      appendContext(data.extracted_text, data.note);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Không đọc được nội dung URL."
      );
    } finally {
      setIsReadingUrl(false);
    }
  }

  async function analyzeMedia(file: File | undefined) {
    if (!file) {
      return;
    }

    setError("");
    setContextNote("");
    setIsAnalyzingMedia(true);

    const payload = new FormData();
    payload.append("file", file);

    try {
      const response = await fetch("/api/media-context", {
        method: "POST",
        body: payload
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Không phân tích được media.");
      }

      const data = (await response.json()) as ContextResponse;
      appendContext(data.extracted_text, data.note);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Không phân tích được media."
      );
    } finally {
      setIsAnalyzingMedia(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Human-reviewed Facebook replies</p>
          <h1>Gợi ý bình luận Facebook để bạn duyệt thủ công</h1>
          <p className="hero-copy">
            Dán link công khai, nội dung bài viết, hoặc upload ảnh/video có chữ
            để Gemini nắm ngữ cảnh và tạo vài bình luận tự nhiên. Tool không
            bypass Facebook login và không tự đăng bình luận.
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
        <button
          className="secondary"
          disabled={!form.postUrl.trim() || isReadingUrl}
          type="button"
          onClick={() => void readPostUrl()}
        >
          {isReadingUrl ? "Đang đọc URL..." : "Đọc nội dung công khai từ URL"}
        </button>

        <label>
          Ảnh/video/screenshot bài viết
          <input
            accept="image/*,video/*"
            type="file"
            onChange={(event) => void analyzeMedia(event.target.files?.[0])}
          />
        </label>
        {isAnalyzingMedia && (
          <p className="context-note">Gemini đang đọc chữ/ngữ cảnh trong media...</p>
        )}
        {contextNote && <p className="context-note">{contextNote}</p>}

        <label>
          Nội dung bài viết / nội dung đã nhận diện
          <textarea
            placeholder="Dán nội dung, đọc URL công khai, hoặc upload media để Gemini tự điền ngữ cảnh..."
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
