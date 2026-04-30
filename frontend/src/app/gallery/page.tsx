"use client";

import { useState, useEffect } from "react";
import { api, type GalleryItem } from "@/lib/api";

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    api
      .getGallery()
      .then((data) => setItems(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filter === "all" ? items : items.filter((i) => i.type === filter);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Thu Vien</h1>
          <p className="mt-2 text-zinc-400">
            Tat ca hinh anh va video da tao
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "image", "video"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {f === "all" ? "Tat ca" : f === "image" ? "Hinh anh" : "Video"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
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
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <svg
            className="mx-auto h-16 w-16 text-zinc-700"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          <p className="mt-4 text-zinc-500">Chua co noi dung nao</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
            >
              <div className="relative aspect-video bg-zinc-800">
                {item.type === "image" && item.thumbnail_url ? (
                  <img
                    src={api.getMediaUrl(item.thumbnail_url)}
                    alt={item.prompt}
                    className="h-full w-full object-cover"
                  />
                ) : item.type === "video" && item.media_url ? (
                  <video
                    src={api.getMediaUrl(item.media_url)}
                    className="h-full w-full object-cover"
                    muted
                    onMouseOver={(e) =>
                      (e.target as HTMLVideoElement).play()
                    }
                    onMouseOut={(e) => {
                      const v = e.target as HTMLVideoElement;
                      v.pause();
                      v.currentTime = 0;
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    {item.status === "processing" ? (
                      <svg
                        className="h-8 w-8 animate-spin text-zinc-600"
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
                    ) : (
                      <span className="text-sm text-zinc-600">
                        {item.status === "failed" ? "That bai" : "Khong co preview"}
                      </span>
                    )}
                  </div>
                )}
                <div className="absolute left-3 top-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.type === "image"
                        ? "bg-violet-600/80 text-white"
                        : "bg-emerald-600/80 text-white"
                    }`}
                  >
                    {item.type === "image" ? "Hinh anh" : "Video"}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <p className="line-clamp-2 text-sm text-zinc-300">
                  {item.prompt}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-600">{item.model}</span>
                  <span className="text-xs text-zinc-600">
                    {new Date(item.created_at).toLocaleDateString("vi-VN")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
