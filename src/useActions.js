import { useCallback, useState } from "react";

export function useActions(setToast) {
  const [sending, setSending] = useState(null);

  // ── Send email via Gmail ────────────────────────────────────
  const sendEmail = useCallback(async ({ to, subject, body, cc, bcc }) => {
    setSending("email");
    try {
      const res = await fetch("/.netlify/functions/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, cc, bcc }),
      });
      const data = await res.json();
      if (data.success) {
        setToast("Email sent");
        return true;
      }
      setToast("Email failed: " + (data.error || "Unknown error"));
      return false;
    } catch (e) {
      setToast("Email failed: " + e.message);
      return false;
    } finally {
      setSending(null);
    }
  }, [setToast]);

  // ── Update SFDC record ──────────────────────────────────────
  const updateSFDC = useCallback(async (object, id, fields) => {
    setSending("sfdc");
    try {
      const res = await fetch("/.netlify/functions/sfdc-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", object, id, fields }),
      });
      const data = await res.json();
      if (data.success) {
        setToast("Updated in Salesforce");
        return true;
      }
      setToast("SFDC update failed");
      return false;
    } catch (e) {
      setToast("SFDC update failed: " + e.message);
      return false;
    } finally {
      setSending(null);
    }
  }, [setToast]);

  // ── Log activity in SFDC ────────────────────────────────────
  const logActivity = useCallback(async (fields) => {
    try {
      const res = await fetch("/.netlify/functions/sfdc-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logActivity", fields }),
      });
      const data = await res.json();
      if (data.success) setToast("Activity logged");
      return data.success;
    } catch {
      return false;
    }
  }, [setToast]);

  // ── Batch update SFDC records ───────────────────────────────
  const batchUpdate = useCallback(async (batch) => {
    setSending("batch");
    try {
      const res = await fetch("/.netlify/functions/sfdc-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch", batch }),
      });
      const data = await res.json();
      const successCount = (data.results || []).filter(r => r.success).length;
      setToast(`Updated ${successCount}/${batch.length} records`);
      return data.results;
    } catch (e) {
      setToast("Batch update failed: " + e.message);
      return [];
    } finally {
      setSending(null);
    }
  }, [setToast]);

  return { sendEmail, updateSFDC, logActivity, batchUpdate, sending };
}
