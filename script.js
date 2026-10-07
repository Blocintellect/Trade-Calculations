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
      tableMeta = $("tableMeta"),
      csvBtn = $("csvBtn"),
      jsonBtn = $("jsonBtn"),
      pdfBtn = $("pdfBtn"),
      allBtn = $("allBtn"),
      monthBtn = $("monthBtn"),
      ytdBtn = $("ytdBtn"),
      todayBtn = $("todayBtn"),
      pnlFilterSelect = $("pnlFilterSelect"),
      themeToggleBtn = $("themeToggleBtn"),
      themeIcon = $("themeIcon"),
      themeLabel = $("themeLabel");

let fills = [];

// Local Storage for Wallet Address & Theme
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
  ["mFills", "mPnl", "mFees", "mNet", "mVolume"].forEach(id => {
    setMetric(id, "—");
  });
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  pdfBtn.disabled = true;
}

function updateMetrics() {
  const closedPnl = fills.reduce((s, f) => s + num(f.closedPnl), 0);
  const fees = fills.reduce((s, f) => s + num(f.fee), 0);
  const netPnl = closedPnl - fees;

  setMetric("mPnl", money(closedPnl, 2), closedPnl);
  setMetric("mFees", plainMoney(fees, 2));
  setMetric("mNet", money(netPnl, 2), netPnl);
}

// Dropdown Filter Selection Logic
function getFilteredFills() {
  const filterVal = pnlFilterSelect.value;
  if (filterVal === "positive") {
    return fills.filter(f => num(f.closedPnl) > 0);
  }
  if (filterVal === "negative") {
    return fills.filter(f => num(f.closedPnl) < 0);
  }
  return fills;
}

function renderTrades() {
  const displayFills = getFilteredFills();

  if (!displayFills.length) {
    bodyEl.innerHTML = '<tr class="empty-row"><td colspan="13">No trade fills found matching selected criteria.</td></tr>';
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

  updateMetrics();
}

pnlFilterSelect.addEventListener("change", renderTrades);

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
  resetMetrics();

  try {
    setStatus("Fetching trade statement history from Hyperliquid…");

    const fillsRes = await fetchFillsByTime(wallet, s, e);
    fills = fillsRes.result;

    renderTrades();

    if (fillsRes.reachedGlobalLimit) {
      noticeEl.textContent = "Hyperliquid API returned maximum fill capacity (10,000). Older fills may be omitted.";
      noticeEl.classList.remove("hidden");
    }

    setStatus(`Loaded ${fills.length.toLocaleString()} trade fill(s).`, "success");
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

// Filtered CSV Export
csvBtn.addEventListener("click", () => {
  const targetFills = getFilteredFills();
  if (targetFills.length) {
    const filterSuffix = pnlFilterSelect.value !== "all" ? `-${pnlFilterSelect.value}-pnl` : "";
    downloadBlob(toCSV(targetFills), `hyperliquid-statement${filterSuffix}-${walletEl.value.trim().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  }
});

// Filtered JSON Export
jsonBtn.addEventListener("click", () => {
  const targetFills = getFilteredFills();
  if (targetFills.length) {
    const filterSuffix = pnlFilterSelect.value !== "all" ? `-${pnlFilterSelect.value}-pnl` : "";
    const mappedFills = targetFills.map(f => ({ ...f, sideFormatted: mapSide(f.side) }));
    downloadBlob(JSON.stringify({ fills: mappedFills }, null, 2), `hyperliquid-statement${filterSuffix}-${walletEl.value.trim().slice(0, 10)}.json`, "application/json");
  }
});

// Multi-Page PDF Generator
async function generatePDF() {
  const targetFills = getFilteredFills();
  if (!targetFills.length) return;

  if (typeof html2canvas === "undefined" || typeof window.jspdf === "undefined") {
    alert("PDF generator libraries are still loading. Please retry in a moment.");
    return;
  }

  pdfBtn.disabled = true;
  pdfBtn.textContent = "Generating...";

  try {
    const wallet = walletEl.value.trim();
    const filterLabel = pnlFilterSelect.options[pnlFilterSelect.selectedIndex].text;
    const totalPnl = targetFills.reduce((s, f) => s + num(f.closedPnl), 0);
    const totalFees = targetFills.reduce((s, f) => s + num(f.fee), 0);
    const totalVol = targetFills.reduce((s, f) => s + Math.abs(num(f.px) * num(f.sz)), 0);

    // Chunk trades into pages (25 rows per page to prevent cutoff)
    const ROWS_PER_PAGE = 25;
    const totalPages = Math.ceil(targetFills.length / ROWS_PER_PAGE);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("landscape", "pt", "a4");

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageFills = targetFills.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);

      const printArea = document.createElement("div");
      printArea.style.position = "absolute";
      printArea.style.left = "-9999px";
      printArea.style.top = "0";
      printArea.style.width = "1000px";
      printArea.style.background = "#ffffff";
      printArea.style.padding = "24px";
      printArea.style.color = "#111827";
      printArea.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

      // Render header and summary cards on Page 1 only
      const headerSection = pageIdx === 0 ? `
        <div style="border-bottom: 2px solid #00b87c; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="margin: 0; color: #00b87c; font-size: 20px; font-weight: 800;">HYPERLIQUID PRO</h2>
            <p style="margin: 3px 0 0; color: #4b5563; font-size: 11px; font-weight: 600;">OFFICIAL TRADE AUDIT STATEMENT</p>
          </div>
          <div style="text-align: right; font-size: 10px; color: #374151; line-height: 1.4;">
            <p style="margin: 0;"><strong>Account:</strong> ${esc(wallet)}</p>
            <p style="margin: 0;"><strong>Period:</strong> ${esc(startEl.value)} to ${esc(endEl.value)}</p>
            <p style="margin: 0;"><strong>Filter Applied:</strong> ${esc(filterLabel)}</p>
            <p style="margin: 0;"><strong>Generated:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="border: 1px solid #e5e7eb; background: #f9fafb; padding: 8px 10px; border-radius: 4px;">
            <span style="display: block; font-size: 9px; font-weight: 700; color: #6b7280;">TOTAL TRADES</span>
            <span style="display: block; font-size: 14px; font-weight: 700; color: #111827; margin-top: 2px;">${targetFills.length.toLocaleString()}</span>
          </div>
          <div style="border: 1px solid #e5e7eb; background: #f9fafb; padding: 8px 10px; border-radius: 4px;">
            <span style="display: block; font-size: 9px; font-weight: 700; color: #6b7280;">CLOSED P&L</span>
            <span style="display: block; font-size: 14px; font-weight: 700; color: ${totalPnl >= 0 ? '#059669' : '#dc2626'}; margin-top: 2px;">${money(totalPnl, 2)}</span>
          </div>
          <div style="border: 1px solid #e5e7eb; background: #f9fafb; padding: 8px 10px; border-radius: 4px;">
            <span style="display: block; font-size: 9px; font-weight: 700; color: #6b7280;">TOTAL FEES</span>
            <span style="display: block; font-size: 14px; font-weight: 700; color: #111827; margin-top: 2px;">${plainMoney(totalFees, 2)}</span>
          </div>
          <div style="border: 1px solid #e5e7eb; background: #f9fafb; padding: 8px 10px; border-radius: 4px;">
            <span style="display: block; font-size: 9px; font-weight: 700; color: #6b7280;">TOTAL VOLUME</span>
            <span style="display: block; font-size: 14px; font-weight: 700; color: #111827; margin-top: 2px;">${plainMoney(totalVol, 2)}</span>
          </div>
        </div>
      ` : `
        <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between;">
          <span style="font-size: 11px; font-weight: 700; color: #00b87c;">HYPERLIQUID PRO — STATEMENT</span>
          <span style="font-size: 10px; color: #6b7280;">Account: ${esc(wallet)}</span>
        </div>
      `;

      printArea.innerHTML = `
        ${headerSection}
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 6px 8px; text-align: left; border-bottom: 1px solid #d1d5db; color: #374151;">Date / Time</th>
              <th style="padding: 6px 8px; text-align: left; border-bottom: 1px solid #d1d5db; color: #374151;">Coin</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Dir</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Side</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Price</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Size</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Notional</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Closed P&L</th>
              <th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #d1d5db; color: #374151;">Fee</th>
            </tr>
          </thead>
          <tbody>
            ${pageFills.map(f => {
              const p = num(f.closedPnl);
              return `<tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 5px 8px; text-align: left; color: #1f2937;">${esc(formatDate(f.time))}</td>
                <td style="padding: 5px 8px; text-align: left; color: #111827; font-weight: 700;">${esc(f.coin)}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${esc(f.dir)}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${esc(mapSide(f.side))}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${esc(f.px)}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${esc(f.sz)}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${plainMoney(Math.abs(num(f.px) * num(f.sz)), 2)}</td>
                <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: ${p > 0 ? '#059669' : p < 0 ? '#dc2626' : '#111827'};">${money(p, 2)}</td>
                <td style="padding: 5px 8px; text-align: right; color: #1f2937;">${plainMoney(f.fee, 2)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>

        <div style="margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af;">
          <span>Hyperliquid On-Chain Statement</span>
          <span>Page ${pageIdx + 1} of ${totalPages}</span>
        </div>
      `;

      document.body.appendChild(printArea);

      const canvas = await html2canvas(printArea, { scale: 2, useCORS: true });
      document.body.removeChild(printArea);

      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(`statement-${wallet.slice(0, 8)}-${pnlFilterSelect.value}.pdf`);

  } catch (err) {
    console.error("PDF Generation error:", err);
    alert("Unable to compile PDF statement. Please check console for technical logs.");
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = "PDF Statement";
  }
}

pdfBtn.addEventListener("click", generatePDF);

todayBtn.addEventListener("click", () => setPreset("today"));
monthBtn.addEventListener("click", () => setPreset("month"));
ytdBtn.addEventListener("click", () => setPreset("ytd"));
allBtn.addEventListener("click", () => setPreset("30"));

$("clearBtn").addEventListener("click", () => {
  walletEl.value = "";
  localStorage.removeItem(SAVED_WALLET_KEY);
  setPreset("30");
  fills = [];
  pnlFilterSelect.value = "all";
  clearStatus();
  noticeEl.classList.add("hidden");
  bodyEl.innerHTML = '<tr class="empty-row"><td colspan="13">Enter a valid wallet address to display trade history.</td></tr>';
  tableMeta.textContent = "No data loaded.";
  resetMetrics();
});

walletEl.addEventListener("keydown", e => { if (e.key === "Enter") fetchBtn.click(); });