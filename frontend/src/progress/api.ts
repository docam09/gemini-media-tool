import type { Member, Summary, Task, TaskStatus } from './types'

const API_BASE = '/api/progress'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = `${detail} — ${body.detail}`
    } catch {
      // non-JSON body; keep the status-only message
    }
    throw new Error(detail)
  }
  // 204 No Content has an empty body.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const listMembers = () => request<Member[]>('/members')

export const createMember = (name: string, role: string) =>
  request<Member>('/members', { method: 'POST', body: JSON.stringify({ name, role }) })

export const deleteMember = (id: number) =>
  request<void>(`/members/${id}`, { method: 'DELETE' })

export const listTasks = () => request<Task[]>('/tasks')

export const createTask = (input: {
  member_id: number
  title: string
  status?: TaskStatus
  progress?: number
  due_date?: string | null
}) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) })

export const updateTask = (
  id: number,
  patch: Partial<Pick<Task, 'title' | 'status' | 'progress' | 'due_date'>>,
) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteTask = (id: number) =>
  request<void>(`/tasks/${id}`, { method: 'DELETE' })

export const fetchSummary = () => request<Summary>('/summary')
