import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";
import { HeroGeometric } from "./components/ui/shape-landing-hero.tsx";

const CATEGORIES = ["roads", "sanitation", "water", "electricity", "parks", "safety", "other"];
const STATUSES = ["open", "in_progress", "resolved", "closed", "rejected"];
const PRIORITIES = ["low", "medium", "high", "critical"];

// Dark-theme aware status/priority meta
const STATUS_META = {
  open:        { label: "Open",        color: "#818cf8", bg: "rgba(99,102,241,0.15)",  text: "#a5b4fc" },
  in_progress: { label: "In Progress", color: "#fb923c", bg: "rgba(251,146,60,0.15)",  text: "#fdba74" },
  resolved:    { label: "Resolved",    color: "#34d399", bg: "rgba(52,211,153,0.15)",  text: "#6ee7b7" },
  closed:      { label: "Closed",      color: "#94a3b8", bg: "rgba(148,163,184,0.12)", text: "#cbd5e1" },
  rejected:    { label: "Rejected",    color: "#f87171", bg: "rgba(248,113,113,0.15)", text: "#fca5a5" },
};
const PRIORITY_META = {
  low:      { label: "Low",      color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  medium:   { label: "Medium",   color: "#818cf8", bg: "rgba(99,102,241,0.15)"  },
  high:     { label: "High",     color: "#fb923c", bg: "rgba(251,146,60,0.15)"  },
  critical: { label: "Critical", color: "#f87171", bg: "rgba(248,113,113,0.15)" },
};
const CAT_ICON = { roads:"🛣️", sanitation:"🗑️", water:"💧", electricity:"⚡", parks:"🌳", safety:"🚨", other:"📋" };
const ROLE_COLOR = { citizen: "#818cf8", official: "#c084fc", supervisor: "#34d399" };

// Dark theme tokens
const T = {
  bg:       "#030303",
  surface:  "rgba(255,255,255,0.04)",
  surface2: "rgba(255,255,255,0.07)",
  border:   "rgba(255,255,255,0.10)",
  border2:  "rgba(255,255,255,0.16)",
  text:     "#f1f5f9",
  muted:    "#94a3b8",
  dim:      "#475569",
  indigo:   "#818cf8",
  rose:     "#fb7185",
  grad:     "linear-gradient(135deg,#4f46e5,#7c3aed)",
};

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmt(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—";
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
const Badge = ({ status, type = "status" }) => {
  const meta = type === "status" ? STATUS_META[status] : PRIORITY_META[status];
  if (!meta) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600, letterSpacing:"0.03em", background:meta.bg, color:meta.text||meta.color, border:`1px solid ${meta.color}44` }}>
      {type === "status" && <span style={{ width:6, height:6, borderRadius:"50%", background:meta.color, display:"inline-block" }} />}
      {meta.label}
    </span>
  );
};

const Card = ({ children, style={}, onClick }) => (
  <div onClick={onClick}
    style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:"20px 24px", cursor:onClick?"pointer":"default", transition:"box-shadow 0.15s,transform 0.1s,border-color 0.15s", ...style }}
    onMouseEnter={onClick ? e => { e.currentTarget.style.boxShadow="0 4px 24px rgba(99,102,241,0.15)"; e.currentTarget.style.borderColor=T.border2; e.currentTarget.style.transform="translateY(-1px)"; } : undefined}
    onMouseLeave={onClick ? e => { e.currentTarget.style.boxShadow="none"; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform="none"; } : undefined}>
    {children}
  </div>
);

const MetricCard = ({ label, value, sub, color=T.indigo, icon }) => (
  <div style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:"20px 22px", display:"flex", flexDirection:"column", gap:4 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <span style={{ fontSize:11, color:T.muted, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase" }}>{label}</span>
      {icon && <span style={{ fontSize:20 }}>{icon}</span>}
    </div>
    <div style={{ fontSize:32, fontWeight:700, color, lineHeight:1.1 }}>{value ?? "—"}</div>
    {sub && <div style={{ fontSize:12, color:T.dim }}>{sub}</div>}
  </div>
);

const inputBase = { padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:14, outline:"none", color:T.text, background:T.surface2, width:"100%", boxSizing:"border-box" };

const Inp = ({ label, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    {label && <label style={{ fontSize:13, fontWeight:500, color:T.muted }}>{label}</label>}
    <input style={inputBase}
      onFocus={e => (e.target.style.border=`1.5px solid ${T.indigo}`)}
      onBlur={e => (e.target.style.border=`1px solid ${T.border}`)}
      {...props} />
  </div>
);

const Sel = ({ label, children, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    {label && <label style={{ fontSize:13, fontWeight:500, color:T.muted }}>{label}</label>}
    <select style={{ ...inputBase, cursor:"pointer" }} {...props}>{children}</select>
  </div>
);

const Btn = ({ children, onClick, variant="primary", disabled, style={}, type="button" }) => {
  const variants = {
    primary:   { background:T.grad, color:"#fff", border:"none" },
    secondary: { background:T.surface2, color:T.text, border:`1px solid ${T.border}` },
    danger:    { background:"rgba(248,113,113,0.12)", color:"#fca5a5", border:"1px solid rgba(248,113,113,0.3)" },
    ghost:     { background:"transparent", color:T.muted, border:`1px solid ${T.border}` },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      style={{ padding:"10px 20px", borderRadius:8, fontSize:14, fontWeight:600, cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", display:"inline-flex", alignItems:"center", gap:8, opacity:disabled?0.5:1, ...variants[variant], ...style }}
      onMouseEnter={!disabled ? e => (e.currentTarget.style.filter="brightness(1.15)") : undefined}
      onMouseLeave={!disabled ? e => (e.currentTarget.style.filter="none") : undefined}>
      {children}
    </button>
  );
};

const Spinner = () => (
  <div style={{ display:"flex", justifyContent:"center", padding:"48px 0" }}>
    <div style={{ width:32, height:32, border:`3px solid ${T.border}`, borderTop:`3px solid ${T.indigo}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const Toast = ({ msg, type="success" }) => {
  const c = type === "success"
    ? { bg:"rgba(52,211,153,0.12)", border:"rgba(52,211,153,0.3)", text:"#6ee7b7" }
    : { bg:"rgba(248,113,113,0.12)", border:"rgba(248,113,113,0.3)", text:"#fca5a5" };
  return (
    <div style={{ position:"fixed", top:24, right:24, background:c.bg, border:`1px solid ${c.border}`, backdropFilter:"blur(12px)", color:c.text, padding:"12px 20px", borderRadius:10, fontWeight:500, fontSize:14, zIndex:9999, boxShadow:"0 4px 24px rgba(0,0,0,0.4)", animation:"slideIn 0.25s ease" }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100px);opacity:0}}`}</style>
      {type === "success" ? "✓" : "✗"} {msg}
    </div>
  );
};

const MiniBarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const colors = { open:"#818cf8", in_progress:"#fb923c", resolved:"#34d399", closed:"#94a3b8", rejected:"#f87171", roads:"#818cf8", sanitation:"#34d399", water:"#38bdf8", electricity:"#fbbf24", parks:"#4ade80", safety:"#f87171", other:"#c084fc" };
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:10, color:T.text, fontWeight:600 }}>{d.value}</span>
          <div style={{ width:"100%", background:colors[d.key]||"#94a3b8", borderRadius:"3px 3px 0 0", height:`${Math.max((d.value/max)*60, d.value>0?8:0)}px`, transition:"height 0.4s ease", opacity:0.85 }} />
          <span style={{ fontSize:9, color:T.dim, textAlign:"center", lineHeight:1.2 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
const PRESETS = [
  { label:"Citizen",    email:"jane@example.com", password:"Secure123!", role:"citizen" },
  { label:"Official",   email:"bob@city.gov",      password:"Secure123!", role:"official" },
  { label:"Supervisor", email:"alice@city.gov",    password:"Secure123!", role:"supervisor" },
];

const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name:"", email:"bob@city.gov", password:"Secure123!", role:"official" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]:v }));

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const res = mode === "login"
        ? await api.login(form.email, form.password)
        : await api.register(form.name, form.email, form.password, form.role);
      if (res?.success) onLogin(res.data.user);
      else setError(res?.message || "Authentication failed.");
    } catch {
      setError("Cannot reach server. Is the backend running on port 3000?");
    }
    setLoading(false);
  };

  const iStyle = { padding:"11px 14px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ width:420, background:T.surface, backdropFilter:"blur(20px)", border:`1px solid ${T.border}`, borderRadius:20, padding:40 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:56, height:56, background:T.grad, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:28 }}>🏛️</div>
          <h1 style={{ color:T.text, fontSize:22, fontWeight:700, margin:0 }}>CivicTrack</h1>
          <p style={{ color:T.muted, fontSize:13, marginTop:4 }}>Civic Issue Reporting Platform</p>
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {PRESETS.map(p => (
            <button key={p.role} onClick={() => setForm(f => ({ ...f, email:p.email, password:p.password, role:p.role }))}
              style={{ flex:1, padding:"8px 0", borderRadius:8, border:`1px solid ${form.email===p.email ? T.indigo : T.border}`, background:form.email===p.email ? "rgba(129,140,248,0.2)" : "transparent", color:form.email===p.email ? "#a5b4fc" : T.muted, fontSize:12, cursor:"pointer", fontWeight:500, transition:"all 0.15s" }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {mode === "register" && (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={{ fontSize:13, color:T.muted }}>Full name</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Citizen" style={iStyle} />
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label style={{ fontSize:13, color:T.muted }}>Email</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} style={iStyle} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label style={{ fontSize:13, color:T.muted }}>Password</label>
            <input type="password" value={form.password} onChange={e => set("password", e.target.value)} style={iStyle} />
          </div>
          {mode === "register" && (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={{ fontSize:13, color:T.muted }}>Role</label>
              <select value={form.role} onChange={e => set("role", e.target.value)} style={{ ...iStyle, background:"#0d1117" }}>
                <option value="citizen">Citizen</option>
                <option value="official">Official</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
          )}
          {error && <div style={{ color:"#fca5a5", fontSize:13, background:"rgba(248,113,113,0.1)", padding:"8px 12px", borderRadius:8, border:"1px solid rgba(248,113,113,0.2)" }}>⚠ {error}</div>}
          <button onClick={handleSubmit} disabled={loading}
            style={{ marginTop:4, padding:12, borderRadius:8, background:T.grad, color:"#fff", fontWeight:600, fontSize:15, border:"none", cursor:loading?"not-allowed":"pointer", opacity:loading?0.8:1 }}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
        <p style={{ textAlign:"center", marginTop:20, color:T.dim, fontSize:13 }}>
          {mode === "login" ? "No account? " : "Have an account? "}
          <button onClick={() => setMode(m => m==="login"?"register":"login")} style={{ color:"#a5b4fc", background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>
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
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status:"", category:"", priority:"", search:"", page:1 });
  const [pagination, setPagination] = useState({ total:0, pages:1 });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const res = await api.getIssues({ ...filters, limit:8 });
    if (res?.success) {
      const payload = res.data;
      const list = Array.isArray(payload) ? payload : (payload.data ?? payload.issues ?? []);
      const total = payload.total ?? list.length;
      const pages = payload.pages ?? Math.ceil(total / 8);
      setIssues(list);
      setPagination({ total, pages });
    } else {
      setError(res?.message || "Failed to load issues.");
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]:v, page:1 }));

  const selStyle = { padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:13, background:T.surface2, color:T.text, cursor:"pointer", outline:"none" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, color:T.text, margin:0 }}>
            {user.role === "citizen" ? "My Reports" : "All Issues"}
          </h2>
          <p style={{ color:T.muted, fontSize:13, margin:"4px 0 0" }}>{pagination.total} issue{pagination.total!==1?"s":""}</p>
        </div>
        {user.role === "citizen" && <Btn onClick={onCreate}>＋ Report Issue</Btn>}
      </div>

      <Card style={{ marginBottom:20, padding:"16px 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:12, alignItems:"end" }}>
          <Inp placeholder="🔍 Search issues…" value={filters.search} onChange={e => setF("search", e.target.value)} />
          {[
            { key:"status",   opts:STATUSES,   meta:STATUS_META,   label:"All Statuses" },
            { key:"category", opts:CATEGORIES, meta:null,          label:"All Categories" },
            { key:"priority", opts:PRIORITIES, meta:PRIORITY_META, label:"All Priorities" },
          ].map(({ key, opts, meta, label }) => (
            <select key={key} value={filters[key]} onChange={e => setF(key, e.target.value)} style={selStyle}>
              <option value="">{label}</option>
              {opts.map(o => <option key={o} value={o}>{key==="category"?`${CAT_ICON[o]} `:""}{meta?meta[o]?.label:o}</option>)}
            </select>
          ))}
        </div>
      </Card>

      {error && <div style={{ color:"#fca5a5", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:14 }}>⚠ {error}</div>}

      {loading ? <Spinner /> : issues.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
          <p style={{ fontSize:16, fontWeight:500 }}>No issues found</p>
          {user.role === "citizen" && <Btn onClick={onCreate} style={{ marginTop:12 }}>Report your first issue</Btn>}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {issues.map(issue => (
            <Card key={issue.id} onClick={() => onSelect(issue.id)} style={{ padding:"16px 20px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:18 }}>{CAT_ICON[issue.category]}</span>
                    <h3 style={{ fontSize:15, fontWeight:600, color:T.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:400 }}>{issue.title}</h3>
                  </div>
                  <p style={{ fontSize:13, color:T.muted, margin:"0 0 10px", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{issue.description}</p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <Badge status={issue.status} type="status" />
                    <Badge status={issue.priority} type="priority" />
                    <span style={{ fontSize:12, color:T.dim }}>#{issue.id?.slice(0,8)}</span>
                    {issue.location?.address && <span style={{ fontSize:12, color:T.dim }}>📍 {issue.location.address}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:12, color:T.dim }}>{timeAgo(issue.updatedAt)}</div>
                  {issue.assignedTo && <div style={{ fontSize:11, color:T.indigo, marginTop:4 }}>● Assigned</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:20 }}>
          <Btn variant="ghost" disabled={filters.page<=1} onClick={() => setFilters(f => ({ ...f, page:f.page-1 }))}>← Prev</Btn>
          <span style={{ padding:"10px 16px", fontSize:14, color:T.muted }}>Page {filters.page} of {pagination.pages}</span>
          <Btn variant="ghost" disabled={filters.page>=pagination.pages} onClick={() => setFilters(f => ({ ...f, page:f.page+1 }))}>Next →</Btn>
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
  const [statusForm, setStatusForm] = useState({ status:"", note:"" });
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getIssue(issueId);
    if (res?.success) { setData(res.data); setStatusForm(f => ({ ...f, status:res.data.issue?.status||"" })); }
    setLoading(false);
  }, [issueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async () => {
    setUpdating(true);
    const res = await api.updateStatus(issueId, statusForm.status, statusForm.note);
    if (res?.success) { showToast("Status updated"); setShowForm(false); load(); onUpdated?.(); }
    else showToast(res?.message || "Update failed", "error");
    setUpdating(false);
  };

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color:"#fca5a5", padding:24 }}>Issue not found.</div>;

  const { issue, history=[] } = data;
  const canUpdate = ["official","supervisor"].includes(user.role);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <h2 style={{ fontSize:20, fontWeight:700, color:T.text, margin:0, flex:1 }}>Issue Detail</h2>
        {canUpdate && <Btn onClick={() => setShowForm(s => !s)} variant={showForm?"secondary":"primary"}>{showForm?"Cancel":"Update Status"}</Btn>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, alignItems:"start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Card>
            <div style={{ display:"flex", gap:12, marginBottom:16 }}>
              <span style={{ fontSize:32 }}>{CAT_ICON[issue.category]}</span>
              <div>
                <h3 style={{ fontSize:18, fontWeight:700, color:T.text, margin:"0 0 8px" }}>{issue.title}</h3>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <Badge status={issue.status} type="status" />
                  <Badge status={issue.priority} type="priority" />
                  <span style={{ fontSize:12, color:T.dim, padding:"2px 10px", background:T.surface2, borderRadius:20 }}>{issue.category}</span>
                </div>
              </div>
            </div>
            <p style={{ color:T.muted, fontSize:14, lineHeight:1.7, margin:0 }}>{issue.description}</p>
          </Card>

          {showForm && (
            <Card style={{ border:`1.5px solid ${T.indigo}` }}>
              <h4 style={{ fontSize:14, fontWeight:600, color:"#a5b4fc", marginTop:0 }}>Update Status</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <Sel label="New Status" value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status:e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </Sel>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:T.muted }}>Note</label>
                  <textarea rows={3} value={statusForm.note} onChange={e => setStatusForm(f => ({ ...f, note:e.target.value }))} placeholder="Add a note…"
                    style={{ padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:14, resize:"vertical", outline:"none", color:T.text, background:T.surface2, width:"100%", boxSizing:"border-box" }} />
                </div>
                <Btn onClick={handleStatusUpdate} disabled={updating}>{updating?"Saving…":"Save Changes"}</Btn>
              </div>
            </Card>
          )}

          <Card>
            <h4 style={{ fontSize:14, fontWeight:600, color:T.muted, marginTop:0, marginBottom:16 }}>Audit Trail</h4>
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:11, top:0, bottom:0, width:2, background:T.border }} />
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {history.map((h, i) => (
                  <div key={h.id||i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:i===0?"rgba(129,140,248,0.2)":"rgba(52,211,153,0.15)", border:`2px solid ${i===0?T.indigo:"#34d399"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:10, zIndex:1, color:i===0?T.indigo:"#34d399" }}>
                      {h.action==="created"?"+":"↑"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:T.text, fontWeight:500 }}>
                        {h.action==="created" ? "Issue created" : `Status → ${STATUS_META[h.to]?.label||h.to}`}
                      </div>
                      {h.note && <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>{h.note}</div>}
                      <div style={{ fontSize:11, color:T.dim, marginTop:2 }}>{fmt(h.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <Card>
            <h4 style={{ fontSize:12, fontWeight:600, color:T.dim, marginTop:0, textTransform:"uppercase", letterSpacing:"0.06em" }}>Details</h4>
            {[
              ["ID", `#${issue.id?.slice(0,8)}`],
              ["Category", `${CAT_ICON[issue.category]} ${issue.category}`],
              ["Reported", fmt(issue.createdAt)],
              ["Last Update", fmt(issue.updatedAt)],
              ["First Response", issue.firstResponseAt ? fmt(issue.firstResponseAt) : "Pending"],
              ["Resolved", issue.resolvedAt ? fmt(issue.resolvedAt) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.border}`, fontSize:13 }}>
                <span style={{ color:T.dim }}>{k}</span>
                <span style={{ color:T.text, fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </Card>
          {issue.location && (
            <Card>
              <h4 style={{ fontSize:12, fontWeight:600, color:T.dim, marginTop:0, textTransform:"uppercase", letterSpacing:"0.06em" }}>Location</h4>
              {issue.location.address && <p style={{ fontSize:13, color:T.text, margin:"0 0 8px" }}>📍 {issue.location.address}</p>}
              <p style={{ fontSize:12, color:T.muted, margin:0 }}>Lat: {issue.location.lat?.toFixed(4)}, Lng: {issue.location.lng?.toFixed(4)}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Create Issue ─────────────────────────────────────────────────────────────
const CreateIssue = ({ onCreated, onCancel }) => {
  const [form, setForm] = useState({ title:"", description:"", category:"roads", priority:"medium", location:{ address:"", lat:"", lng:"" } });
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
    const payload = { ...form, location: form.location.address ? { address:form.location.address, lat:parseFloat(form.location.lat)||0, lng:parseFloat(form.location.lng)||0 } : undefined };
    const res = await api.createIssue(payload);
    if (res?.success) onCreated(res.data.issue);
    else setErrors({ submit: res?.message || "Failed to create issue." });
    setLoading(false);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]:v }));

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <Btn variant="ghost" onClick={onCancel}>← Cancel</Btn>
        <h2 style={{ fontSize:20, fontWeight:700, color:T.text, margin:0 }}>Report a New Issue</h2>
      </div>
      <div style={{ maxWidth:640 }}>
        <Card>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div>
              <Inp label="Title *" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Brief description of the issue" />
              {errors.title && <p style={{ color:"#fca5a5", fontSize:12, marginTop:4 }}>{errors.title}</p>}
            </div>
            <div>
              <label style={{ fontSize:13, fontWeight:500, color:T.muted, display:"block", marginBottom:6 }}>Description *</label>
              <textarea rows={4} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Provide as much detail as possible…"
                style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`, fontSize:14, resize:"vertical", outline:"none", color:T.text, background:T.surface2, boxSizing:"border-box" }} />
              {errors.description && <p style={{ color:"#fca5a5", fontSize:12, marginTop:4 }}>{errors.description}</p>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Sel label="Category" value={form.category} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </Sel>
              <Sel label="Priority" value={form.priority} onChange={e => set("priority", e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </Sel>
            </div>
            <div style={{ background:T.surface2, borderRadius:10, padding:16, border:`1px solid ${T.border}` }}>
              <h4 style={{ fontSize:13, fontWeight:600, color:T.muted, marginTop:0, marginBottom:12 }}>📍 Location (optional)</h4>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <Inp placeholder="Street address" value={form.location.address} onChange={e => setForm(f => ({ ...f, location:{ ...f.location, address:e.target.value } }))} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <Inp placeholder="Latitude" value={form.location.lat} onChange={e => setForm(f => ({ ...f, location:{ ...f.location, lat:e.target.value } }))} />
                  <Inp placeholder="Longitude" value={form.location.lng} onChange={e => setForm(f => ({ ...f, location:{ ...f.location, lng:e.target.value } }))} />
                </div>
              </div>
            </div>
            {errors.submit && <div style={{ color:"#fca5a5", fontSize:13, background:"rgba(248,113,113,0.1)", padding:"8px 12px", borderRadius:8, border:"1px solid rgba(248,113,113,0.2)" }}>⚠ {errors.submit}</div>}
            <div style={{ display:"flex", gap:12, justifyContent:"flex-end" }}>
              <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
              <Btn onClick={handleSubmit} disabled={loading}>{loading?"Submitting…":"Submit Report"}</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Analytics ────────────────────────────────────────────────────────────────
const Analytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getAnalytics().then(res => {
      if (res?.success) setData(res.data);
      else setError(res?.message || "Failed to load analytics.");
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color:"#fca5a5", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, padding:"12px 16px", fontSize:14 }}>⚠ {error}</div>;
  if (!data) return null;

  const byStatus = data.by_status || [];
  const byCategory = data.by_category || [];
  const totalIssues = data.total_issues ?? byStatus.reduce((s, x) => s + x.total, 0);
  const statusChart = byStatus.map(s => ({ key:s.status, label:STATUS_META[s.status]?.label?.slice(0,5)||s.status, value:s.total }));
  const catChart = byCategory.map(c => ({ key:c.category, label:c.category.slice(0,5), value:c.total }));

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:700, color:T.text, marginTop:0, marginBottom:4 }}>Analytics Overview</h2>
      <p style={{ color:T.muted, fontSize:13, marginBottom:24 }}>Live data from the backend.</p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <MetricCard label="Total Issues" value={totalIssues} icon="📋" color={T.text} sub="all time" />
        <MetricCard label="Resolved" value={data.resolved_count} icon="✅" color="#34d399" sub={`${data.resolved_pct??0}% rate`} />
        <MetricCard label="Open" value={byStatus.find(s=>s.status==="open")?.total??0} icon="🔵" color={T.indigo} sub="awaiting action" />
        <MetricCard label="In Progress" value={byStatus.find(s=>s.status==="in_progress")?.total??0} icon="🟡" color="#fb923c" sub="being worked on" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <Card>
          <h3 style={{ fontSize:15, fontWeight:600, color:T.text, marginTop:0, marginBottom:16 }}>Issues by Status</h3>
          {statusChart.length > 0 && <MiniBarChart data={statusChart} />}
          <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
            {byStatus.filter(s=>s.total>0).map(s => (
              <div key={s.status} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <Badge status={s.status} type="status" />
                <div style={{ flex:1, margin:"0 12px", height:6, background:T.surface2, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${totalIssues?(s.total/totalIssues)*100:0}%`, background:STATUS_META[s.status]?.color||T.muted, borderRadius:3, transition:"width 0.6s ease" }} />
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:T.text, minWidth:24, textAlign:"right" }}>{s.total}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 style={{ fontSize:15, fontWeight:600, color:T.text, marginTop:0, marginBottom:16 }}>Issues by Category</h3>
          {catChart.length > 0 && <MiniBarChart data={catChart} />}
          <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
            {[...byCategory].sort((a,b)=>b.total-a.total).map(c => (
              <div key={c.category} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
                <span style={{ color:T.text, display:"flex", alignItems:"center", gap:6 }}>{CAT_ICON[c.category]} {c.category}</span>
                <div style={{ flex:1, margin:"0 12px", height:6, background:T.surface2, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${totalIssues?(c.total/totalIssues)*100:0}%`, background:T.indigo, borderRadius:3, transition:"width 0.6s ease" }} />
                </div>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <span style={{ fontWeight:600, color:T.text }}>{c.total}</span>
                  <span style={{ color:"#34d399", fontSize:11 }}>{c.resolved_pct??0}% resolved</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ gridColumn:"span 2" }}>
          <h3 style={{ fontSize:15, fontWeight:600, color:T.text, marginTop:0, marginBottom:16 }}>Resolution Times by Category</h3>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                  {["Category","Total","Resolved","Resolution Rate","Avg Resolution Time"].map(h => (
                    <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:T.dim, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byCategory].sort((a,b)=>b.total-a.total).map((c, i) => (
                  <tr key={c.category} style={{ borderBottom:`1px solid ${T.border}`, background:i%2===0?"transparent":T.surface2 }}>
                    <td style={{ padding:"10px 12px", fontWeight:500, color:T.text }}>{CAT_ICON[c.category]} {c.category}</td>
                    <td style={{ padding:"10px 12px", color:T.muted }}>{c.total}</td>
                    <td style={{ padding:"10px 12px", color:"#34d399" }}>{c.resolved_count??0}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:6, background:T.surface2, borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${c.resolved_pct??0}%`, background:"#34d399", borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:"#34d399" }}>{c.resolved_pct??0}%</span>
                      </div>
                    </td>
                    <td style={{ padding:"10px 12px", color:T.muted }}>
                      {c.avg_resolution_hours ? `${c.avg_resolution_hours}h` : <span style={{ color:T.dim }}>—</span>}
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
  const [user, setUser] = useState(() => api.getStoredUser());
  const [view, setView] = useState("issues");
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const handleLogin = (u) => { setUser(u); showToast(`Welcome, ${u.name}!`); };
  const handleLogout = async () => { await api.logout(); setUser(null); setView("issues"); showToast("Signed out"); };

  if (!user) return (
    <>
      <HeroGeometric badge="Civic Issue Tracker" title1="Report & Track" title2="Civic Issues" />
      <div id="dashboard"><AuthScreen onLogin={handleLogin} /></div>
    </>
  );

  const NAV = [
    { id:"issues",    label:user.role==="citizen"?"My Reports":"All Issues", icon:"📋" },
    ...(user.role !== "citizen" ? [{ id:"analytics", label:"Analytics", icon:"📊" }] : []),
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif", background:T.bg }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Sidebar */}
      <div style={{ width:sidebarOpen?240:64, background:"rgba(255,255,255,0.03)", borderRight:`1px solid ${T.border}`, transition:"width 0.25s ease", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:sidebarOpen?"24px 20px 20px":"24px 14px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={() => setSidebarOpen(o => !o)}>
          <span style={{ fontSize:22, flexShrink:0 }}>🏛️</span>
          {sidebarOpen && (
            <div>
              <div style={{ color:T.text, fontWeight:700, fontSize:15, lineHeight:1 }}>CivicTrack</div>
              <div style={{ color:T.dim, fontSize:10, marginTop:2 }}>Issue Platform</div>
            </div>
          )}
        </div>

        <nav style={{ flex:1, padding:"12px 8px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => { setView(n.id); setSelectedIssueId(null); }}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:sidebarOpen?"10px 12px":10, borderRadius:8, background:view===n.id?"rgba(129,140,248,0.15)":"transparent", border:`1px solid ${view===n.id?"rgba(129,140,248,0.3)":"transparent"}`, color:view===n.id?T.indigo:T.muted, cursor:"pointer", transition:"all 0.15s", fontSize:14, fontWeight:view===n.id?600:400, marginBottom:2 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{n.icon}</span>
              {sidebarOpen && n.label}
            </button>
          ))}
        </nav>

        <div style={{ padding:"16px 12px", borderTop:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:ROLE_COLOR[user.role]||T.indigo, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:13, flexShrink:0, opacity:0.9 }}>
              {user.name?.[0]?.toUpperCase()}
            </div>
            {sidebarOpen && (
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:T.text, fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ color:T.dim, fontSize:11, textTransform:"capitalize" }}>{user.role}</div>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button onClick={handleLogout} style={{ width:"100%", marginTop:12, padding:8, borderRadius:6, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", color:"#fca5a5", fontSize:12, cursor:"pointer" }}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, overflow:"auto" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px" }}>
          {view==="issues" && selectedIssueId===null && (
            <IssueList user={user}
              onSelect={id => { setSelectedIssueId(id); setView("detail"); }}
              onCreate={() => setView("create")} />
          )}
          {view==="detail" && selectedIssueId && (
            <IssueDetail issueId={selectedIssueId} user={user}
              onBack={() => { setSelectedIssueId(null); setView("issues"); }}
              onUpdated={() => showToast("Issue updated")} />
          )}
          {view==="create" && (
            <CreateIssue
              onCreated={issue => { showToast("Issue reported!"); setSelectedIssueId(issue.id); setView("detail"); }}
              onCancel={() => setView("issues")} />
          )}
          {view==="analytics" && <Analytics />}
        </div>
      </div>
    </div>
  );
}
