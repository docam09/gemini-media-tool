"use client";

import { useState, useEffect } from "react";
import { api, type PromptHistoryItem } from "@/lib/api";

export default function HistoryPage() {
  const [items, setItems] = useState<PromptHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api
      .getHistory(50, filter)
      .then((data) => setItems(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Lich Su Prompt</h1>
          <p className="mt-2 text-zinc-400">
            Xem lai va tai su dung cac prompt da dung
          </p>
        </div>
        <div className="flex gap-2">
          {[
            { value: "", label: "Tat ca" },
            { value: "image", label: "Hinh anh" },
            { value: "video", label: "Video" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setLoading(true);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {f.label}
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
      ) : items.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-zinc-500">Chua co lich su prompt nao</p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.type === "image"
                    ? "bg-violet-600/20 text-violet-400"
                    : "bg-emerald-600/20 text-emerald-400"
                }`}
              >
                {item.type === "image" ? "Hinh anh" : "Video"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200">{item.prompt}</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-zinc-600">{item.model}</span>
                  <span className="text-xs text-zinc-600">
                    {new Date(item.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => copyPrompt(item.prompt)}
                className="shrink-0 rounded-lg p-2 text-zinc-500 opacity-0 hover:bg-zinc-800 hover:text-white group-hover:opacity-100 transition-all"
                title="Copy prompt"
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
                    d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
