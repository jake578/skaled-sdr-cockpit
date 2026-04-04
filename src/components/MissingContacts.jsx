import { useState, useEffect } from "react";
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function MissingContacts({ oppId, accountId, accountName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/suggest-contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, accountId, accountName }),
    }).then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const addContact = async (contact) => {
    setAdding(contact.email);
    try {
      const nameParts = (contact.name || "").split(" ");
      const firstName = nameParts.slice(0, -1).join(" ") || "";
      const lastName = nameParts.slice(-1)[0] || contact.email.split("@")[0];

      const res = await fetch("/.netlify/functions/sfdc-create-contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email: contact.email, accountId, oppId }),
      });
      const result = await res.json();
      if (result.success) {
        setAdded(prev => new Set([...prev, contact.email]));
        setToast(result.existing ? `${contact.name || contact.email} already in SFDC — linked to opp` : `${contact.name || contact.email} added to Salesforce`);
        setTimeout(() => setToast(null), 3000);
      }
    } catch {}
    setAdding(null);
  };

  const addAll = async () => {
    for (const c of (data?.suggestions || []).filter(c => !added.has(c.email))) {
      await addContact(c);
    }
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 560, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Missing Contacts</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{accountName} · People in Gmail not in Salesforce</div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Scanning Gmail for contacts not in Salesforce...</div>}

          {toast && (
            <div style={{ background: "#10B981", color: "#fff", padding: "8px 14px", borderRadius: 6, marginBottom: 10, fontSize: 12, fontWeight: 600 }}>{toast}</div>
          )}

          {data && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#64748B" }}>
                  {data.existingCount} contacts in SFDC · {data.matchedCount} found in Gmail not in SFDC
                </div>
                {data.suggestions?.length > 0 && (
                  <button style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "#10B981", color: "#fff" }} onClick={addAll}>
                    Add All to SFDC ({data.suggestions.filter(c => !added.has(c.email)).length})
                  </button>
                )}
              </div>

              {data.suggestions?.length === 0 && (
                <div style={{ textAlign: "center", padding: 30, color: "#10B981", fontSize: 13 }}>
                  All contacts are already in Salesforce
                </div>
              )}

              {data.suggestions?.map((contact, i) => {
                const isAdded = added.has(contact.email);
                const isAdding = adding === contact.email;
                return (
                  <div key={i} style={{
                    background: isAdded ? "#10B98110" : "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 6,
                    border: `1px solid ${isAdded ? "#10B98140" : "#334155"}`, opacity: isAdded ? 0.7 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>
                          {contact.name || contact.email.split("@")[0]}
                          {isAdded && <span style={{ fontSize: 10, color: "#10B981", marginLeft: 8 }}>✓ Added</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 2 }}>{contact.email}</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                          {contact.messageCount} email{contact.messageCount !== 1 ? "s" : ""} · Last: {contact.lastDate || "—"} · Domain: {contact.domain}
                        </div>
                        {contact.subjects?.length > 0 && (
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                            Subjects: {contact.subjects.join(" | ")}
                          </div>
                        )}
                      </div>
                      {!isAdded && (
                        <button style={{
                          padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 600, background: "#10B981", color: "#fff",
                          opacity: isAdding ? 0.6 : 1, marginLeft: 10,
                        }} disabled={isAdding} onClick={() => addContact(contact)}>
                          {isAdding ? "Adding..." : "Add to SFDC"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
