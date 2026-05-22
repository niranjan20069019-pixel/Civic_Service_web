import { useState, useEffect, useCallback, useRef } from "react";

// ─── Mock API layer (mirrors real endpoints) ──────────────────────────────────
const CATEGORIES = ["roads", "sanitation", "water", "electricity", "parks", "safety", "other"];
const STATUSES = ["open", "in_progress", "resolved", "closed", "rejected"];
const PRIORITIES = ["low", "medium", "high", "critical"];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hoursAgo(h) {
  const d = new Date(); d.setHours(d.getHours() - h); return d.toISOString();
}

const SAMPLE_ISSUES = [
  { id: generateId(), title: "Large pothole on Main St", description: "Deep pothole causing vehicle damage near junction.", category: "roads", status: "in_progress", priority: "high", location: { address: "123 Main St", lat: 40.7128, lng: -74.006 }, reportedBy: "u1", assignedTo: "u3", createdAt: hoursAgo(72), updatedAt: hoursAgo(12), firstResponseAt: hoursAgo(24), resolvedAt: null },
  { id: generateId(), title: "Broken streetlight at Elm Park", description: "Lamp post dark for 2 weeks causing safety concerns.", category: "electricity", status: "open", priority: "medium", location: { address: "Elm Park Entrance", lat: 40.72, lng: -74.01 }, reportedBy: "u2", assignedTo: null, createdAt: hoursAgo(336), updatedAt: hoursAgo(336), firstResponseAt: null, resolvedAt: null },
  { id: generateId(), title: "Overflowing garbage bins at Central Park", description: "Waste bins have not been collected for 5 days.", category: "sanitation", status: "resolved", priority: "critical", location: { address: "Central Park N", lat: 40.785, lng: -73.968 }, reportedBy: "u1", assignedTo: "u3", createdAt: hoursAgo(200), updatedAt: hoursAgo(8), firstResponseAt: hoursAgo(180), resolvedAt: hoursAgo(8) },
  { id: generateId(), title: "Water pipe burst on 5th Avenue", description: "Water gushing from a burst pipe flooding the footpath.", category: "water", status: "closed", priority: "critical", location: { address: "5th Ave & 42nd", lat: 40.7527, lng: -73.981 }, reportedBy: "u4", assignedTo: "u3", createdAt: hoursAgo(500), updatedAt: hoursAgo(100), firstResponseAt: hoursAgo(498), resolvedAt: hoursAgo(102) },
  { id: generateId(), title: "Graffiti on community centre wall", description: "Large graffiti tags covering the east wall.", category: "other", status: "open", priority: "low", location: { address: "Community Centre, Oak Rd", lat: 40.74, lng: -73.99 }, reportedBy: "u2", assignedTo: null, createdAt: hoursAgo(48), updatedAt: hoursAgo(48), firstResponseAt: null, resolvedAt: null },
  { id: generateId(), title: "Park benches need repair", description: "Several benches have broken slats — safety hazard.", category: "parks", status: "in_progress", priority: "medium", location: { address: "Riverside Park", lat: 40.8, lng: -73.97 }, reportedBy: "u4", assignedTo: "u3", createdAt: hoursAgo(120), updatedAt: hoursAgo(30), firstResponseAt: hoursAgo(100), resolvedAt: null },
  { id: generateId(), title: "Abandoned vehicle blocking lane", description: "Car without plates blocking the left lane for 3 days.", category: "safety", status: "rejected", priority: "high", location: { address: "Broadway & 72nd", lat: 40.779, lng: -73.981 }, reportedBy: "u1", assignedTo: null, createdAt: hoursAgo(96), updatedAt: hoursAgo(60), firstResponseAt: hoursAgo(90), resolvedAt: null },
  { id: generateId(), title: "Sewage smell near River Walk", description: "Strong sewage odour near pedestrian bridge.", category: "sanitation", status: "open", priority: "high", location: { address: "River Walk Bridge", lat: 40.76, lng: -74.0 }, reportedBy: "u2", assignedTo: null, createdAt: hoursAgo(18), updatedAt: hoursAgo(18), firstResponseAt: null, resolvedAt: null },
  { id: generateId(), title: "Pothole cluster on West Road", description: "Multiple potholes in 200m stretch.", category: "roads", status: "open", priority: "medium", location: { address: "West Road", lat: 40.71, lng: -74.02 }, reportedBy: "u4", assignedTo: null, createdAt: hoursAgo(55), updatedAt: hoursAgo(55), firstResponseAt: null, resolvedAt: null },
  { id: generateId(), title: "Electricity outage — Block D", description: "No power in residential block since last night.", category: "electricity", status: "resolved", priority: "critical", location: { address: "Block D, Housing Estate", lat: 40.735, lng: -73.975 }, reportedBy: "u1", assignedTo: "u3", createdAt: hoursAgo(30), updatedAt: hoursAgo(5), firstResponseAt: hoursAgo(29), resolvedAt: hoursAgo(5) },
];

const SAMPLE_USERS = [
  { id: "u1", name: "Jane Citizen", email: "jane@example.com", role: "citizen" },
  { id: "u2", name: "Bob Resident", email: "bob@example.com", role: "citizen" },
  { id: "u3", name: "Alice Official", email: "alice@city.gov", role: "official" },
  { id: "u4", name: "Mark User", email: "mark@example.com", role: "citizen" },
  { id: "u5", name: "Sam Supervisor", email: "sam@city.gov", role: "supervisor" },
];

const HISTORY_MAP = {
  [SAMPLE_ISSUES[0].id]: [
    { id: generateId(), action: "created", note: "Issue reported.", actor: "u1", timestamp: hoursAgo(72) },
    { id: generateId(), action: "status_changed", note: "Repair crew scheduled for Thursday.", actor: "u3", timestamp: hoursAgo(24), from: "open", to: "in_progress" },
  ],
  [SAMPLE_ISSUES[2].id]: [
    { id: generateId(), action: "created", note: "Issue reported.", actor: "u1", timestamp: hoursAgo(200) },
    { id: generateId(), action: "status_changed", note: "Waste collection team dispatched.", actor: "u3", timestamp: hoursAgo(180), from: "open", to: "in_progress" },
    { id: generateId(), action: "status_changed", note: "Area cleaned and bins cleared.", actor: "u3", timestamp: hoursAgo(8), from: "in_progress", to: "resolved" },
  ],
};

// Simulated in-memory state
let ISSUES = [...SAMPLE_ISSUES];
let CURRENT_USER = null;
let TOKEN = null;

const api = {
  login: async (email, password, role) => {
    await new Promise(r => setTimeout(r, 600));
    const user = SAMPLE_USERS.find(u => u.email === email) || { id: generateId(), name: email.split("@")[0], email, role: role || "citizen" };
    TOKEN = "mock-jwt-token";
    CURRENT_USER = user;
    return { success: true, data: { accessToken: TOKEN, user } };
  },
  register: async (name, email, password, role) => {
    await new Promise(r => setTimeout(r, 700));
    const user = { id: generateId(), name, email, role };
    CURRENT_USER = user; TOKEN = "mock-jwt-token";
    return { success: true, data: { accessToken: TOKEN, user } };
  },
  logout: () => { CURRENT_USER = null; TOKEN = null; },
  getIssues: async (filters = {}) => {
    await new Promise(r => setTimeout(r, 300));
    let result = [...ISSUES];
    if (filters.status) result = result.filter(i => i.status === filters.status);
    if (filters.category) result = result.filter(i => i.category === filters.category);
    if (filters.priority) result = result.filter(i => i.priority === filters.priority);
    if (filters.search) result = result.filter(i => i.title.toLowerCase().includes(filters.search.toLowerCase()) || i.description.toLowerCase().includes(filters.search.toLowerCase()));
    if (CURRENT_USER?.role === "citizen") result = result.filter(i => i.reportedBy === CURRENT_USER.id);
    const total = result.length;
    const page = filters.page || 1; const limit = filters.limit || 10;
    return { success: true, data: { data: result.slice((page - 1) * limit, page * limit), total, page, limit, pages: Math.ceil(total / limit) } };
  },
  getIssue: async (id) => {
    await new Promise(r => setTimeout(r, 200));
    const issue = ISSUES.find(i => i.id === id);
    if (!issue) return { success: false, message: "Not found" };
    return { success: true, data: { issue, history: HISTORY_MAP[id] || [{ id: generateId(), action: "created", note: "Issue reported.", actor: issue.reportedBy, timestamp: issue.createdAt }] } };
  },
  createIssue: async (data) => {
    await new Promise(r => setTimeout(r, 500));
    const issue = { id: generateId(), ...data, status: "open", reportedBy: CURRENT_USER?.id || "u1", assignedTo: null, firstResponseAt: null, resolvedAt: null, closedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    ISSUES.unshift(issue);
    return { success: true, data: { issue } };
  },
  updateStatus: async (id, status, note) => {
    await new Promise(r => setTimeout(r, 400));
    const idx = ISSUES.findIndex(i => i.id === id);
    if (idx === -1) return { success: false };
    const now = new Date().toISOString();
    ISSUES[idx] = { ...ISSUES[idx], status, updatedAt: now, firstResponseAt: ISSUES[idx].firstResponseAt || (status !== "open" ? now : null), resolvedAt: status === "resolved" ? now : ISSUES[idx].resolvedAt };
    if (!HISTORY_MAP[id]) HISTORY_MAP[id] = [];
    HISTORY_MAP[id].push({ id: generateId(), action: "status_changed", note, actor: CURRENT_USER?.id, timestamp: now, from: ISSUES[idx - 1]?.status, to: status });
    return { success: true, data: { issue: ISSUES[idx] } };
  },
  getAnalytics: async () => {
    await new Promise(r => setTimeout(r, 400));
    const total = ISSUES.length;
    const resolved = ISSUES.filter(i => ["resolved", "closed"].includes(i.status)).length;
    const byStatus = STATUSES.map(s => ({ status: s, total: ISSUES.filter(i => i.status === s).length }));
    const byCategory = CATEGORIES.map(c => {
      const cat = ISSUES.filter(i => i.category === c);
      const res = cat.filter(i => i.resolvedAt);
      const times = res.map(i => (new Date(i.resolvedAt) - new Date(i.createdAt)) / 3600000);
      return { category: c, total: cat.length, resolved_count: res.length, resolved_pct: cat.length ? +((res.length / cat.length) * 100).toFixed(1) : 0, avg_resolution_hours: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : null };
    }).filter(c => c.total > 0);
    return { success: true, data: { total_issues: total, resolved_count: resolved, resolved_pct: total ? +((resolved / total) * 100).toFixed(1) : 0, by_status: byStatus, by_category: byCategory } };
  },
};

// ─── Colours & helpers ────────────────────────────────────────────────────────
const STATUS_META = {
  open: { label: "Open", color: "#2563eb", bg: "#eff6ff", text: "#1e40af" },
  in_progress: { label: "In Progress", color: "#d97706", bg: "#fffbeb", text: "#92400e" },
  resolved: { label: "Resolved", color: "#16a34a", bg: "#f0fdf4", text: "#14532d" },
  closed: { label: "Closed", color: "#6b7280", bg: "#f9fafb", text: "#374151" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fef2f2", text: "#991b1b" },
};
const PRIORITY_META = {
  low: { label: "Low", color: "#6b7280", bg: "#f9fafb" },
  medium: { label: "Medium", color: "#2563eb", bg: "#eff6ff" },
  high: { label: "High", color: "#d97706", bg: "#fffbeb" },
  critical: { label: "Critical", color: "#dc2626", bg: "#fef2f2" },
};
const CAT_ICON = { roads: "🛣️", sanitation: "🗑️", water: "💧", electricity: "⚡", parks: "🌳", safety: "🚨", other: "📋" };

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── UI Components ────────────────────────────────────────────────────────────
const Badge = ({ status, type = "status" }) => {
  const meta = type === "status" ? STATUS_META[status] : PRIORITY_META[status];
  if (!meta) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", background: meta.bg, color: meta.text || meta.color, border: `1px solid ${meta.color}22` }}>
      {type === "status" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, display: "inline-block" }} />}
      {meta.label}
    </span>
  );
};

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 24px", cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.15s, transform 0.1s", ...style }}
    onMouseEnter={onClick ? e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } : undefined}
    onMouseLeave={onClick ? e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; } : undefined}>
    {children}
  </div>
);

const MetricCard = ({ label, value, sub, color = "#2563eb", icon }) => (
  <div style={{ background: "linear-gradient(135deg, #fff 0%, #f8faff 100%)", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>}
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</label>}
    <input style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", transition: "border 0.15s", color: "#111827", background: "#fff" }}
      onFocus={e => e.target.style.border = "1.5px solid #2563eb"}
      onBlur={e => e.target.style.border = "1px solid #d1d5db"}
      {...props} />
  </div>
);

const Select = ({ label, children, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</label>}
    <select style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", background: "#fff", color: "#111827", cursor: "pointer" }} {...props}>{children}</select>
  </div>
);

const Btn = ({ children, onClick, variant = "primary", disabled, style = {}, type = "button" }) => {
  const base = { padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 8, opacity: disabled ? 0.6 : 1 };
  const variants = {
    primary: { background: "#2563eb", color: "#fff" },
    secondary: { background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" },
    danger: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" },
    ghost: { background: "transparent", color: "#6b7280", border: "1px solid #e5e7eb" },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={!disabled ? e => e.currentTarget.style.filter = "brightness(0.95)" : undefined}
      onMouseLeave={!disabled ? e => e.currentTarget.style.filter = "none" : undefined}>
      {children}
    </button>
  );
};

const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
    <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const Toast = ({ msg, type = "success" }) => {
  const colors = { success: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" }, error: { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626" } };
  const c = colors[type];
  return (
    <div style={{ position: "fixed", top: 24, right: 24, background: c.bg, border: `1px solid ${c.border}`, color: c.text, padding: "12px 20px", borderRadius: 10, fontWeight: 500, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", animation: "slideIn 0.25s ease" }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } }`}</style>
      {type === "success" ? "✓" : "✗"} {msg}
    </div>
  );
};

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
const MiniBarChart = ({ data, colorKey }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const colors = { open: "#2563eb", in_progress: "#d97706", resolved: "#16a34a", closed: "#6b7280", rejected: "#dc2626" };
  const catColors = { roads: "#2563eb", sanitation: "#16a34a", water: "#0ea5e9", electricity: "#f59e0b", parks: "#22c55e", safety: "#ef4444", other: "#8b5cf6" };
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#374151", fontWeight: 600 }}>{d.value}</span>
          <div style={{ width: "100%", background: (colorKey === "status" ? colors[d.key] : catColors[d.key]) || "#94a3b8", borderRadius: "3px 3px 0 0", height: `${Math.max((d.value / max) * 60, d.value > 0 ? 8 : 0)}px`, transition: "height 0.4s ease" }} />
          <span style={{ fontSize: 9, color: "#9ca3af", textAlign: "center", lineHeight: 1.2 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "alice@city.gov", password: "Secure123!", role: "official" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const PRESETS = [
    { label: "Citizen", email: "jane@example.com", role: "citizen" },
    { label: "Official", email: "alice@city.gov", role: "official" },
    { label: "Supervisor", email: "sam@city.gov", role: "supervisor" },
  ];

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      let res;
      if (mode === "login") res = await api.login(form.email, form.password, form.role);
      else res = await api.register(form.name, form.email, form.password, form.role);
      if (res.success) onLogin(res.data.user);
      else setError(res.message || "Failed");
    } catch { setError("Something went wrong."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ width: 420, background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 40 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: "linear-gradient(135deg, #3b82f6, #6366f1)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>🏛️</div>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>CivicTrack</h1>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>Civic Issue Reporting Platform</p>
        </div>

        {/* Quick login presets */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {PRESETS.map(p => (
            <button key={p.role} onClick={() => setForm(f => ({ ...f, email: p.email, role: p.role }))}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${form.email === p.email ? "#3b82f6" : "rgba(255,255,255,0.15)"}`, background: form.email === p.email ? "rgba(59,130,246,0.25)" : "transparent", color: form.email === p.email ? "#93c5fd" : "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 500, transition: "all 0.15s" }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#94a3b8" }}>Full name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Citizen"
                style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none" }} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "#94a3b8" }}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "#94a3b8" }}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 14, outline: "none" }} />
          </div>
          {mode === "register" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#94a3b8" }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#1e3a5f", color: "#fff", fontSize: 14 }}>
                <option value="citizen">Citizen</option>
                <option value="official">Official</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
          )}
          {error && <div style={{ color: "#fca5a5", fontSize: 13, background: "rgba(239,68,68,0.12)", padding: "8px 12px", borderRadius: 8 }}>⚠ {error}</div>}
          <button onClick={handleSubmit} disabled={loading}
            style={{ marginTop: 4, padding: "12px", borderRadius: 8, background: "linear-gradient(90deg, #3b82f6, #6366f1)", color: "#fff", fontWeight: 600, fontSize: 15, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.8 : 1 }}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
        <p style={{ textAlign: "center", marginTop: 20, color: "#64748b", fontSize: 13 }}>
          {mode === "login" ? "No account? " : "Have an account? "}
          <button onClick={() => setMode(m => m === "login" ? "register" : "login")} style={{ color: "#60a5fa", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

// ─── Issue List ───────────────────────────────────────────────────────────────
const IssueList = ({ user, onSelect, onCreate }) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", category: "", priority: "", search: "", page: 1 });
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getIssues({ ...filters, limit: 8 });
    if (res.success) { setIssues(res.data.data); setPagination({ total: res.data.total, pages: res.data.pages }); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val, page: 1 }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            {user.role === "citizen" ? "My Reports" : "All Issues"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>{pagination.total} issue{pagination.total !== 1 ? "s" : ""} found</p>
        </div>
        {user.role === "citizen" && (
          <Btn onClick={onCreate}>＋ Report Issue</Btn>
        )}
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "end" }}>
          <Input placeholder="🔍 Search issues…" value={filters.search} onChange={e => setFilter("search", e.target.value)} />
          <select value={filters.status} onChange={e => setFilter("status", e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, background: "#fff", color: "#374151" }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={filters.category} onChange={e => setFilter("category", e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, background: "#fff", color: "#374151" }}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
          </select>
          <select value={filters.priority} onChange={e => setFilter("priority", e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, background: "#fff", color: "#374151" }}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </Card>

      {/* Issue cards */}
      {loading ? <Spinner /> : issues.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ fontSize: 16, fontWeight: 500 }}>No issues found</p>
          {user.role === "citizen" && <Btn onClick={onCreate} style={{ marginTop: 12 }}>Report your first issue</Btn>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {issues.map(issue => (
            <Card key={issue.id} onClick={() => onSelect(issue.id)} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18 }}>{CAT_ICON[issue.category]}</span>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400 }}>{issue.title}</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{issue.description}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Badge status={issue.status} type="status" />
                    <Badge status={issue.priority} type="priority" />
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>#{issue.id.slice(0, 6)}</span>
                    {issue.location?.address && <span style={{ fontSize: 12, color: "#9ca3af" }}>📍 {issue.location.address}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo(issue.updatedAt)}</div>
                  {issue.assignedTo && <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>● Assigned</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <Btn variant="ghost" disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>← Prev</Btn>
          <span style={{ padding: "10px 16px", fontSize: 14, color: "#374151" }}>Page {filters.page} of {pagination.pages}</span>
          <Btn variant="ghost" disabled={filters.page >= pagination.pages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next →</Btn>
        </div>
      )}
    </div>
  );
};

// ─── Issue Detail ─────────────────────────────────────────────────────────────
const IssueDetail = ({ issueId, user, onBack, onUpdated }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: "", note: "" });
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getIssue(issueId);
    if (res.success) { setData(res.data); setStatusForm(f => ({ ...f, status: res.data.issue.status })); }
    setLoading(false);
  }, [issueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async () => {
    setUpdating(true);
    const res = await api.updateStatus(issueId, statusForm.status, statusForm.note);
    if (res.success) { showToast("Status updated successfully"); setShowStatusForm(false); load(); onUpdated?.(); }
    else showToast("Failed to update", "error");
    setUpdating(false);
  };

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color: "#ef4444" }}>Issue not found.</div>;
  const { issue, history } = data;
  const canUpdateStatus = ["official", "supervisor"].includes(user.role);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0, flex: 1 }}>Issue Detail</h2>
        {canUpdateStatus && <Btn onClick={() => setShowStatusForm(s => !s)} variant={showStatusForm ? "secondary" : "primary"}>
          {showStatusForm ? "Cancel" : "Update Status"}
        </Btn>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>{CAT_ICON[issue.category]}</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>{issue.title}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge status={issue.status} type="status" />
                  <Badge status={issue.priority} type="priority" />
                  <span style={{ fontSize: 12, color: "#9ca3af", padding: "2px 10px", background: "#f9fafb", borderRadius: 20 }}>{issue.category}</span>
                </div>
              </div>
            </div>
            <p style={{ color: "#374151", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{issue.description}</p>
          </Card>

          {/* Status update form */}
          {showStatusForm && (
            <Card style={{ border: "1.5px solid #3b82f6" }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: "#1e40af", marginTop: 0 }}>Update Status</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Select label="New Status" value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </Select>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Note</label>
                  <textarea rows={3} value={statusForm.note} onChange={e => setStatusForm(f => ({ ...f, note: e.target.value }))} placeholder="Add a note…"
                    style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "vertical", outline: "none", color: "#111827" }} />
                </div>
                <Btn onClick={handleStatusUpdate} disabled={updating}>{updating ? "Saving…" : "Save Changes"}</Btn>
              </div>
            </Card>
          )}

          {/* History */}
          <Card>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginTop: 0, marginBottom: 16 }}>Audit Trail</h4>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 2, background: "#e5e7eb" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {history.map((h, i) => (
                  <div key={h.id} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "#dbeafe" : "#f0fdf4", border: `2px solid ${i === 0 ? "#3b82f6" : "#86efac"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, zIndex: 1 }}>
                      {h.action === "created" ? "+" : "↑"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                        {h.action === "created" ? "Issue created" : `Status → ${STATUS_META[h.to]?.label || h.to}`}
                      </div>
                      {h.note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{h.note}</div>}
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{formatDate(h.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</h4>
            {[
              ["ID", `#${issue.id.slice(0, 8)}`],
              ["Category", `${CAT_ICON[issue.category]} ${issue.category}`],
              ["Reported", formatDate(issue.createdAt)],
              ["Last Update", formatDate(issue.updatedAt)],
              ["First Response", issue.firstResponseAt ? formatDate(issue.firstResponseAt) : "Pending"],
              ["Resolved", issue.resolvedAt ? formatDate(issue.resolvedAt) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>{k}</span>
                <span style={{ color: "#374151", fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </Card>
          {issue.location && (
            <Card>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Location</h4>
              {issue.location.address && <p style={{ fontSize: 13, color: "#374151", margin: "0 0 8px" }}>📍 {issue.location.address}</p>}
              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Lat: {issue.location.lat?.toFixed(4)}, Lng: {issue.location.lng?.toFixed(4)}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Create Issue ─────────────────────────────────────────────────────────────
const CreateIssue = ({ user, onCreated, onCancel }) => {
  const [form, setForm] = useState({ title: "", description: "", category: "roads", priority: "medium", location: { address: "", lat: "", lng: "" } });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (form.title.length < 5) e.title = "Title must be at least 5 characters";
    if (form.description.length < 10) e.description = "Description must be at least 10 characters";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    const res = await api.createIssue({ ...form, location: form.location.address ? { address: form.location.address, lat: parseFloat(form.location.lat) || 0, lng: parseFloat(form.location.lng) || 0 } : null });
    if (res.success) onCreated(res.data.issue);
    setLoading(false);
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Btn variant="ghost" onClick={onCancel}>← Cancel</Btn>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Report a New Issue</h2>
      </div>
      <div style={{ maxWidth: 640 }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <Input label="Title *" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Brief description of the issue" />
              {errors.title && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{errors.title}</p>}
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>Description *</label>
              <textarea rows={4} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Provide as much detail as possible…"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "vertical", outline: "none", color: "#111827", boxSizing: "border-box" }} />
              {errors.description && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{errors.description}</p>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Select label="Category" value={form.category} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </Select>
              <Select label="Priority" value={form.priority} onChange={e => set("priority", e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div style={{ background: "#f8faff", borderRadius: 10, padding: "16px" }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 0, marginBottom: 12 }}>📍 Location (optional)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Input placeholder="Street address" value={form.location.address} onChange={e => setForm(f => ({ ...f, location: { ...f.location, address: e.target.value } }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input placeholder="Latitude" value={form.location.lat} onChange={e => setForm(f => ({ ...f, location: { ...f.location, lat: e.target.value } }))} />
                  <Input placeholder="Longitude" value={form.location.lng} onChange={e => setForm(f => ({ ...f, location: { ...f.location, lng: e.target.value } }))} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
              <Btn onClick={handleSubmit} disabled={loading}>{loading ? "Submitting…" : "Submit Report"}</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Analytics Dashboard ──────────────────────────────────────────────────────
const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalytics().then(res => { if (res.success) setData(res.data); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;
  if (!data) return null;

  const statusChartData = data.by_status.map(s => ({ key: s.status, label: STATUS_META[s.status]?.label || s.status, value: s.total }));
  const catChartData = data.by_category.map(c => ({ key: c.category, label: c.category.slice(0, 5), value: c.total }));

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 0, marginBottom: 4 }}>Analytics Overview</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>Public transparency dashboard — all figures are live from the in-memory store.</p>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <MetricCard label="Total Issues" value={data.total_issues} icon="📋" color="#0f172a" sub="all time" />
        <MetricCard label="Resolved" value={data.resolved_count} icon="✅" color="#16a34a" sub={`${data.resolved_pct}% resolution rate`} />
        <MetricCard label="Open" value={data.by_status.find(s => s.status === "open")?.total || 0} icon="🔵" color="#2563eb" sub="awaiting action" />
        <MetricCard label="In Progress" value={data.by_status.find(s => s.status === "in_progress")?.total || 0} icon="🟡" color="#d97706" sub="being worked on" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Status funnel */}
        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginTop: 0, marginBottom: 16 }}>Issues by Status</h3>
          <MiniBarChart data={statusChartData} colorKey="status" />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {data.by_status.filter(s => s.total > 0).map(s => (
              <div key={s.status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Badge status={s.status} type="status" />
                <div style={{ flex: 1, margin: "0 12px", height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${data.total_issues ? (s.total / data.total_issues) * 100 : 0}%`, background: STATUS_META[s.status]?.color || "#94a3b8", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", minWidth: 24, textAlign: "right" }}>{s.total}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Category breakdown */}
        <Card>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginTop: 0, marginBottom: 16 }}>Issues by Category</h3>
          <MiniBarChart data={catChartData} colorKey="category" />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {data.by_category.sort((a, b) => b.total - a.total).map(c => (
              <div key={c.category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span style={{ color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>{CAT_ICON[c.category]} {c.category}</span>
                <div style={{ flex: 1, margin: "0 12px", height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${data.total_issues ? (c.total / data.total_issues) * 100 : 0}%`, background: "#2563eb", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{c.total}</span>
                  <span style={{ color: "#16a34a", fontSize: 11 }}>{c.resolved_pct}% resolved</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Resolution times */}
        <Card style={{ gridColumn: "span 2" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginTop: 0, marginBottom: 16 }}>Resolution Times by Category</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Category", "Total", "Resolved", "Resolution Rate", "Avg Resolution Time"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.by_category.sort((a, b) => b.total - a.total).map((c, i) => (
                  <tr key={c.category} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500, color: "#374151" }}>{CAT_ICON[c.category]} {c.category}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{c.total}</td>
                    <td style={{ padding: "10px 12px", color: "#16a34a" }}>{c.resolved_count}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "#f0fdf4", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${c.resolved_pct}%`, background: "#16a34a", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>{c.resolved_pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>
                      {c.avg_resolution_hours ? `${c.avg_resolution_hours}h` : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("issues"); // issues | detail | create | analytics
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  if (!user) return <AuthScreen onLogin={u => { setUser(u); showToast(`Welcome back, ${u.name}!`); }} />;

  const NAV = [
    { id: "issues", label: user.role === "citizen" ? "My Reports" : "All Issues", icon: "📋" },
    ...(!["citizen"].includes(user.role) ? [{ id: "analytics", label: "Analytics", icon: "📊" }] : []),
  ];

  const roleColor = { citizen: "#2563eb", official: "#7c3aed", supervisor: "#059669" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: "#f8fafc" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Sidebar */}
      <div style={{ width: sidebarOpen ? 240 : 64, background: "#0f172a", transition: "width 0.25s ease", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Brand */}
        <div style={{ padding: sidebarOpen ? "24px 20px 20px" : "24px 14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarOpen(o => !o)}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🏛️</span>
          {sidebarOpen && <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1 }}>CivicTrack</div><div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>Issue Platform</div></div>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: sidebarOpen ? "10px 12px" : "10px", borderRadius: 8, background: view === n.id ? "rgba(59,130,246,0.2)" : "transparent", border: "none", color: view === n.id ? "#60a5fa" : "#94a3b8", cursor: "pointer", transition: "all 0.15s", fontSize: 14, fontWeight: view === n.id ? 600 : 400, marginBottom: 2 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
              {sidebarOpen && n.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: roleColor[user.role] || "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                <div style={{ color: "#64748b", fontSize: 11, textTransform: "capitalize" }}>{user.role}</div>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button onClick={() => { api.logout(); setUser(null); showToast("Signed out"); }}
              style={{ width: "100%", marginTop: 12, padding: "8px", borderRadius: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: 12, cursor: "pointer" }}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px" }}>
          {view === "issues" && selectedIssueId === null && (
            <IssueList user={user}
              onSelect={id => { setSelectedIssueId(id); setView("detail"); }}
              onCreate={() => setView("create")} />
          )}
          {view === "detail" && selectedIssueId && (
            <IssueDetail issueId={selectedIssueId} user={user}
              onBack={() => { setSelectedIssueId(null); setView("issues"); }}
              onUpdated={() => showToast("Issue updated")} />
          )}
          {view === "create" && (
            <CreateIssue user={user}
              onCreated={issue => { showToast("Issue reported successfully!"); setSelectedIssueId(issue.id); setView("detail"); }}
              onCancel={() => setView("issues")} />
          )}
          {view === "analytics" && <Analytics />}
        </div>
      </div>
    </div>
  );
}
