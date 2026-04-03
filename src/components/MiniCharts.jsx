export function MiniBar({ data, maxH = 80, barW = 28 }) {
  const max = Math.max(...data.map(d => d.emails + d.calls + d.linkedin), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: maxH }}>
      {data.map((d, i) => {
        const total = d.emails + d.calls + d.linkedin;
        const h = (total / max) * maxH;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: barW, height: Math.max(h, 2), borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ flex: d.emails, background: "#3B82F6" }} />
              <div style={{ flex: d.calls, background: "#8B5CF6" }} />
              <div style={{ flex: d.linkedin, background: "#06B6D4" }} />
            </div>
            <span style={{ fontSize: 10, color: "#64748B" }}>{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MiniLine({ data, w = 200, h = 60 }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - (d.amount / max) * h}`).join(" ");
  return (
    <svg width={w} height={h + 10} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke="#10B981" strokeWidth={2} />
      {data.map((d, i) => (
        <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - (d.amount / max) * h} r={3} fill="#10B981" />
      ))}
    </svg>
  );
}

export default MiniBar;
