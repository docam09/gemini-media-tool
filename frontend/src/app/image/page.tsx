"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type ModelInfo, type ImageGeneration } from "@/lib/api";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:4", "4:3"];

export default function ImagePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("imagen-4.0-generate-001");
  const [numImages, setNumImages] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImageGeneration | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    api.getModels().then((m) => setModels(m.image_models)).catch(() => {});
  }, []);

  const pollResult = useCallback(async (id: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const data = await api.getImageGeneration(id);
        if (data.status === "completed") {
          setResult(data);
          setLoading(false);
          return;
        }
        if (data.status === "failed") {
          setError("Tao hinh anh that bai. Vui long thu lai.");
          setLoading(false);
          return;
        }
      } catch {
        // continue polling
      }
    }
    setError("Het thoi gian cho. Vui long thu lai.");
    setLoading(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.generateImages({
        prompt: prompt.trim(),
        model,
        num_images: numImages,
        aspect_ratio: aspectRatio,
      });
      await pollResult(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Co loi xay ra");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-white">Tao Hinh Anh</h1>
      <p className="mt-2 text-zinc-400">
        Nhap mo ta de tao hinh anh voi AI
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Mo ta hinh anh
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="VD: Mot con meo deo kinh mat ngoi doc sach trong quan cafe..."
            />
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
                  {m.cost_per_image ? ` ($${m.cost_per_image}/anh)` : ""}
                </option>
              ))}
              {models.length === 0 && (
                <>
                  <option value="imagen-4.0-generate-001">
                    Imagen 4.0 Generate ($0.04/anh)
                  </option>
                  <option value="imagen-4.0-fast-001">
                    Imagen 4.0 Fast ($0.02/anh)
                  </option>
                  <option value="imagen-4.0-ultra-001">
                    Imagen 4.0 Ultra ($0.06/anh)
                  </option>
                  <option value="gemini-2.5-flash-preview-image-generation">
                    Nano Banana (Gemini 2.5 Flash)
                  </option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                So luong
              </label>
              <select
                value={numImages}
                onChange={(e) => setNumImages(Number(e.target.value))}
                className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} anh
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Ti le
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {ASPECT_RATIOS.map((ar) => (
                  <option key={ar} value={ar}>
                    {ar}
                  </option>
                ))}
              </select>
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
                Dang tao...
              </span>
            ) : (
              "Tao Hinh Anh"
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
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
              <p className="mt-4 text-zinc-400">Dang tao hinh anh...</p>
            </div>
          )}

          {result && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Ket qua</h2>
                <span className="text-sm text-zinc-500">
                  Chi phi: ${result.cost.toFixed(2)}
                </span>
              </div>
              <div
                className={`grid gap-4 ${
                  result.images.length > 1 ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {result.images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative overflow-hidden rounded-2xl border border-zinc-800"
                  >
                    <img
                      src={api.getMediaUrl(img.url)}
                      alt={result.prompt}
                      className="w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={api.getDownloadUrl("image", img.id)}
                        className="m-4 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                      >
                        Tai xuong
                      </a>
                    </div>
                  </div>
                ))}
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
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                />
              </svg>
              <p className="mt-4 text-zinc-500">
                Nhap mo ta va nhan &quot;Tao Hinh Anh&quot; de bat dau
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
