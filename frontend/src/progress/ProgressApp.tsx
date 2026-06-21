import { useCallback, useEffect, useMemo, useState } from 'react'
import CompletionChart from './CompletionChart'
import {
  createMember,
  createTask,
  deleteMember,
  deleteTask,
  fetchSummary,
  listMembers,
  listTasks,
  updateTask,
} from './api'
import type { Member, Summary, Task, TaskStatus } from './types'

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Chưa làm',
  in_progress: 'Đang làm',
  done: 'Hoàn thành',
}

export default function ProgressApp() {
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New-member form
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')

  // Per-member draft for the "add task" inputs, keyed by member id.
  const [taskDrafts, setTaskDrafts] = useState<Record<number, string>>({})

  const reload = useCallback(async () => {
    try {
      const [m, t, s] = await Promise.all([listMembers(), listTasks(), fetchSummary()])
      setMembers(m)
      setTasks(t)
      setSummary(s)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Auto-refresh so teammates on the LAN see each other's updates without
  // reloading the page. Skip while a field is focused so we don't yank a
  // value out from under someone who is typing or dragging a slider.
  useEffect(() => {
    const id = window.setInterval(() => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      void reload()
    }, 10000)
    return () => window.clearInterval(id)
  }, [reload])

  const tasksByMember = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of tasks) {
      const arr = map.get(t.member_id) ?? []
      arr.push(t)
      map.set(t.member_id, arr)
    }
    return map
  }, [tasks])

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn()
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [reload],
  )

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    void run(async () => {
      await createMember(name, newRole.trim())
      setNewName('')
      setNewRole('')
    })
  }

  const handleAddTask = (memberId: number) => {
    const title = (taskDrafts[memberId] ?? '').trim()
    if (!title) return
    void run(async () => {
      await createTask({ member_id: memberId, title })
      setTaskDrafts((d) => ({ ...d, [memberId]: '' }))
    })
  }

  return (
    <div className="progress">
      <header className="progress-header">
        <div className="progress-header-row">
          <h1>Theo dõi tiến độ nhóm</h1>
          <button className="link" onClick={() => void reload()} title="Làm mới ngay">
            ↻ Làm mới
          </button>
        </div>
        <p className="muted">
          Quản lý công việc của từng thành viên và xem mức độ hoàn thành theo thời gian thực.
          <span className="live-dot" /> Tự đồng bộ mỗi 10 giây — mọi người cùng mạng đều thấy.
        </p>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            đóng
          </button>
        </div>
      )}

      {summary && <CompletionChart summary={summary} />}

      <form className="card add-member" onSubmit={handleAddMember}>
        <h2>Thêm thành viên</h2>
        <div className="row">
          <input
            placeholder="Tên thành viên"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={120}
          />
          <input
            placeholder="Vai trò (vd. Dev, QA…)"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            maxLength={120}
          />
          <button type="submit" className="primary" disabled={!newName.trim()}>
            + Thêm
          </button>
        </div>
      </form>

      {loading && <p className="muted">Đang tải…</p>}

      <div className="member-list">
        {!loading && members.length === 0 && (
          <p className="muted">Chưa có thành viên nào. Hãy thêm người đầu tiên ở trên.</p>
        )}

        {members.map((m) => {
          const memberTasks = tasksByMember.get(m.id) ?? []
          return (
            <section className="card member" key={m.id}>
              <div className="member-head">
                <div>
                  <h3>
                    {m.name} {m.role && <span className="role">· {m.role}</span>}
                  </h3>
                  <span className="muted small">
                    {m.done_tasks}/{m.total_tasks} việc · {m.completion}% hoàn thành
                  </span>
                </div>
                <button
                  className="link danger"
                  onClick={() =>
                    void run(() => deleteMember(m.id))
                  }
                  title="Xóa thành viên"
                >
                  Xóa
                </button>
              </div>

              <ul className="task-list">
                {memberTasks.map((t) => (
                  <li className={`task status-${t.status}`} key={t.id}>
                    <span className="task-title">{t.title}</span>
                    <select
                      value={t.status}
                      onChange={(e) =>
                        void run(() =>
                          updateTask(t.id, { status: e.target.value as TaskStatus }),
                        )
                      }
                    >
                      {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="task-progress"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={t.progress}
                      onChange={(e) =>
                        void run(() =>
                          updateTask(t.id, { progress: Number(e.target.value) }),
                        )
                      }
                      aria-label={`Tiến độ ${t.title}`}
                    />
                    <span className="task-pct">{t.progress}%</span>
                    <button
                      className="link danger"
                      onClick={() => void run(() => deleteTask(t.id))}
                      title="Xóa việc"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {memberTasks.length === 0 && (
                  <li className="muted small">Chưa có công việc.</li>
                )}
              </ul>

              <div className="row add-task">
                <input
                  placeholder="Thêm công việc mới…"
                  value={taskDrafts[m.id] ?? ''}
                  onChange={(e) =>
                    setTaskDrafts((d) => ({ ...d, [m.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTask(m.id)
                  }}
                  maxLength={200}
                />
                <button onClick={() => handleAddTask(m.id)} disabled={!(taskDrafts[m.id] ?? '').trim()}>
                  + Việc
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
