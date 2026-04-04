import { useState, useEffect } from "react";
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const typeColor = { email: "#3B82F6", meeting: "#F59E0B", call: "#8B5CF6", task: "#64748B" };
const typeIcon = { email: "\u2709", meeting: "\uD83D\uDCC5", call: "\uD83D\uDCDE", task: "\u2611" };

export default function ActivityTimeline({ accountName, contactEmail, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/.netlify/functions/unified-timeline", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountName, contactEmail }),
    }).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [accountName, contactEmail]);

  const filtered = data?.timeline
    ? (filter === "all" ? data.timeline : data.timeline.filter(t => t.type === filter))
    : [];

  // Group by date
  const grouped = {};
  filtered.forEach(item => {
    const key = item.date || "Unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 480, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 40px rgba(0,0,0,0.6)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Activity Timeline</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{accountName || contactEmail} · Last 60 days</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 14, color: "#8B5CF6", fontWeight: 600, marginBottom: 8 }}>Building timeline...</div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
              Pulling Gmail → Scanning Calendar →<br/>
              Finding Chorus calls → Loading SFDC tasks →<br/>
              Merging chronologically...
            </div>
          </div>
        )}
        {error && <div style={{ color: "#EF4444", padding: 20, fontSize: 12 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

        {data && (
          <>
            {/* Source summary */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#3B82F620", color: "#3B82F6" }}>Gmail: {data.sources?.gmail || 0}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#F59E0B20", color: "#F59E0B" }}>Calendar: {data.sources?.calendar || 0}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#8B5CF620", color: "#8B5CF6" }}>Chorus: {data.sources?.chorus || 0}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#64748B20", color: "#64748B" }}>SFDC: {data.sources?.sfdc || 0}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#334155", color: "#F1F5F9", fontWeight: 600 }}>Total: {data.totalItems}</span>
            </div>

            {/* Type filters */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {[["all", "All"], ["email", "Email"], ["meeting", "Meeting"], ["call", "Call"], ["task", "Task"]].map(([k, l]) => (
                <button key={k} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: filter === k ? (typeColor[k] || "#10B981") : "transparent", color: filter === k ? "#fff" : "#94A3B8" }} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>

            {/* Timeline feed grouped by date */}
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6, padding: "4px 0", borderBottom: "1px solid #1E293B", position: "sticky", top: 0, background: "#0F172A", zIndex: 1 }}>{date}</div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #1E293B20" }}>
                    {/* Type icon */}
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: (typeColor[item.type] || "#64748B") + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                      {typeIcon[item.type] || "-"}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: (typeColor[item.type] || "#64748B") + "20", color: typeColor[item.type] || "#64748B", textTransform: "uppercase" }}>{item.type}</span>
                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#334155", color: "#94A3B8" }}>{item.source}</span>
                        {item.direction && (
                          <span style={{ fontSize: 9, color: item.direction === "inbound" ? "#10B981" : item.direction === "outbound" ? "#94A3B8" : "#64748B" }}>{item.direction}</span>
                        )}
                        {item.time && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{item.time}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#F1F5F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.subject}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{item.from}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 12 }}>No {filter === "all" ? "" : filter + " "}activity found</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
