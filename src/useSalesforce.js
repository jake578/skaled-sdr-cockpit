import { useState, useEffect, useCallback } from "react";

export function useSalesforce() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  // Check connection status on mount
  useEffect(() => {
    fetch("/.netlify/functions/sfdc-status")
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected);
        if (data.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Run a SOQL query
  const query = useCallback(async (soql) => {
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/sfdc-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: soql }),
      });
      const data = await res.json();
      if (data.error === "not_authenticated" || data.error === "refresh_failed") {
        setConnected(false);
        return null;
      }
      if (!res.ok) {
        setError(data[0]?.message || data.message || "Query failed");
        return null;
      }
      return data.records || [];
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  const connect = () => {
    window.location.href = "/.netlify/functions/sfdc-auth";
  };

  const disconnect = () => {
    document.cookie = "sfdc_tokens=; Path=/; Max-Age=0";
    setConnected(false);
    setUser(null);
  };

  return { connected, loading, user, error, query, connect, disconnect };
}
