const CURRENT_PROJECT_KEY = 'pstudio.current_project_id'

export function getCurrentProjectId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(CURRENT_PROJECT_KEY)
  if (!raw) return null
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function setCurrentProjectId(id: number | null): void {
  if (typeof window === 'undefined') return
  if (id == null) {
    window.localStorage.removeItem(CURRENT_PROJECT_KEY)
  } else {
    window.localStorage.setItem(CURRENT_PROJECT_KEY, String(id))
  }
}
