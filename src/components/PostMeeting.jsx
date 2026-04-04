import { useState, useEffect } from "react";
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const btn = (bg) => ({ padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: bg, color: "#fff" });

export default function PostMeeting({ event, onClose, onSendEmail, onUpdateSFDC }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [emailEdits, setEmailEdits] = useState({});

  useEffect(() => {
    fetch("/.netlify/functions/post-meeting", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event?.id, eventSubject: event?.subject, accountName: event?.account || event?.company }),
    }).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else { setData(d); if (d.emailDraft) setEmailEdits(d.emailDraft); }
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 660, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155", boxShadow: "0 12px 50px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Post-Meeting Actions</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{event?.subject || "Meeting"}</div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Analyzing meeting...</div>}
          {error && <div style={{ color: "#EF4444", padding: 20 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

          {data && (
            <>
              {/* Action Items */}
              {data.actionItems?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", marginBottom: 10, textTransform: "uppercase" }}>Action Items</div>
                  {data.actionItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#1E293B", borderRadius: 6, padding: "10px 12px", marginBottom: 4 }}>
                      <input type="checkbox" style={{ accentColor: "#10B981", marginTop: 2 }} checked={checkedItems.has(i)} onChange={() => { const n = new Set(checkedItems); n.has(i) ? n.delete(i) : n.add(i); setCheckedItems(n); }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: checkedItems.has(i) ? "#64748B" : "#F1F5F9", textDecoration: checkedItems.has(i) ? "line-through" : "none" }}>{strip(item.task)}</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{item.owner} · {item.dueDate || "No date"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SFDC Updates */}
              {data.sfdcUpdates && Object.values(data.sfdcUpdates).some(v => v) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B", marginBottom: 10, textTransform: "uppercase" }}>Proposed SFDC Updates</div>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, border: "1px solid #334155" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                      {data.sfdcUpdates.stageName && <div><span style={{ color: "#64748B" }}>Stage:</span> <span style={{ color: "#F1F5F9" }}>{data.sfdcUpdates.stageName}</span></div>}
                      {data.sfdcUpdates.nextStep && <div><span style={{ color: "#64748B" }}>Next Step:</span> <span style={{ color: "#F1F5F9" }}>{strip(data.sfdcUpdates.nextStep)}</span></div>}
                      {data.sfdcUpdates.closeDate && <div><span style={{ color: "#64748B" }}>Close Date:</span> <span style={{ color: "#F1F5F9" }}>{data.sfdcUpdates.closeDate}</span></div>}
                      {data.sfdcUpdates.amount && <div><span style={{ color: "#64748B" }}>Amount:</span> <span style={{ color: "#F1F5F9" }}>${data.sfdcUpdates.amount?.toLocaleString()}</span></div>}
                    </div>
                    {onUpdateSFDC && <button style={{ ...btn("#F59E0B"), marginTop: 10 }} onClick={() => onUpdateSFDC(data.sfdcUpdates)}>Apply to SFDC</button>}
                  </div>
                </div>
              )}

              {/* Email Draft */}
              {data.emailDraft && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#3B82F6", marginBottom: 10, textTransform: "uppercase" }}>Follow-Up Email</div>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, border: "1px solid #334155" }}>
                    <input style={{ width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, marginBottom: 6, boxSizing: "border-box" }} value={emailEdits.to || ""} onChange={e => setEmailEdits(d => ({ ...d, to: e.target.value }))} placeholder="To" />
                    <input style={{ width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, marginBottom: 6, boxSizing: "border-box" }} value={emailEdits.subject || ""} onChange={e => setEmailEdits(d => ({ ...d, subject: e.target.value }))} placeholder="Subject" />
                    <textarea style={{ width: "100%", background: "#0F172A", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 12, minHeight: 120, resize: "vertical", boxSizing: "border-box", lineHeight: 1.5 }} value={strip(emailEdits.body || "")} onChange={e => setEmailEdits(d => ({ ...d, body: e.target.value }))} />
                    {onSendEmail && <button style={{ ...btn("#3B82F6"), marginTop: 8 }} onClick={() => onSendEmail(emailEdits)}>Send Email</button>}
                  </div>
                </div>
              )}

              {/* Takeaways */}
              {data.takeaways?.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 10, textTransform: "uppercase" }}>Key Takeaways</div>
                  {data.takeaways.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid #10B981" }}>{strip(t)}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
