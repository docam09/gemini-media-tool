import type { Summary } from './types'

/** Map a completion percentage to a traffic-light-ish colour. */
function barColor(pct: number): string {
  if (pct >= 100) return 'var(--ok)'
  if (pct >= 60) return 'var(--accent)'
  if (pct >= 30) return 'var(--warn)'
  return 'var(--error)'
}

/** SVG donut showing the overall team completion. */
function TeamDonut({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(pct, 100) / 100)
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={`Hoàn thành ${pct}%`}>
      <circle cx="70" cy="70" r={r} className="donut-track" />
      <circle
        cx="70"
        cy="70"
        r={r}
        className="donut-value"
        stroke={barColor(pct)}
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
      <text x="70" y="66" className="donut-num">
        {pct}%
      </text>
      <text x="70" y="88" className="donut-label">
        toàn nhóm
      </text>
    </svg>
  )
}

export default function CompletionChart({ summary }: { summary: Summary }) {
  const members = summary.members
  const maxLabel = members.reduce((m, x) => Math.max(m, x.name.length), 0)

  return (
    <div className="chart card">
      <div className="chart-head">
        <h2>Mức độ hoàn thành</h2>
        <div className="chart-stats">
          <span>
            {summary.done_tasks}/{summary.total_tasks} việc xong
          </span>
        </div>
      </div>

      <div className="chart-body">
        <TeamDonut pct={summary.team_completion} />

        <div className="bars" style={{ ['--label-ch' as string]: `${Math.min(maxLabel, 14)}ch` }}>
          {members.length === 0 && (
            <p className="muted">Chưa có thành viên — thêm người để xem biểu đồ.</p>
          )}
          {members.map((m) => (
            <div className="bar-row" key={m.id}>
              <span className="bar-name" title={m.name}>
                {m.name}
              </span>
              <div className="bar-track" role="img" aria-label={`${m.name}: ${m.completion}%`}>
                <div
                  className="bar-fill"
                  style={{ width: `${m.completion}%`, background: barColor(m.completion) }}
                />
              </div>
              <span className="bar-pct">{m.completion}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
