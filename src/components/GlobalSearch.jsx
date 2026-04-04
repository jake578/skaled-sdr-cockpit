import { useState, useEffect, useRef, useCallback } from "react";

const TYPE_COLORS = {
  opp: "#10B981",
  contact: "#3B82F6",
  action: "#F59E0B",
  account: "#8B5CF6",
  lead: "#EC4899",
};

const TYPE_LABELS = {
  opp: "Opportunity",
  contact: "Contact",
  action: "Action",
  account: "Account",
  lead: "Lead",
};

export default function GlobalSearch({ onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const resultsRef = useRef(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced search
  const doSearch = useCallback((q) => {
    if (!q || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const lower = q.toLowerCase();
    const found = [];

    // Search local data from window / DOM -- we'll pull from the store via SFDC query
    // For local mock data, try to import if available
    try {
      // Search pipeline opps via SFDC
      setLoading(true);
      const oppQuery = `SELECT Id, Name, Account.Name, Amount, StageName FROM Opportunity WHERE (Name LIKE '%${q}%' OR Account.Name LIKE '%${q}%') AND IsClosed = false LIMIT 10`;
      const contactQuery = `SELECT Id, Name, Email, Account.Name, Title FROM Contact WHERE (Name LIKE '%${q}%' OR Email LIKE '%${q}%') LIMIT 10`;

      Promise.all([
        fetch("/.netlify/functions/sfdc-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: oppQuery }),
        }).then(r => r.json()).catch(() => ({ records: [] })),
        fetch("/.netlify/functions/sfdc-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: contactQuery }),
        }).then(r => r.json()).catch(() => ({ records: [] })),
      ]).then(([oppRes, contactRes]) => {
        const combined = [];

        // Opps
        const opps = oppRes.records || oppRes || [];
        (Array.isArray(opps) ? opps : []).forEach(o => {
          combined.push({
            type: "opp",
            id: o.Id,
            name: o.Name || "Unknown Opp",
            subtitle: `${o.Account?.Name || "—"} · ${o.StageName || "—"} · $${(o.Amount || 0).toLocaleString()}`,
          });
        });

        // Contacts
        const contacts = contactRes.records || contactRes || [];
        (Array.isArray(contacts) ? contacts : []).forEach(c => {
          combined.push({
            type: "contact",
            id: c.Id,
            name: c.Name || "Unknown Contact",
            subtitle: `${c.Title || "—"} · ${c.Account?.Name || "—"} · ${c.Email || "—"}`,
          });
        });

        // Also search local action items (from mockData patterns)
        // Fallback: search in mock data if available on window
        if (window.__skaledActions) {
          window.__skaledActions.forEach(a => {
            const text = `${a.title} ${a.subtitle || ""} ${a.contact || ""} ${a.company || ""}`.toLowerCase();
            if (text.includes(lower)) {
              combined.push({
                type: "action",
                id: a.id,
                name: a.title,
                subtitle: a.subtitle || `${a.contact || ""} · ${a.company || ""}`,
              });
            }
          });
        }

        setResults(combined);
        setSelectedIdx(0);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      const r = results[selectedIdx];
      if (r && onNavigate) onNavigate({ type: r.type, id: r.id, name: r.name });
      onClose();
    }
  };

  // Scroll selected into view
  useEffect(() => {
    if (resultsRef.current) {
      const el = resultsRef.current.children[selectedIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  // Group results by type
  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  });

  let flatIdx = 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div style={styles.inputWrapper}>
          <span style={{ color: "#64748B", fontSize: 18, marginRight: 10 }}>&#128269;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search opportunities, contacts, actions..."
            style={styles.input}
          />
          <kbd style={styles.kbd}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={styles.results} ref={resultsRef}>
          {loading && (
            <div style={styles.empty}>
              <span style={{ color: "#8B5CF6" }}>Searching...</span>
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div style={styles.empty}>
              No results for "{query}"
            </div>
          )}

          {!loading && Object.keys(grouped).map(type => (
            <div key={type}>
              <div style={styles.groupHeader}>
                <span style={{
                  display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: TYPE_COLORS[type] + "20", color: TYPE_COLORS[type], textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  {TYPE_LABELS[type] || type}
                </span>
                <span style={{ fontSize: 10, color: "#475569" }}>{grouped[type].length}</span>
              </div>
              {grouped[type].map(r => {
                const idx = flatIdx++;
                const isSelected = idx === selectedIdx;
                return (
                  <div
                    key={`${r.type}-${r.id}`}
                    style={{
                      ...styles.resultItem,
                      ...(isSelected ? { background: "#334155", borderColor: TYPE_COLORS[r.type] + "40" } : {}),
                    }}
                    onClick={() => {
                      if (onNavigate) onNavigate({ type: r.type, id: r.id, name: r.name });
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{r.subtitle}</div>
                  </div>
                );
              })}
            </div>
          ))}

          {!loading && query.length < 2 && (
            <div style={styles.empty}>
              <div style={{ marginBottom: 8, color: "#64748B" }}>Type to search across your CRM</div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 11, color: "#475569" }}>
                <span>Opportunities</span>
                <span>·</span>
                <span>Contacts</span>
                <span>·</span>
                <span>Actions</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#475569" }}>
            <span><kbd style={styles.kbdSmall}>↑↓</kbd> Navigate</span>
            <span><kbd style={styles.kbdSmall}>↵</kbd> Select</span>
            <span><kbd style={styles.kbdSmall}>esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.7)", zIndex: 10000,
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "15vh",
    backdropFilter: "blur(4px)",
  },
  modal: {
    width: "100%", maxWidth: 580,
    background: "#0F172A",
    borderRadius: 12,
    border: "1px solid #334155",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  inputWrapper: {
    display: "flex", alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid #1E293B",
  },
  input: {
    flex: 1, background: "transparent", border: "none", outline: "none",
    fontSize: 16, color: "#F1F5F9", fontWeight: 500,
  },
  kbd: {
    padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
    background: "#1E293B", color: "#64748B", border: "1px solid #334155",
  },
  kbdSmall: {
    padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 600,
    background: "#1E293B", color: "#64748B", border: "1px solid #334155",
    marginRight: 4,
  },
  results: {
    maxHeight: 380,
    overflowY: "auto",
  },
  groupHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 16px 4px",
  },
  resultItem: {
    padding: "10px 16px",
    cursor: "pointer",
    transition: "all .1s",
    borderLeft: "2px solid transparent",
  },
  empty: {
    padding: "32px 16px",
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
  },
  footer: {
    padding: "10px 16px",
    borderTop: "1px solid #1E293B",
    display: "flex", justifyContent: "center",
  },
};
