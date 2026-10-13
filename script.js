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
      monthlyBodyEl = $("monthlyBody"),
      tableMeta = $("tableMeta"),
      monthlyMeta = $("monthlyMeta"),
      csvBtn = $("csvBtn"),
      jsonBtn = $("jsonBtn"),
      pdfBtn = $("pdfBtn"),
      allBtn = $("allBtn"),
      monthBtn = $("monthBtn"),
      ytdBtn = $("ytdBtn"),
      todayBtn = $("todayBtn"),
      pnlFilterSelect = $("pnlFilterSelect"),
      coinFilterSelect = $("coinFilterSelect"),
      themeToggleBtn = $("themeToggleBtn"),
      themeIcon = $("themeIcon"),
      themeLabel = $("themeLabel"),
      tabTradesBtn = $("tabTradesBtn"),
      tabMonthlyBtn = $("tabMonthlyBtn"),
      panelTrades = $("panelTrades"),
      panelMonthly = $("panelMonthly"),
      feeCard = $("feeCard"),
      feeModal = $("feeModal"),
      closeModalBtn = $("closeModalBtn"),
      prevPageBtn = $("prevPageBtn"),
      nextPageBtn = $("nextPageBtn"),
      pageIndicator = $("pageIndicator"),
      paginationContainer = $("paginationContainer");

let fills = [];
let fundingHistory = [];
let currentPage = 1;
const rowsPerPage = 50;

// Local Storage Keys
const SAVED_WALLET_KEY = "hyperliquid_saved_wallet";
const SAVED_THEME_KEY = "hyperliquid_theme";

if (localStorage.getItem(SAVED_WALLET_KEY)) {
  walletEl.value = localStorage.getItem(SAVED_WALLET_KEY);
}

walletEl.addEventListener("input", () => {
  localStorage.setItem(SAVED_WALLET_KEY, walletEl.value.trim());
});

// Modal Logic
feeCard.addEventListener("click", () => feeModal.classList.remove("hidden"));
closeModalBtn.addEventListener("click", () => feeModal.classList.add("hidden"));
window.addEventListener("click", e => { if (e.target === feeModal) feeModal.classList.add("hidden"); });

// Tab Switching Logic
tabTradesBtn.addEventListener("click", () => {
  tabTradesBtn.classList.add("active");
  tabMonthlyBtn.classList.remove("active");
  panelTrades.classList.remove("hidden");
  panelMonthly.classList.add("hidden");
});

tabMonthlyBtn.addEventListener("click", () => {
  tabMonthlyBtn.classList.add("active");
  tabTradesBtn.classList.remove("active");
  panelMonthly.classList.remove("hidden");
  panelTrades.classList.add("hidden");
  renderMonthlyPnl();
});

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

// Fetch Fills and Funding History Concurrently
async function fetchAccountData(user, startMs, endMs) {
  const cleanUser = user.toLowerCase().trim();
  
  // 1. Fetch Fills
  const fillsPromise = (async () => {
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

        if (!Array.isArray(data)) throw new Error("Invalid fills response format.");

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
  })();

  // 2. Fetch Funding History Ledger Payments
  const fundingPromise = (async () => {
    try {
      const fundingData = await postInfo({
        type: "userFunding",
        user: cleanUser,
        startTime: startMs,
        endTime: endMs
      });
      if (Array.isArray(fundingData)) {
        return fundingData;
      }
    } catch (e) {
      console.warn("Funding history fetch warning:", e);
    }
    return [];
  })();

  const [fillsRes, fundingRes] = await Promise.all([fillsPromise, fundingPromise]);
  return {
    fills: fillsRes.result,
    funding: fundingRes,
    reachedGlobalLimit: fillsRes.reachedGlobalLimit
  };
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
  ["mFills", "mPnl", "mFees", "mNet", "mWinRate", "mProfitFactor"].forEach(id => {
    setMetric(id, "—");
  });
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  pdfBtn.disabled = true;
  paginationContainer.classList.add("hidden");
}

function updateMetrics() {
  const closedPnl = fills.reduce((s, f) => s + num(f.closedPnl), 0);
  
  const tradingFees = fills.reduce((s, f) => s + num(f.fee), 0);
  
  // Aggregate funding payments from userFunding ledger
  const totalFundingPaid = fundingHistory.reduce((s, item) => {
    const usdPayment = num(item.delta?.usdc);
    return s + (usdPayment < 0 ? Math.abs(usdPayment) : 0);
  }, 0);

  const builderFees = fills.reduce((s, f) => s + num(f.builderFee), 0);
  const totalFees = tradingFees + totalFundingPaid + builderFees;

  const netPnl = closedPnl - totalFees;

  // Update Modal Sub-items
  $("modalTradingFee").textContent = plainMoney(tradingFees, 4);
  $("modalFundingFee").textContent = plainMoney(totalFundingPaid, 4);
  $("modalBuilderFee").textContent = plainMoney(builderFees, 4);
  $("modalTotalFee").textContent = plainMoney(totalFees, 4);

  const tradesWithPnl = fills.filter(f => num(f.closedPnl) !== 0);
  const winningTrades = tradesWithPnl.filter(f => num(f.closedPnl) > 0);
  const losingTrades = tradesWithPnl.filter(f => num(f.closedPnl) < 0);
  
  const winRate = tradesWithPnl.length > 0 ? (winningTrades.length / tradesWithPnl.length) * 100 : 0;
  
  const grossProfit = winningTrades.reduce((s, f) => s + num(f.closedPnl), 0);
  const grossLoss = Math.abs(losingTrades.reduce((s, f) => s + num(f.closedPnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

  setMetric("mPnl", money(closedPnl, 2), closedPnl);
  setMetric("mFees", plainMoney(totalFees, 2));
  setMetric("mNet", money(netPnl, 2), netPnl);
  setMetric("mWinRate", winRate.toFixed(1) + "%", winRate > 50 ? 1 : winRate < 50 ? -1 : 0);
  setMetric("mProfitFactor", profitFactor === 99.9 ? "∞" : profitFactor.toFixed(2), profitFactor > 1 ? 1 : profitFactor < 1 ? -1 : 0);
}

function updateCoinFilterOptions() {
  const coins = [...new Set(fills.map(f => f.coin))].sort();
  const currentVal = coinFilterSelect.value;
  coinFilterSelect.innerHTML = '<option value="all">All Coins</option>' + coins.map(c => `<option value="${c}">${c}</option>`).join("");
  if (coins.includes(currentVal)) coinFilterSelect.value = currentVal;
}

function getFilteredFills() {
  const pnlVal = pnlFilterSelect.value;
  const coinVal = coinFilterSelect.value;

  return fills.filter(f => {
    const pnl = num(f.closedPnl);
    if (pnlVal === "positive" && pnl <= 0) return false;
    if (pnlVal === "negative" && pnl >= 0) return false;
    if (coinVal !== "all" && f.coin !== coinVal) return false;
    return true;
  });
}

function renderMonthlyPnl() {
  if (!fills.length && !fundingHistory.length) {
    monthlyBodyEl.innerHTML = '<tr class="empty-row"><td colspan="6">No trade fills loaded to generate monthly breakdown.</td></tr>';
    monthlyMeta.textContent = "No data loaded.";
    return;
  }

  const monthlyMap = {};

  fills.forEach(f => {
    const d = new Date(Number(f.time));
    const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' });

    if (!monthlyMap[yearMonthKey]) {
      monthlyMap[yearMonthKey] = { label, closedPnl: 0, fees: 0, volume: 0, fillsCount: 0 };
    }

    monthlyMap[yearMonthKey].closedPnl += num(f.closedPnl);
    monthlyMap[yearMonthKey].fees += num(f.fee) + num(f.builderFee);
    monthlyMap[yearMonthKey].volume += Math.abs(num(f.px) * num(f.sz));
    monthlyMap[yearMonthKey].fillsCount += 1;
  });

  // Account for monthly funding history ledger payments
  fundingHistory.forEach(item => {
    const timeVal = item.time || item.delta?.time;
    if (!timeVal) return;
    const d = new Date(Number(timeVal));
    const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' });

    if (!monthlyMap[yearMonthKey]) {
      monthlyMap[yearMonthKey] = { label, closedPnl: 0, fees: 0, volume: 0, fillsCount: 0 };
    }

    const usdPayment = num(item.delta?.usdc);
    if (usdPayment < 0) {
      monthlyMap[yearMonthKey].fees += Math.abs(usdPayment);
    }
  });

  const sortedKeys = Object.keys(monthlyMap).sort().reverse();

  monthlyBodyEl.innerHTML = sortedKeys.map(k => {
    const m = monthlyMap[k];
    const net = m.closedPnl - m.fees;
    return `<tr>
      <td style="text-align: left; font-weight: 800;">${esc(m.label)}</td>
      <td class="${m.closedPnl > 0 ? "text-positive" : m.closedPnl < 0 ? "text-negative" : ""}">${money(m.closedPnl, 2)}</td>
      <td>${plainMoney(m.fees, 2)}</td>
      <td class="${net > 0 ? "text-positive" : net < 0 ? "text-negative" : ""}">${money(net, 2)}</td>
      <td>${plainMoney(m.volume, 2)}</td>
      <td>${m.fillsCount.toLocaleString()}</td>
    </tr>`;
  }).join("");

  monthlyMeta.textContent = `Showing aggregated monthly performance across ${sortedKeys.length} month(s).`;
}

function renderTrades() {
  const displayFills = getFilteredFills();

  if (!displayFills.length) {
    bodyEl.innerHTML = '<tr class="empty-row"><td colspan="14">No trade fills found matching selected criteria.</td></tr>';
    tableMeta.textContent = "No trade fills to show.";
    paginationContainer.classList.add("hidden");
    return;
  }

  const totalPages = Math.ceil(displayFills.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = 1;
  const startIdx = (currentPage - 1) * rowsPerPage;
  const paginatedFills = displayFills.slice(startIdx, startIdx + rowsPerPage);

  bodyEl.innerHTML = paginatedFills.map(f => {
    const p = num(f.closedPnl);
    const d = String(f.dir ?? "");
    const dc = d.toLowerCase().includes("close") ? "dir-close" : "dir-open";
    const rawHash = String(f.hash ?? "");
    const hasHash = rawHash && rawHash !== "null" && rawHash !== "undefined";

    const hashCell = hasHash 
      ? `<a href="${EXPLORER_URL}${esc(rawHash)}" target="_blank" rel="noopener noreferrer" class="hash" title="View Explorer">${esc(rawHash)}</a>`
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
      <td>${plainMoney(f.funding, 4)}</td>
      <td>${plainMoney(f.builderFee, 4)}</td>
      <td>${esc(f.feeToken)}</td>
      <td>${esc(f.oid)}</td>
      <td>${hashCell}</td>
    </tr>`;
  }).join("");

  tableMeta.textContent = `${displayFills.length.toLocaleString()} fills matching filters (Showing ${startIdx + 1}–${Math.min(startIdx + rowsPerPage, displayFills.length)})`;
  
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
  paginationContainer.classList.remove("hidden");

  csvBtn.disabled = false;
  jsonBtn.disabled = false;
  pdfBtn.disabled = false;

  updateMetrics();
  renderMonthlyPnl();
}

pnlFilterSelect.addEventListener("change", () => { currentPage = 1; renderTrades(); });
coinFilterSelect.addEventListener("change", () => { currentPage = 1; renderTrades(); });

prevPageBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTrades(); } });
nextPageBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(getFilteredFills().length / rowsPerPage);
  if (currentPage < totalPages) { currentPage++; renderTrades(); }
});

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
  fundingHistory = [];
  currentPage = 1;
  resetMetrics();

  try {
    setStatus("Fetching trade statement and funding history from Hyperliquid…");

    const accountData = await fetchAccountData(wallet, s, e);
    fills = accountData.fills;
    fundingHistory = accountData.funding;

    updateCoinFilterOptions();
    renderTrades();

    if (accountData.reachedGlobalLimit) {
      noticeEl.textContent = "Hyperliquid API returned maximum fill capacity (10,000). Older fills may be omitted.";
      noticeEl.classList.remove("hidden");
    }

    setStatus(`Loaded ${fills.length.toLocaleString()} fill(s) and ${fundingHistory.length.toLocaleString()} funding payment record(s).`, "success");
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
    ["Trading Fee", f => f.fee],
    ["Funding Fee", f => f.funding],
    ["Builder Fee", f => f.builderFee],
    ["Fee Token", f => f.feeToken],
    ["Order ID", f => f.oid],
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
    downloadBlob(toCSV(targetFills), `hyperliquid-statement-${walletEl.value.trim().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  }
});

jsonBtn.addEventListener("click", () => {
  const targetFills = getFilteredFills();
  if (targetFills.length) {
    const mappedFills = targetFills.map(f => ({ ...f, sideFormatted: mapSide(f.side) }));
    downloadBlob(JSON.stringify({ fills: mappedFills, fundingHistory }, null, 2), `hyperliquid-statement-${walletEl.value.trim().slice(0, 10)}.json`, "application/json");
  }
});

function generatePDF() {
  const targetFills = getFilteredFills();
  if (!targetFills.length) return;

  if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
    alert("PDF generator library is still loading. Please retry in a moment.");
    return;
  }

  pdfBtn.disabled = true;
  pdfBtn.textContent = "Generating...";

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape", "pt", "a4");

    const wallet = walletEl.value.trim();
    const totalPnl = targetFills.reduce((s, f) => s + num(f.closedPnl), 0);
    
    const tradingFees = targetFills.reduce((s, f) => s + num(f.fee), 0);
    const totalFundingPaid = fundingHistory.reduce((s, item) => {
      const usdPayment = num(item.delta?.usdc);
      return s + (usdPayment < 0 ? Math.abs(usdPayment) : 0);
    }, 0);
    const builderFees = targetFills.reduce((s, f) => s + num(f.builderFee), 0);
    const totalFees = tradingFees + totalFundingPaid + builderFees;

    const netPnl = totalPnl - totalFees;
    const totalVol = targetFills.reduce((s, f) => s + Math.abs(num(f.px) * num(f.sz)), 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 184, 124);
    doc.text("HYPERLIQUID PRO", 40, 40);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("OFFICIAL INSTITUTIONAL TRADE AUDIT STATEMENT", 40, 52);

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(`Account: ${wallet}`, 802, 35, { align: "right" });
    doc.text(`Period: ${startEl.value} to ${endEl.value}`, 802, 47, { align: "right" });

    const cardWidth = 142;
    const cardGap = 13;
    let cardX = 40;

    // Card 1: NET P&L
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, 70, cardWidth, 40, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(100);
    doc.text("NET P&L", cardX + 10, 82);
    doc.setFontSize(10); doc.setTextColor(netPnl >= 0 ? 100 : 220, netPnl >= 0 ? 150 : 38, netPnl >= 0 ? 100 : 38);
    doc.text(money(netPnl, 2), cardX + 10, 100);

    // Card 2: CLOSED P&L
    cardX += cardWidth + cardGap;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, 70, cardWidth, 40, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(100);
    doc.text("CLOSED P&L", cardX + 10, 82);
    doc.setFontSize(10); doc.setTextColor(totalPnl >= 0 ? 100 : 220, totalPnl >= 0 ? 150 : 38, totalPnl >= 0 ? 100 : 38);
    doc.text(money(totalPnl, 2), cardX + 10, 100);

    // Card 3: TOTAL FEES
    cardX += cardWidth + cardGap;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, 70, cardWidth, 40, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(100);
    doc.text("TOTAL FEES", cardX + 10, 82);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(plainMoney(totalFees, 2), cardX + 10, 100);

    // Card 4: TOTAL VOLUME
    cardX += cardWidth + cardGap;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, 70, cardWidth, 40, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(100);
    doc.text("TOTAL VOLUME", cardX + 10, 82);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(plainMoney(totalVol, 2), cardX + 10, 100);

    // Card 5: TOTAL TRADES
    cardX += cardWidth + cardGap;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, 70, cardWidth, 40, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(100);
    doc.text("TOTAL TRADES", cardX + 10, 82);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(targetFills.length.toLocaleString(), cardX + 10, 100);

    const tableHeaders = [["Date / Time", "Coin", "Dir", "Side", "Price", "Size", "Closed P&L", "Trade Fee", "Funding", "Builder"]];
    const tableBody = targetFills.map(f => [
      formatDate(f.time),
      f.coin,
      f.dir ?? "",
      mapSide(f.side),
      f.px,
      f.sz,
      money(num(f.closedPnl), 2),
      plainMoney(f.fee, 2),
      plainMoney(f.funding, 2),
      plainMoney(f.builderFee, 2)
    ]);

    doc.autoTable({
      head: tableHeaders,
      body: tableBody,
      startY: 125,
      theme: "striped",
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      styles: { fontSize: 7.5, cellPadding: 4, halign: "right", textColor: [30, 41, 59], fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold", halign: "right" },
      columnStyles: { 0: { halign: "left" }, 1: { halign: "left", fontStyle: "bold", textColor: [15, 23, 42] } },
      didDrawPage: function () {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text("Hyperliquid On-Chain Statement", 40, doc.internal.pageSize.height - 20);
        doc.text(str, 802, doc.internal.pageSize.height - 20, { align: "right" });
      }
    });

    doc.save(`statement-${wallet.slice(0, 8)}.pdf`);
  } catch (err) {
    console.error("PDF error:", err);
    alert("Unable to compile PDF statement.");
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
  fundingHistory = [];
  pnlFilterSelect.value = "all";
  coinFilterSelect.innerHTML = '<option value="all">All Coins</option>';
  clearStatus();
  noticeEl.classList.add("hidden");
  bodyEl.innerHTML = '<tr class="empty-row"><td colspan="14">Enter a valid wallet address to display trade history.</td></tr>';
  monthlyBodyEl.innerHTML = '<tr class="empty-row"><td colspan="6">Enter a valid wallet address to view monthly breakdown.</td></tr>';
  tableMeta.textContent = "No data loaded.";
  monthlyMeta.textContent = "No data loaded.";
  resetMetrics();
});

walletEl.addEventListener("keydown", e => { if (e.key === "Enter") fetchBtn.click(); });