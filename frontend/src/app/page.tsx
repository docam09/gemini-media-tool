import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Gemini Media Tool
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-400">
          Tạo hình ảnh và video chất lượng cao với Gemini AI. Sử dụng Imagen
          4.0, Nano Banana và Veo 3.1.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            href="/image"
            className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 transition-colors"
          >
            Tạo Hình Ảnh
          </Link>
          <Link
            href="/video"
            className="rounded-xl bg-zinc-800 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 transition-colors ring-1 ring-zinc-700"
          >
            Tạo Video
          </Link>
        </div>
      </div>

      <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/10">
            <svg
              className="h-6 w-6 text-violet-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Imagen 4.0</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Sinh hình ảnh chất lượng cao từ văn bản. Hỗ trợ nhiều phong cách và
            tỉ lệ khung hình.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10">
            <svg
              className="h-6 w-6 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Nano Banana</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Sinh và chỉnh sửa hình ảnh native với Gemini. Hỗ trợ text rendering
            chính xác.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10">
            <svg
              className="h-6 w-6 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Veo 3.1</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Tạo video chất lượng cao lên tới 4K với âm thanh native. Hỗ trợ
            portrait và landscape.
          </p>
        </div>
      </div>
    </div>
  );
}
