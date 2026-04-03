import { REP } from "../mockData";

const styles = {
  header: {
    background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
    borderBottom: "1px solid #1E293B", padding: "16px 24px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  nav: { display: "flex", gap: 4 },
  navBtn: (active) => ({
    padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: active ? "#10B981" : "transparent", color: active ? "#fff" : "#94A3B8",
    transition: "all .15s",
  }),
  searchWrap: { position: "relative", display: "flex", alignItems: "center" },
  searchInput: {
    background: "#1E293B", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px 8px 32px",
    color: "#E2E8F0", fontSize: 13, width: 220,
  },
  btn: (bg) => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
};

export default function Header({ view, setView, search, setSearch, sfdc, sfdcLoading, liveOpps, chatOpen, setChatOpen }) {
  return (
    <div style={styles.header}>
      <div style={styles.logo}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, #10B981, #059669)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, color: "#fff",
        }}>S</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>CEO Cockpit</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>Jake Dunlap — CEO, Skaled Consulting</div>
        </div>
      </div>

      <div style={styles.nav}>
        {[["actions", "Daily Actions"], ["outreach", "Outreach"], ["pipeline", "Pipeline"]].map(([key, label]) => (
          <button key={key} style={styles.navBtn(view === key)} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      <div style={styles.searchWrap}>
        <span style={{ position: "absolute", left: 10, color: "#64748B", fontSize: 14, pointerEvents: "none" }}>&#x2315;</span>
        <input
          id="search-input"
          style={styles.searchInput}
          placeholder="Search... ( / )"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {sfdc.connected ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>SFDC{sfdc.user ? `: ${sfdc.user.name}` : ""}</span>
            {sfdcLoading && <span style={{ fontSize: 11, color: "#F59E0B" }}>Loading...</span>}
            <button style={{ ...styles.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={sfdc.disconnect}>Disconnect</button>
          </div>
        ) : (
          <button
            style={{ ...styles.btn("#00A1E0"), fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
            onClick={sfdc.connect}
          >
            <span style={{ fontSize: 14 }}>&#x2601;</span> Connect Salesforce
          </button>
        )}
        {liveOpps && <span style={{ fontSize: 10, color: "#64748B", background: "#1E293B", padding: "2px 6px", borderRadius: 3 }}>LIVE</span>}

        {/* Chat toggle in header */}
        <button
          style={{
            ...styles.btn(chatOpen ? "#6D28D9" : "#8B5CF6"),
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
          }}
          onClick={() => setChatOpen(prev => !prev)}
        >
          <span style={{ fontSize: 14 }}>C</span>
          <span style={{ fontSize: 11 }}>{chatOpen ? "Close" : "Claude"}</span>
        </button>
      </div>
    </div>
  );
}
