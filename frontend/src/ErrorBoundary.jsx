import React from "react";
import { BRAND } from "./brand.js";

// Catches a render crash inside one module (Ideathon, Startup, R-Index) so the
// user sees a short message and a Reload button instead of a blank white page.
// The real error is logged to the console so it can be read and fixed (I12).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[RIOS] Screen crashed:", error, info && info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "90px 24px", fontFamily: "'Poppins',sans-serif", textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 8 }}>Something went wrong on this page</div>
        <div style={{ fontSize: 13.5, color: "#7A746F", lineHeight: 1.6, marginBottom: 22 }}>
          The page hit an unexpected problem. Reloading usually fixes it. If it keeps happening, please tell RIV and mention what you were doing.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff", border: "none", borderRadius: 9, padding: "11px 22px", cursor: "pointer" }}
        >
          Reload page
        </button>
        <div style={{ fontSize: 11, color: "#B7B2AE", marginTop: 18, wordBreak: "break-word" }}>
          {String((this.state.error && this.state.error.message) || this.state.error)}
        </div>
      </div>
    );
  }
}
