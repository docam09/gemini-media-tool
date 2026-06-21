export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Member {
  id: number
  name: string
  role: string
  created_at: string
  total_tasks: number
  done_tasks: number
  completion: number
}

export interface Task {
  id: number
  member_id: number
  title: string
  status: TaskStatus
  progress: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface MemberSummary {
  id: number
  name: string
  role: string
  total_tasks: number
  done_tasks: number
  completion: number
}

export interface Summary {
  members: MemberSummary[]
  team_completion: number
  total_tasks: number
  done_tasks: number
}
