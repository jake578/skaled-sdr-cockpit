import { useEffect } from "react";

export default function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "#fff",
      padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999,
      boxShadow: "0 4px 20px rgba(16,185,129,0.4)", animation: "fadeIn .2s",
    }}>
      {msg}
    </div>
  );
}
