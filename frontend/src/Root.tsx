import { useState } from 'react'
import App from './App'
import ProgressApp from './progress/ProgressApp'

type View = 'progress' | 'translator'

const LS_VIEW = 'app.view'

function loadView(): View {
  if (typeof window === 'undefined') return 'progress'
  return window.localStorage.getItem(LS_VIEW) === 'translator' ? 'translator' : 'progress'
}

export default function Root() {
  const [view, setView] = useState<View>(loadView)

  const choose = (next: View) => {
    setView(next)
    try {
      window.localStorage.setItem(LS_VIEW, next)
    } catch {
      // ignore unavailable storage
    }
  }

  return (
    <>
      <nav className="topnav">
        <button
          className={view === 'progress' ? 'active' : ''}
          onClick={() => choose('progress')}
        >
          📊 Tiến độ nhóm
        </button>
        <button
          className={view === 'translator' ? 'active' : ''}
          onClick={() => choose('translator')}
        >
          🌐 Trình dịch
        </button>
      </nav>
      {view === 'progress' ? <ProgressApp /> : <App />}
    </>
  )
}
