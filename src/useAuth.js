import { useState, useEffect, useCallback } from "react";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/auth-check", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : { authenticated: false })
      .then(data => {
        setAuthenticated(data.authenticated === true);
        setLoading(false);
      })
      .catch(() => {
        setAuthenticated(false);
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (password) => {
    try {
      const res = await fetch("/.netlify/functions/auth-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: data.error || "Invalid password" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/.netlify/functions/auth-logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch { /* clear state regardless */ }
    setAuthenticated(false);
  }, []);

  return { authenticated, loading, login, logout };
}
