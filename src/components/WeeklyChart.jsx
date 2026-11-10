// Grafic simplu în SVG: venituri vs. costuri pe 12 săptămâni + linia profitului cumulat.
// `weeks` = [{ label, revenue, cost }]; fără date afișează bare "fantomă".
const W = 720
const H = 210
const PAD = { l: 8, r: 8, t: 14, b: 26 }

const GHOST = [38, 52, 44, 66, 58, 74, 62, 80, 70, 88, 76, 92]

export default function WeeklyChart({ weeks }) {
  const has = Array.isArray(weeks) && weeks.some((w) => (w.revenue || 0) > 0 || (w.cost || 0) > 0)
  const data = has ? weeks : GHOST.map((g, i) => ({ label: `S${i + 1}`, revenue: g, cost: g * 0.62 }))
  const n = data.length
  const max = Math.max(...data.map((d) => Math.max(d.revenue || 0, d.cost || 0)), 1)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const slot = innerW / n
  const bw = Math.min(16, slot * 0.28)
  const y = (v) => PAD.t + innerH - (v / max) * innerH

  let cum = 0
  const cumPts = data.map((d, i) => {
    cum += (d.revenue || 0) - (d.cost || 0)
    return [PAD.l + slot * i + slot / 2, cum]
  })
  const cMax = Math.max(...cumPts.map((p) => Math.abs(p[1])), 1)
  const cy = (v) => PAD.t + innerH / 2 - (v / cMax) * (innerH / 2)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Venituri și costuri pe ultimele 12 săptămâni" style={{ opacity: has ? 1 : 0.35 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH * (1 - f)} y2={PAD.t + innerH * (1 - f)} stroke="rgba(148,163,184,0.15)" strokeDasharray="3 5" />
      ))}
      {data.map((d, i) => {
        const x = PAD.l + slot * i + slot / 2
        return (
          <g key={i}>
            <rect x={x - bw - 1} y={y(d.revenue || 0)} width={bw} height={PAD.t + innerH - y(d.revenue || 0)} rx="2" fill="#ec6a14" />
            <rect x={x + 1} y={y(d.cost || 0)} width={bw} height={PAD.t + innerH - y(d.cost || 0)} rx="2" fill="#5b7bb0" />
            <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#8aa0c2" fontFamily="JetBrains Mono, monospace">
              {d.label}
            </text>
          </g>
        )
      })}
      {has && (
        <polyline points={cumPts.map((p) => `${p[0]},${cy(p[1])}`).join(' ')} fill="none" stroke="#e8eefc" strokeWidth="2" strokeLinejoin="round" />
      )}
    </svg>
  )
}
