"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type ModelInfo, type VideoGeneration } from "@/lib/api";

export default function VideoPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("veo-3.1-generate-preview");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VideoGeneration | null>(null);
  const [progress, setProgress] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    api.getModels().then((m) => setModels(m.video_models)).catch(() => {});
  }, []);

  const pollResult = useCallback(async (id: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      setProgress(`Đang xử lý... (${(i + 1) * 5}s)`);
      try {
        const data = await api.getVideoGeneration(id);
        if (data.status === "completed") {
          setResult(data);
          setLoading(false);
          setProgress("");
          return;
        }
        if (data.status === "failed") {
          setError("Tạo video thất bại. Vui lòng thử lại.");
          setLoading(false);
          setProgress("");
          return;
        }
      } catch {
        // continue polling
      }
    }
    setError("Hết thời gian chờ (10 phút). Vui lòng thử lại.");
    setLoading(false);
    setProgress("");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);
    setProgress("Đang gửi yêu cầu...");

    try {
      const res = await api.generateVideo({
        prompt: prompt.trim(),
        model,
        aspect_ratio: aspectRatio,
      });
      setProgress("Video đang được tạo... (có thể mất 1-3 phút)");
      await pollResult(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-white">Tạo Video</h1>
      <p className="mt-2 text-zinc-400">
        Nhập mô tả để tạo video với Veo 3.1
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Mô tả video
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="VD: Cảnh quay drone bay qua thành phố Tokyo vào ban đêm, ánh đèn neon phản chiếu trên mặt đường ướt..."
            />
            <p className="mt-2 text-xs text-zinc-500">
              Tip: Mô tả càng chi tiết, video càng đẹp. Bao gồm phong cách
              camera, ánh sáng, âm thanh.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} - {m.description}
                  {m.cost_per_second
                    ? ` ($${m.cost_per_second}/giây)`
                    : ""}
                </option>
              ))}
              {models.length === 0 && (
                <>
                  <option value="veo-3.1-generate-preview">
                    Veo 3.1 Generate ($0.40/giây)
                  </option>
                  <option value="veo-3.1-fast-preview">
                    Veo 3.1 Fast ($0.15/giây)
                  </option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Tỉ lệ khung hình
            </label>
            <div className="mt-2 flex gap-3">
              {[
                { value: "16:9", label: "Ngang (16:9)" },
                { value: "9:16", label: "Dọc (9:16)" },
              ].map((ar) => (
                <button
                  key={ar.value}
                  type="button"
                  onClick={() => setAspectRatio(ar.value)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    aspectRatio === ar.value
                      ? "border-violet-500 bg-violet-600/10 text-violet-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {progress || "Đang tạo..."}
              </span>
            ) : (
              "Tạo Video"
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-xs text-zinc-500">
              <strong className="text-zinc-400">Lưu ý:</strong> Video tạo ra dài
              ~8 giây. Thời gian xử lý: 1-3 phút. Chi phí ước tính:{" "}
              {model === "veo-3.1-fast-preview" ? "$1.20" : "$3.20"}/video.
            </p>
          </div>
        </form>

        {/* Results */}
        <div className="space-y-4">
          {loading && !result && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 p-16">
              <svg
                className="h-12 w-12 animate-spin text-violet-500"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="mt-4 text-zinc-400">{progress}</p>
              <p className="mt-2 text-xs text-zinc-600">
                Video mất 1-3 phút để tạo. Xin vui lòng đợi...
              </p>
            </div>
          )}

          {result && result.video_url && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Kết quả</h2>
                <span className="text-sm text-zinc-500">
                  {result.duration_seconds}s | {result.resolution} | $
                  {result.cost.toFixed(2)}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-800">
                <video
                  src={api.getMediaUrl(result.video_url)}
                  controls
                  autoPlay
                  className="w-full"
                />
              </div>
              <div className="mt-4">
                <a
                  href={api.getDownloadUrl("video", result.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  Tải video
                </a>
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-16 text-center">
              <svg
                className="h-16 w-16 text-zinc-700"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              <p className="mt-4 text-zinc-500">
                Nhập mô tả và nhấn &quot;Tạo Video&quot; để bắt đầu
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
