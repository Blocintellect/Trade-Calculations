const API = "https://api.hyperliquid.xyz/info";
const EXPLORER_URL = "https://app.hyperliquid.xyz/explorer/tx/";
const $ = id => document.getElementById(id);

const walletEl = $("wallet"),
      startEl = $("startDate"),
      endEl = $("endDate"),
      fetchBtn = $("fetchBtn"),
      statusEl = $("status"),
      noticeEl = $("limitNotice"),
      bodyEl = $("tradeBody"),
      positionsBodyEl = $("positionsBody"),
      tableMeta = $("tableMeta"),
      positionsMeta = $("positionsMeta"),
      csvBtn = $("csvBtn"),
      jsonBtn = $("jsonBtn"),
      pdfBtn = $("pdfBtn"),
      tabPositions = $("tabPositions"),
      tabTrades = $("tabTrades"),
      panelPositions = $("panelPositions"),
      panelTrades = $("panelTrades"),
      posBadge = $("posBadge"),
      allBtn = $("allBtn"),
      monthBtn = $("monthBtn"),
      ytdBtn = $("ytdBtn"),
      todayBtn = $("todayBtn"),
      pnlFilterCheckbox = $("pnlFilterCheckbox"),
      themeToggleBtn = $("themeToggleBtn"),
      themeIcon = $("themeIcon"),
      themeLabel = $("themeLabel");

let fills = [];
let activePositions = [];

// Local Storage for Wallet Address
const SAVED_WALLET_KEY = "hyperliquid_saved_wallet";
const SAVED_THEME_KEY = "hyperliquid_theme";

if (localStorage.getItem(SAVED_WALLET_KEY)) {
  walletEl.value = localStorage.getItem(SAVED_WALLET_KEY);
}

walletEl.addEventListener("input", () => {
  localStorage.setItem(SAVED_WALLET_KEY, walletEl.value.trim());
});

// Helper Function: Map B -> Buy, A -> Sell
function mapSide(side) {
  if (!side) return "";
  const s = String(side).toUpperCase();
  if (s === "B") return "Buy";
  if (s === "A") return "Sell";
  return side;
}

// Theme Management
function initTheme() {
  const currentTheme = localStorage.getItem(SAVED_THEME_KEY) || "dark";
  applyTheme(currentTheme);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.remove("dark-theme");
    document.body.classList.add("light-theme");
    themeIcon.textContent = "🌙";
    themeLabel.textContent = "Dark Mode";
  } else {
    document.body.classList.remove("light-theme");
    document.body.classList.add("dark-theme");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light Mode";
  }
  localStorage.setItem(SAVED_THEME_KEY, theme);
}

themeToggleBtn.addEventListener("click", () => {
  const isLight = document.body.classList.contains("light-theme");
  applyTheme(isLight ? "dark" : "light");
});

initTheme();

// Dynamic Date Formatter (YYYY-MM-DD)
function formatDateInput(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setPreset(k) {
  const n = new Date();
  const e = new Date(n);
  let s = new Date(n);

  [allBtn, monthBtn, ytdBtn, todayBtn].forEach(b => b && b.classList.remove("active"));

  if (k === "today") {
    s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (todayBtn) todayBtn.classList.add("active");
  } else if (k === "month") {
    s = new Date(n.getFullYear(), n.getMonth(), 1);
    if (monthBtn) monthBtn.classList.add("active");
  } else if (k === "ytd") {
    s = new Date(n.getFullYear(), 0, 1);
    if (ytdBtn) ytdBtn.classList.add("active");
  } else {
    // Default: Last 30 Days
    s.setDate(s.getDate() - 30);
    if (allBtn) allBtn.classList.add("active");
  }

  startEl.value = formatDateInput(s);
  endEl.value = formatDateInput(e);
}

setPreset("30");

// Tab Navigation
tabPositions.addEventListener("click", () => {
  tabPositions.classList.add("active");
  tabTrades.classList.remove("active");
  panelPositions.classList.remove("hidden");
  panelTrades.classList.add("hidden");
});

tabTrades.addEventListener("click", () => {
  tabTrades.classList.add("active");
  tabPositions.classList.remove("active");
  panelTrades.classList.remove("hidden");
  panelPositions.classList.add("hidden");
});

function setStatus(m, t = "") {
  statusEl.textContent = m;
  statusEl.className = "status" + (t ? " " + t : "");
  statusEl.classList.remove("hidden");
}

function clearStatus() {
  statusEl.className = "status hidden";
  statusEl.textContent = "";
}

function isAddress(v) { return /^0x[a-fA-F0-9]{40}$/.test(v.trim()); }
function msStart(v) { return new Date(v + "T00:00:00").getTime(); }
function msEnd(v) { return new Date(v + "T23:59:59.999").getTime(); }

async function postInfo(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Hyperliquid API status: ${r.status}`);
  return r.json();
}

// Robust Live Active Positions Fetcher
async function fetchActivePositions(user) {
  const cleanUser = user.toLowerCase().trim();
  const active = [];

  try {
    const [perpState, spotState] = await Promise.all([
      postInfo({ type: "clearinghouseState", user: cleanUser }).catch(() => null),
      postInfo({ type: "spotClearinghouseState", user: cleanUser }).catch(() => null)
    ]);

    console.log("Perp State Received:", perpState);
    console.log("Spot State Received:", spotState);

    // 1. Parse Perpetual Open Positions
    if (perpState) {
      const posArray = perpState.assetPositions || perpState.positions || [];
      for (const item of posArray) {
        const p = item?.position || item;
        if (!p) continue;

        const size = Number(p.szi || p.size || 0);
        if (Math.abs(size) > 0.000001) {
          const positionValue = Number(p.positionValue || p.notional || 0);
          const entryPx = Number(p.entryPx || 0);
          const markPx = Math.abs(size) > 0 && positionValue > 0 ? positionValue / Math.abs(size) : entryPx;
          const unrealizedPnl = Number(p.unrealizedPnl || 0);
          const marginUsed = Number(p.marginUsed || p.margin || 0);
          const liquidationPx = p.liquidationPx ? Number(p.liquidationPx) : 0;

          active.push({
            coin: p.coin,
            szi: size,
            entryPx,
            markPx,
            positionValue,
            unrealizedPnl,
            marginUsed,
            liquidationPx,
            type: "PERP"
          });
        }
      }
    }

    // 2. Parse Spot Balances
    if (spotState && Array.isArray(spotState.balances)) {
      for (const b of spotState.balances) {
        const total = Number(b.total || 0);
        const hold = Number(b.hold || 0);
        const netSize = total + hold;

        if (netSize > 0.000001 && b.coin !== "USDC") {
          active.push({
            coin: b.coin,
            szi: netSize,
            entryPx: Number(b.entryNtl || 0) / (netSize || 1),
            markPx: Number(b.entryNtl || 0) / (netSize || 1),
            positionValue: Number(b.entryNtl || 0),
            unrealizedPnl: 0,
            marginUsed: 0,
            liquidationPx: 0,
            type: "SPOT"
          });
        }
      }
    }
  } catch (err) {
    console.error("Error fetching active positions:", err);
  }

  return active;
}

// Fetch Trade Fills by Window
async function fetchFillsByTime(user, startMs, endMs) {
  const cleanUser = user.toLowerCase().trim();
  const out = [], seen = new Set(), week = 7 * 86400000;
  let ws = startMs, limited = false;

  while (ws <= endMs) {
    const we = Math.min(ws + week - 1, endMs);
    let cursor = ws, pages = 0;

    while (cursor <= we) {
      const data = await postInfo({
        type: "userFillsByTime",
        user: cleanUser,
        startTime: cursor,
        endTime: we,
        aggregateByTime: false
      });

      if (!Array.isArray(data)) throw new Error("Invalid response format.");

      for (const f of data) {
        const key = [f.tid ?? "", f.hash ?? "", f.oid ?? "", f.time ?? "", f.coin ?? "", f.px ?? "", f.sz ?? ""].join("|");
        if (!seen.has(key)) {
          seen.add(key);
          out.push(f);
        }
      }

      pages++;
      if (data.length < 2000) break;
      const lt = Number(data.at(-1)?.time);
      if (!Number.isFinite(lt) || lt < cursor) break;
      cursor = lt + 1;
      if (pages >= 10) { limited = true; break; }
    }
    if (limited) break;
    ws = we + 1;
  }

  out.sort((a, b) => Number(b.time) - Number(a.time));
  return { result: out, reachedGlobalLimit: limited };
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function money(v, d = 2) {
  const n = num(v), s = n > 0 ? "+" : n < 0 ? "−" : "";
  return s + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function plainMoney(v, d = 2) {
  return "$" + num(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function formatDate(ms) {
  return new Date(Number(ms)).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setMetric(id, value, s = null) {
  const e = $(id);
  if (!e) return;
  e.textContent = value;
  e.classList.remove("text-positive", "text-negative");
  if (s !== null) {
    if (s > 0) e.classList.add("text-positive");
    if (s < 0) e.classList.add("text-negative");
  }
}

function resetMetrics() {
  ["mFills", "mPnl", "mFees", "mNet", "mUnrealizedPnl", "mVolume"].forEach(id => {
    setMetric(id, "—");
  });
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  pdfBtn.disabled = true;
  posBadge.textContent = "0";
}

function updateCombinedMetrics() {
  const closedPnl = fills.reduce((s, f) => s + num(f.closedPnl), 0);
  const fees = fills.reduce((s, f) => s + num(f.fee), 0);
  const unrealizedPnl = activePositions.reduce((s, p) => s + num(p.unrealizedPnl), 0);
  const netPnl = closedPnl - fees + unrealizedPnl;

  setMetric("mPnl", money(closedPnl, 2), closedPnl);
  setMetric("mFees", plainMoney(fees, 2));
  setMetric("mUnrealizedPnl", money(unrealizedPnl, 2), unrealizedPnl);
  setMetric("mNet", money(netPnl, 2), netPnl);
}

function renderPositions() {
  posBadge.textContent = activePositions.length.toString();

  if (!activePositions.length) {
    positionsBodyEl.innerHTML = '<tr class="empty-row"><td colspan="9">No active open positions found for this account.</td></tr>';
    positionsMeta.textContent = "0 active open positions.";
    return;
  }

  let totalUnrealized = 0;

  positionsBodyEl.innerHTML = activePositions.map(p => {
    const sz = p.szi;
    const side = p.type === "SPOT" ? "SPOT" : (sz > 0 ? "LONG" : "SHORT");
    const entryPx = p.entryPx;
    const markPx = p.markPx;
    const unrealizedPnl = p.unrealizedPnl;
    const margin = p.marginUsed;
    const roe = margin > 0 ? (unrealizedPnl / margin) * 100 : 0;
    const liqPx = p.liquidationPx;

    totalUnrealized += unrealizedPnl;

    const sideBadge = side === "LONG" 
      ? '<span class="badge-long">LONG</span>' 
      : side === "SHORT" 
        ? '<span class="badge-short">SHORT</span>' 
        : '<span class="badge-long" style="background:#1e293b;color:#38bdf8;border-color:#0284c7;">SPOT</span>';

    const pnlClass = unrealizedPnl > 0 ? "text-positive" : unrealizedPnl < 0 ? "text-negative" : "";

    return `<tr>
      <td class="coin-name">${esc(p.coin)}</td>
      <td>${sideBadge}</td>
      <td>${esc(Math.abs(sz))}</td>
      <td>${entryPx > 0 ? plainMoney(entryPx, 4) : "—"}</td>
      <td>${plainMoney(markPx, 4)}</td>
      <td>${liqPx > 0 ? plainMoney(liqPx, 4) : "—"}</td>
      <td>${margin > 0 ? plainMoney(margin, 2) : "—"}</td>
      <td class="${pnlClass}">${money(unrealizedPnl, 2)}</td>
      <td class="${pnlClass}">${roe !== 0 ? roe.toFixed(2) + "%" : "—"}</td>
    </tr>`;
  }).join("");

  positionsMeta.textContent = `${activePositions.length} active position(s) • Total Unrealized P&L: ${money(totalUnrealized, 2)}`;
  updateCombinedMetrics();
}

function getFilteredFills() {
  if (pnlFilterCheckbox.checked) {
    return fills.filter(f => num(f.closedPnl) > 0);
  }
  return fills;
}

function renderTrades() {
  const displayFills = getFilteredFills();

  if (!displayFills.length) {
    bodyEl.innerHTML = '<tr class="empty-row"><td colspan="13">No trade fills found matching criteria.</td></tr>';
    tableMeta.textContent = "No trade fills to show.";
    return;
  }

  const vol = displayFills.reduce((s, f) => s + Math.abs(num(f.px) * num(f.sz)), 0);

  setMetric("mFills", displayFills.length.toLocaleString());
  setMetric("mVolume", plainMoney(vol, 2));

  bodyEl.innerHTML = displayFills.map(f => {
    const p = num(f.closedPnl);
    const d = String(f.dir ?? "");
    const dc = d.toLowerCase().includes("close") ? "dir-close" : "dir-open";
    const rawHash = String(f.hash ?? "");
    const hasHash = rawHash && rawHash !== "null" && rawHash !== "undefined";

    const hashCell = hasHash 
      ? `<a href="${EXPLORER_URL}${esc(rawHash)}" target="_blank" rel="noopener noreferrer" class="hash" title="View on Hyperliquid Explorer: ${esc(rawHash)}">${esc(rawHash)}</a>`
      : '—';

    return `<tr>
      <td>${esc(formatDate(f.time))}</td>
      <td class="coin-name">${esc(f.coin)}</td>
      <td class="${dc}">${esc(d)}</td>
      <td>${esc(mapSide(f.side))}</td>
      <td>${esc(f.px)}</td>
      <td>${esc(f.sz)}</td>
      <td>${plainMoney(Math.abs(num(f.px) * num(f.sz)), 2)}</td>
      <td class="${p > 0 ? "text-positive" : p < 0 ? "text-negative" : ""}">${money(p, 4)}</td>
      <td>${plainMoney(f.fee, 4)}</td>
      <td>${esc(f.feeToken)}</td>
      <td>${esc(f.oid)}</td>
      <td>${esc(f.tid)}</td>
      <td>${hashCell}</td>
    </tr>`;
  }).join("");

  tableMeta.textContent = `${displayFills.length.toLocaleString()} fills shown • ${formatDate(displayFills.at(-1).time)} → ${formatDate(displayFills[0].time)}`;
  
  csvBtn.disabled = false;
  jsonBtn.disabled = false;
  pdfBtn.disabled = false;

  updateCombinedMetrics();
}

pnlFilterCheckbox.addEventListener("change", renderTrades);

fetchBtn.addEventListener("click", async () => {
  clearStatus();
  noticeEl.classList.add("hidden");

  const wallet = walletEl.value.trim();
  if (!isAddress(wallet)) {
    setStatus("Please enter a valid 42-character EVM address beginning with 0x.", "error");
    return;
  }
  if (!startEl.value || !endEl.value) {
    setStatus("Please select valid start and end dates.", "error");
    return;
  }

  const s = msStart(startEl.value), e = msEnd(endEl.value);
  if (s > e) {
    setStatus("Start date must be before or equal to end date.", "error");
    return;
  }

  fetchBtn.disabled = true;
  fills = [];
  activePositions = [];
  resetMetrics();

  try {
    setStatus("Fetching active positions & trade history from Hyperliquid…");

    const [positionsRes, fillsRes] = await Promise.all([
      fetchActivePositions(wallet),
      fetchFillsByTime(wallet, s, e)
    ]);

    activePositions = positionsRes;
    fills = fillsRes.result;

    renderPositions();
    renderTrades();

    if (fillsRes.reachedGlobalLimit) {
      noticeEl.textContent = "Hyperliquid API returned maximum fill capacity (10,000). Older fills may be omitted.";
      noticeEl.classList.remove("hidden");
    }

    setStatus(`Loaded ${activePositions.length} active position(s) & ${fills.length.toLocaleString()} trade fill(s).`, "success");
  } catch (err) {
    console.error(err);
    setStatus("Error fetching data: " + (err?.message || "Check network connection or wallet address."), "error");
  } finally {
    fetchBtn.disabled = false;
  }
});

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows) {
  const c = [
    ["Timestamp", f => new Date(Number(f.time)).toISOString()],
    ["Local Date/Time", f => formatDate(f.time)],
    ["Coin", f => f.coin],
    ["Direction", f => f.dir],
    ["Side", f => mapSide(f.side)],
    ["Price", f => f.px],
    ["Size", f => f.sz],
    ["Notional USD", f => Math.abs(num(f.px) * num(f.sz)).toFixed(8)],
    ["Closed P&L", f => f.closedPnl],
    ["Fee", f => f.fee],
    ["Fee Token", f => f.feeToken],
    ["Order ID", f => f.oid],
    ["Trade ID", f => f.tid],
    ["Hash", f => f.hash]
  ];
  return c.map(x => csvEscape(x[0])).join(",") + "\r\n" +
    rows.map(r => c.map(x => csvEscape(x[1](r))).join(",")).join("\r\n");
}

function downloadBlob(content, name, type) {
  const u = URL.createObjectURL(new Blob([content], { type })),
        a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

csvBtn.addEventListener("click", () => {
  const targetFills = getFilteredFills();
  if (targetFills.length) {
    const filterSuffix = pnlFilterCheckbox.checked ? "-positive-pnl" : "";
    downloadBlob(toCSV(targetFills), `hyperliquid-trades${filterSuffix}-${walletEl.value.trim().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  }
});

jsonBtn.addEventListener("click", () => {
  const targetFills = getFilteredFills();
  if (targetFills.length) {
    const filterSuffix = pnlFilterCheckbox.checked ? "-positive-pnl" : "";
    const mappedFills = targetFills.map(f => ({ ...f, sideFormatted: mapSide(f.side) }));
    downloadBlob(JSON.stringify({ activePositions, fills: mappedFills }, null, 2), `hyperliquid-portfolio${filterSuffix}-${walletEl.value.trim().slice(0, 10)}.json`, "application/json");
  }
});

todayBtn.addEventListener("click", () => setPreset("today"));
monthBtn.addEventListener("click", () => setPreset("month"));
ytdBtn.addEventListener("click", () => setPreset("ytd"));
allBtn.addEventListener("click", () => setPreset("30"));

$("clearBtn").addEventListener("click", () => {
  walletEl.value = "";
  localStorage.removeItem(SAVED_WALLET_KEY);
  setPreset("30");
  fills = [];
  activePositions = [];
  pnlFilterCheckbox.checked = false;
  clearStatus();
  noticeEl.classList.add("hidden");
  bodyEl.innerHTML = '<tr class="empty-row"><td colspan="13">Enter a valid wallet address to display trade history.</td></tr>';
  positionsBodyEl.innerHTML = '<tr class="empty-row"><td colspan="9">Enter a valid wallet address to display active positions.</td></tr>';
  tableMeta.textContent = "No data loaded.";
  positionsMeta.textContent = "Enter wallet address to pull live state.";
  resetMetrics();
});

walletEl.addEventListener("keydown", e => { if (e.key === "Enter") fetchBtn.click(); });