import { useState } from "react";
import { SEQUENCES, TOP_TOUCHPOINTS, WEEKLY_ACTIVITY, PIPELINE_WEEKLY } from "../mockData";
import { MiniBar, MiniLine } from "./MiniCharts";

const fmt = (n) => "$" + n.toLocaleString();
const pct = (n) => n.toFixed(1) + "%";

const STATUS_COLORS = { "Active Opp": "#10B981", Stalled: "#EF4444", Prospecting: "#F59E0B", New: "#3B82F6", Working: "#F59E0B" };
const ACTIVITY_ICONS = { email: "\u2709", call: "\uD83D\uDCDE", linkedin: "\uD83D\uDCAC", meeting: "\uD83D\uDCC5" };

const s = {
  card: {
    background: "#1E293B", borderRadius: 8, padding: "16px", marginBottom: 10,
    border: "1px solid #334155", cursor: "pointer", transition: "all .15s",
  },
  badge: (color) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: color + "20", color: color,
  }),
  btn: (bg) => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #334155",
    color: "#64748B", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600,
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #1E293B", color: "#CBD5E1" },
};

export default function Pipeline({
  pipelineTab, setPipelineTab, filteredOpps, filteredAccounts, filteredLeads,
  displayActivities, pipelineTotal, liveOpps, liveActivities,
  selectedOpps, setSelectedOpps, oppSortAsc, setOppSortAsc,
  bulkAction, setBulkAction, oppEdits, setOppEdits,
  editingOpp, setEditingOpp, activityFilter, setActivityFilter,
  act, setToast, copyText, emailAction,
}) {
  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["opps", "Opportunities"], ["activities", "Activities"], ["accounts", "Accounts"], ["leads", "Leads"]].map(([key, label]) => (
          <button
            key={key}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              background: pipelineTab === key ? "#10B981" : "transparent",
              color: pipelineTab === key ? "#fff" : "#94A3B8",
            }}
            onClick={() => setPipelineTab(key)}
          >{label}</button>
        ))}
      </div>

      {/* Opportunities */}
      {pipelineTab === "opps" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={s.sectionTitle}>Open Opportunities -- {fmt(pipelineTotal)} total pipeline</div>
            <button style={s.btn("#334155")} onClick={() => setOppSortAsc(p => !p)}>
              {oppSortAsc ? "Closest first \u2191" : "Furthest first \u2193"}
            </button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94A3B8", cursor: "pointer" }}>
                <input type="checkbox" style={{ accentColor: "#10B981" }}
                  checked={selectedOpps.size === filteredOpps.length && filteredOpps.length > 0}
                  onChange={e => {
                    if (e.target.checked) setSelectedOpps(new Set(filteredOpps.map(o => o.id)));
                    else setSelectedOpps(new Set());
                  }}
                /> Select All
              </label>
              {selectedOpps.size > 0 && <span style={{ fontSize: 12, color: "#F1F5F9", fontWeight: 600 }}>{selectedOpps.size} selected</span>}
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedOpps.size > 0 && (
            <div style={{
              background: "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 12,
              border: "1px solid #334155", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 13, color: "#F1F5F9", fontWeight: 600, marginRight: 8 }}>{selectedOpps.size} opp{selectedOpps.size > 1 ? "s" : ""} selected:</span>
              <button style={s.btn("#EF4444")} onClick={() => setBulkAction(bulkAction === "closeLost" ? null : "closeLost")}>
                Bulk Close Lost
              </button>
              <button style={s.btn("#F59E0B")} onClick={() => setBulkAction(bulkAction === "updateForecast" ? null : "updateForecast")}>
                Bulk Update Forecast
              </button>
              <button style={s.btn("#3B82F6")} onClick={() => setBulkAction(bulkAction === "updateStage" ? null : "updateStage")}>
                Bulk Change Stage
              </button>
              <button style={s.btn("#8B5CF6")} onClick={async () => {
                const batch = [...selectedOpps].map(id => {
                  const opp = filteredOpps.find(o => o.id === id);
                  const current = opp?.closeDate && opp.closeDate !== "--" ? new Date(opp.closeDate) : new Date();
                  const pushed = new Date(current.getTime() + 14 * 86400000);
                  return { object: "Opportunity", id, fields: { CloseDate: pushed.toISOString().split("T")[0] } };
                });
                const results = await act.batchUpdate(batch);
                if (results.length) { setSelectedOpps(new Set()); setBulkAction(null); window.location.reload(); }
              }}>
                Push Close +2 Weeks
              </button>
              <button style={s.btn("#334155")} onClick={() => { setSelectedOpps(new Set()); setBulkAction(null); }}>Clear</button>
            </div>
          )}

          {/* Bulk action panel */}
          {bulkAction && selectedOpps.size > 0 && (
            <div style={{
              background: "#0F172A", borderRadius: 8, padding: 16, marginBottom: 12,
              border: bulkAction === "closeLost" ? "1px solid #EF4444" : "1px solid #334155",
            }}>
              {bulkAction === "closeLost" && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>
                    Close {selectedOpps.size} Opportunit{selectedOpps.size > 1 ? "ies" : "y"} as Lost
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                    {filteredOpps.filter(o => selectedOpps.has(o.id)).map(o => o.name).join(", ")}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ ...s.btn("#EF4444"), opacity: act.sending === "batch" ? 0.6 : 1 }}
                      disabled={act.sending === "batch"}
                      onClick={async () => {
                        const batch = [...selectedOpps].map(id => ({
                          object: "Opportunity", id,
                          fields: { StageName: "Closed Lost", Lost_Reason__c: "Other", Lost_Reason_Details__c: "Old" },
                        }));
                        const results = await act.batchUpdate(batch);
                        if (results.length) { setSelectedOpps(new Set()); setBulkAction(null); window.location.reload(); }
                      }}
                    >
                      {act.sending === "batch" ? "Closing..." : `Confirm Close Lost (${selectedOpps.size})`}
                    </button>
                    <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {bulkAction === "updateForecast" && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>
                    Update Forecast Category on {selectedOpps.size} Opp{selectedOpps.size > 1 ? "s" : ""}
                  </div>
                  <select
                    style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 10, width: 200 }}
                    value={oppEdits.bulkForecast || ""}
                    onChange={e => setOppEdits(d => ({ ...d, bulkForecast: e.target.value }))}
                  >
                    <option value="">Select category</option>
                    <option>Omitted</option><option>Pipeline</option><option>Best Case</option>
                    <option>Commit</option><option>Closed</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ ...s.btn("#F59E0B"), opacity: act.sending === "batch" || !oppEdits.bulkForecast ? 0.6 : 1 }}
                      disabled={act.sending === "batch" || !oppEdits.bulkForecast}
                      onClick={async () => {
                        const batch = [...selectedOpps].map(id => ({
                          object: "Opportunity", id,
                          fields: { Group_Forecast_Category__c: oppEdits.bulkForecast },
                        }));
                        const results = await act.batchUpdate(batch);
                        if (results.length) { setSelectedOpps(new Set()); setBulkAction(null); setOppEdits({}); window.location.reload(); }
                      }}
                    >
                      {act.sending === "batch" ? "Updating..." : `Update ${selectedOpps.size} Opps`}
                    </button>
                    <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {bulkAction === "updateStage" && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#3B82F6", marginBottom: 8 }}>
                    Change Stage on {selectedOpps.size} Opp{selectedOpps.size > 1 ? "s" : ""}
                  </div>
                  <select
                    style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 10, width: 200 }}
                    value={oppEdits.bulkStage || ""}
                    onChange={e => setOppEdits(d => ({ ...d, bulkStage: e.target.value }))}
                  >
                    <option value="">Select stage</option>
                    <option>Prospecting</option><option>Qualification</option><option>Needs Analysis</option>
                    <option>Value Proposition</option><option>Proposal/Price Quote</option><option>Negotiation/Review</option>
                    <option>Closed Won</option><option>Closed Lost</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={{ ...s.btn("#3B82F6"), opacity: act.sending === "batch" || !oppEdits.bulkStage ? 0.6 : 1 }}
                      disabled={act.sending === "batch" || !oppEdits.bulkStage}
                      onClick={async () => {
                        const batch = [...selectedOpps].map(id => ({
                          object: "Opportunity", id,
                          fields: { StageName: oppEdits.bulkStage },
                        }));
                        const results = await act.batchUpdate(batch);
                        if (results.length) { setSelectedOpps(new Set()); setBulkAction(null); setOppEdits({}); window.location.reload(); }
                      }}
                    >
                      {act.sending === "batch" ? "Updating..." : `Update ${selectedOpps.size} Opps`}
                    </button>
                    <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {[...filteredOpps].sort((a, b) => {
            const da = a.closeDate && a.closeDate !== "--" ? new Date(a.closeDate) : new Date("2099-01-01");
            const db = b.closeDate && b.closeDate !== "--" ? new Date(b.closeDate) : new Date("2099-01-01");
            return oppSortAsc ? da - db : db - da;
          }).map(opp => (
            <div key={opp.id} className="card-hover" style={{ ...s.card, borderLeft: selectedOpps.has(opp.id) ? "3px solid #10B981" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="checkbox" style={{ accentColor: "#10B981", marginTop: 4 }}
                    checked={selectedOpps.has(opp.id)}
                    onChange={e => {
                      const next = new Set(selectedOpps);
                      if (e.target.checked) next.add(opp.id); else next.delete(opp.id);
                      setSelectedOpps(next);
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{opp.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                      {opp.contact} -- {opp.source}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9" }}>{fmt(opp.amount)}</div>
                  <span style={s.badge(opp.stage === "Stalled" ? "#EF4444" : opp.stage === "Proposal" ? "#10B981" : "#F59E0B")}>
                    {opp.stage}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "#64748B", flexWrap: "wrap" }}>
                <span>Close: {opp.closeDate}</span>
                <span>Prob: {opp.probability}%</span>
                <span>{opp.daysInStage}d in stage</span>
                <span>Last activity: {opp.lastActivity}</span>
                {opp.forecastCategory && opp.forecastCategory !== "--" && (
                  <span style={s.badge(
                    opp.forecastCategory === "Closed" ? "#10B981" :
                    opp.forecastCategory === "Commit" ? "#3B82F6" :
                    opp.forecastCategory === "Best Case" ? "#F59E0B" : "#64748B"
                  )}>
                    {opp.forecastCategory}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <strong style={{ color: "#F1F5F9" }}>Next step:</strong>{" "}
                <span style={{ color: "#CBD5E1" }}>{opp.nextStep}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button style={s.btn("#1E293B")} onClick={() => copyText(`${opp.name}\nAmount: ${fmt(opp.amount)}\nStage: ${opp.stage}\nNext step: ${opp.nextStep}`, "opp details")}>Copy</button>
                <button style={s.btn("#1E293B")} onClick={() => emailAction(opp.contact, `Re: ${opp.name}`, `Next step: ${opp.nextStep}`)}>Email</button>
                {liveOpps && (
                  <button style={s.btn("#F59E0B")} onClick={() => { setEditingOpp(editingOpp === opp.id ? null : opp.id); setOppEdits({}); }}>
                    {editingOpp === opp.id ? "Close" : "Edit in SFDC"}
                  </button>
                )}
              </div>
              {editingOpp === opp.id && liveOpps && (
                <div style={{ background: "#0F172A", borderRadius: 8, padding: 14, marginTop: 10, border: "1px solid #334155" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Stage</div>
                      <select style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                        value={oppEdits.StageName || ""} onChange={e => setOppEdits(d => ({ ...d, StageName: e.target.value }))}>
                        <option value="">No change</option>
                        <option>Prospecting</option><option>Qualification</option><option>Needs Analysis</option>
                        <option>Value Proposition</option><option>Proposal/Price Quote</option><option>Negotiation/Review</option>
                        <option>Closed Won</option><option>Closed Lost</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Close Date</div>
                      <input type="date" style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                        value={oppEdits.CloseDate || ""} onChange={e => setOppEdits(d => ({ ...d, CloseDate: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Amount</div>
                      <input type="number" style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                        placeholder="Amount" value={oppEdits.Amount || ""} onChange={e => setOppEdits(d => ({ ...d, Amount: e.target.value ? Number(e.target.value) : "" }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Next Step</div>
                      <input style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                        placeholder="Next step..." value={oppEdits.NextStep || ""} onChange={e => setOppEdits(d => ({ ...d, NextStep: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Group Forecast Category</div>
                      <select style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                        value={oppEdits.Group_Forecast_Category__c || ""} onChange={e => setOppEdits(d => ({ ...d, Group_Forecast_Category__c: e.target.value }))}>
                        <option value="">No change</option>
                        <option>Omitted</option><option>Pipeline</option><option>Best Case</option>
                        <option>Commit</option><option>Closed</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...s.btn("#F59E0B"), opacity: act.sending === "sfdc" ? 0.6 : 1 }} disabled={act.sending === "sfdc"}
                      onClick={async () => {
                        const fields = {};
                        if (oppEdits.StageName) fields.StageName = oppEdits.StageName;
                        if (oppEdits.CloseDate) fields.CloseDate = oppEdits.CloseDate;
                        if (oppEdits.Amount) fields.Amount = oppEdits.Amount;
                        if (oppEdits.NextStep) fields.NextStep = oppEdits.NextStep;
                        if (oppEdits.Group_Forecast_Category__c) fields.Group_Forecast_Category__c = oppEdits.Group_Forecast_Category__c;
                        if (Object.keys(fields).length === 0) { setToast("No changes"); return; }
                        const ok = await act.updateSFDC("Opportunity", opp.id, fields);
                        if (ok) { setEditingOpp(null); setOppEdits({}); }
                      }}>
                      {act.sending === "sfdc" ? "Saving..." : "Save to Salesforce"}
                    </button>
                    <button style={s.btn("#334155")} onClick={() => { setEditingOpp(null); setOppEdits({}); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Activities */}
      {pipelineTab === "activities" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={s.sectionTitle}>Activity Feed -- Emails, Calls, Meetings, Forms</div>
            {liveActivities && (
              <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                {["all", "email", "call", "meeting", "form"].map(f => (
                  <button key={f} style={{
                    padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
                    fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                    background: (activityFilter || "all") === f ? "#10B981" : "transparent",
                    color: (activityFilter || "all") === f ? "#fff" : "#94A3B8",
                  }} onClick={() => setActivityFilter(f)}>{f}</button>
                ))}
              </div>
            )}
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Subject</th>
                <th style={s.th}>Contact</th>
                <th style={s.th}>Company</th>
                <th style={s.th}>Source</th>
                <th style={s.th}>Dir</th>
              </tr>
            </thead>
            <tbody>
              {displayActivities
                .filter(a => !activityFilter || activityFilter === "all" || a.type === activityFilter)
                .map((a, i) => {
                const typeColors = { email: "#3B82F6", call: "#8B5CF6", meeting: "#F59E0B", form: "#10B981", task: "#64748B" };
                return (
                  <tr key={i} className="row-hover">
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      <div>{a.date}</div>
                      {a.time && <div style={{ fontSize: 10, color: "#64748B" }}>{a.time}</div>}
                    </td>
                    <td style={s.td}>
                      <span style={s.badge(typeColors[a.type] || "#64748B")}>
                        {ACTIVITY_ICONS[a.type] || (a.type === "form" ? "\uD83D\uDCDD" : "\u25B8")} {a.type}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: "#F1F5F9", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</td>
                    <td style={s.td}>{a.contact}</td>
                    <td style={s.td}>{a.company}</td>
                    <td style={s.td}>
                      <span style={{ fontSize: 10, color: "#64748B" }}>{a.source || "SFDC"}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.badge(a.direction === "inbound" ? "#10B981" : "#3B82F6")}>{a.direction}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Accounts */}
      {pipelineTab === "accounts" && (
        <div>
          <div style={s.sectionTitle}>Key Accounts</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Account</th>
                <th style={s.th}>Industry</th>
                <th style={s.th}>Employees</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Contacts</th>
                <th style={s.th}>Last Touch</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc, i) => (
                <tr key={i} className="row-hover">
                  <td style={{ ...s.td, color: "#F1F5F9", fontWeight: 600 }}>{acc.name}</td>
                  <td style={s.td}>{acc.industry}</td>
                  <td style={s.td}>{acc.employees}</td>
                  <td style={s.td}>
                    <span style={s.badge(STATUS_COLORS[acc.status] || "#64748B")}>{acc.status}</span>
                  </td>
                  <td style={s.td}>{acc.contacts}</td>
                  <td style={s.td}>{acc.lastTouch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leads */}
      {pipelineTab === "leads" && (
        <div>
          <div style={s.sectionTitle}>Active Leads</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Company</th>
                <th style={s.th}>Title</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Source</th>
                <th style={s.th}>Score</th>
                <th style={s.th}>Last Touch</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead, i) => (
                <tr key={i} className="row-hover">
                  <td style={{ ...s.td, color: "#F1F5F9", fontWeight: 600 }}>{lead.name}</td>
                  <td style={s.td}>{lead.company}</td>
                  <td style={s.td}>{lead.title}</td>
                  <td style={s.td}>
                    <span style={s.badge(STATUS_COLORS[lead.status] || "#64748B")}>{lead.status}</span>
                  </td>
                  <td style={s.td}>{lead.source}</td>
                  <td style={{ ...s.td, fontWeight: 600, color: lead.score >= 70 ? "#10B981" : lead.score >= 50 ? "#F59E0B" : "#64748B" }}>
                    {lead.score}
                  </td>
                  <td style={s.td}>{lead.lastTouch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
