const API = "https://api.hyperliquid.xyz/info";
const $ = id => document.getElementById(id);

const walletEl = $("wallet"),
      loadChartsBtn = $("loadChartsBtn"),
      statusEl = $("status");

let pnlChartInstance = null;

const SAVED_WALLET_KEY = "hyperliquid_saved_wallet";
const CACHE_FILLS_KEY = "hyperliquid_persisted_fills";
const CACHE_FUNDING_KEY = "hyperliquid_persisted_funding";
const CACHE_TIME_KEY = "hyperliquid_cache_timestamp";

if (localStorage.getItem(SAVED_WALLET_KEY)) {
  walletEl.value = localStorage.getItem(SAVED_WALLET_KEY);
}

walletEl.addEventListener("input", () => {
  localStorage.setItem(SAVED_WALLET_KEY, walletEl.value.trim());
});

function setStatus(m, t = "") {
  statusEl.textContent = m;
  statusEl.className = "status" + (t ? " " + t : "");
  statusEl.classList.remove("hidden");
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function money(v, d = 2) {
  const n = num(v), s = n > 0 ? "+" : n < 0 ? "−" : "";
  return s + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function plainMoney(v, d = 2) {
  return "$" + num(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function postInfo(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Hyperliquid API status: ${r.status}`);
  return r.json();
}

async function fetchAllData(user) {
  const cleanUser = user.toLowerCase().trim();
  const out = [], seen = new Set();
  let cursor = Date.now() - (365 * 86400000);
  const endMs = Date.now();
  let pages = 0;

  while (cursor <= endMs && pages < 20) {
    const data = await postInfo({
      type: "userFillsByTime",
      user: cleanUser,
      startTime: cursor,
      endTime: endMs,
      aggregateByTime: false
    });

    if (!Array.isArray(data) || data.length === 0) break;

    for (const f of data) {
      const key = [f.tid ?? "", f.hash ?? "", f.oid ?? "", f.time ?? ""].join("|");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(f);
      }
    }

    const lt = Number(data.at(-1)?.time);
    if (!Number.isFinite(lt) || lt <= cursor) break;
    cursor = lt + 1;
    pages++;
  }

  out.sort((a, b) => Number(a.time) - Number(b.time));

  let funding = [];
  try {
    const fundData = await postInfo({
      type: "userFunding",
      user: cleanUser,
      startTime: Date.now() - (365 * 86400000),
      endTime: Date.now()
    });
    if (Array.isArray(fundData)) funding = fundData;
  } catch (e) {
    console.warn("Funding fetch warning:", e);
  }

  return { fills: out, funding };
}

// Auto-load persisted data on startup with 2-hour expiration wipe check
window.addEventListener("DOMContentLoaded", () => {
  const cacheTime = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  const isExpired = (Date.now() - cacheTime) > 7200000; // 2 hours expiration

  if (isExpired) {
    localStorage.removeItem(CACHE_FILLS_KEY);
    localStorage.removeItem(CACHE_FUNDING_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
    sessionStorage.clear();
    return;
  }

  const savedFills = localStorage.getItem(CACHE_FILLS_KEY) || sessionStorage.getItem("hl_cached_fills");
  const savedFunding = localStorage.getItem(CACHE_FUNDING_KEY) || sessionStorage.getItem("hl_cached_funding");

  if (savedFills) {
    try {
      const fillsData = JSON.parse(savedFills);
      const fundingData = savedFunding ? JSON.parse(savedFunding) : [];
      
      if (fillsData.length > 0) {
        processAndRenderAnalytics(fillsData, fundingData);
        setStatus(`Loaded ${fillsData.length.toLocaleString()} persisted fill(s) instantly.`, "success");
      }
    } catch (e) {
      console.warn("Error parsing persisted storage data:", e);
    }
  }
});

loadChartsBtn.addEventListener("click", async () => {
  const wallet = walletEl.value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    setStatus("Please enter a valid 42-character EVM address.", "error");
    return;
  }

  loadChartsBtn.disabled = true;
  setStatus("Fetching comprehensive trade history and performance metrics…");

  try {
    const accountData = await fetchAllData(wallet);
    if (!accountData.fills.length) {
      setStatus("No trade history found for this address.", "error");
      loadChartsBtn.disabled = false;
      return;
    }

    // Save with current timestamp for 2-hour wipe expiration policy
    localStorage.setItem(CACHE_FILLS_KEY, JSON.stringify(accountData.fills));
    localStorage.setItem(CACHE_FUNDING_KEY, JSON.stringify(accountData.funding));
    localStorage.setItem(CACHE_TIME_KEY, Date.now());
    
    sessionStorage.setItem("hl_cached_fills", JSON.stringify(accountData.fills));
    sessionStorage.setItem("hl_cached_funding", JSON.stringify(accountData.funding));

    processAndRenderAnalytics(accountData.fills, accountData.funding);
    setStatus(`Successfully generated analytics curve using ${accountData.fills.length.toLocaleString()} trade fill(s).`, "success");
  } catch (err) {
    console.error(err);
    setStatus("Error generating charts: " + (err?.message || "Check network connection."), "error");
  } finally {
    loadChartsBtn.disabled = false;
  }
});

function processAndRenderAnalytics(fills, funding) {
  const dailyMap = {};

  fills.forEach(f => {
    const d = new Date(Number(f.time));
    const dateKey = d.toISOString().split("T")[0];

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { closedPnl: 0, fees: 0, netPnl: 0, volume: 0, wins: 0, losses: 0, totalTrades: 0 };
    }

    const closedPnl = num(f.closedPnl);
    const tradingFee = num(f.fee);
    const builderFee = num(f.builderFee);
    const netTradePnl = closedPnl - tradingFee - builderFee;
    const notionalVol = Math.abs(num(f.px) * num(f.sz));

    dailyMap[dateKey].closedPnl += closedPnl;
    dailyMap[dateKey].fees += (tradingFee + builderFee);
    dailyMap[dateKey].netPnl += netTradePnl;
    dailyMap[dateKey].volume += notionalVol;
    dailyMap[dateKey].totalTrades += 1;

    if (closedPnl > 0) dailyMap[dateKey].wins += 1;
    if (closedPnl < 0) dailyMap[dateKey].losses += 1;
  });

  funding.forEach(item => {
    const timeVal = item.time || item.delta?.time;
    if (!timeVal) return;
    const d = new Date(Number(timeVal));
    const dateKey = d.toISOString().split("T")[0];
    const usdPayment = num(item.delta?.usdc);

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { closedPnl: 0, fees: 0, netPnl: 0, volume: 0, wins: 0, losses: 0, totalTrades: 0 };
    }

    if (usdPayment < 0) {
      const paid = Math.abs(usdPayment);
      dailyMap[dateKey].fees += paid;
      dailyMap[dateKey].netPnl -= paid;
    } else {
      dailyMap[dateKey].netPnl += usdPayment;
    }
  });

  const dates = Object.keys(dailyMap).sort();
  let cumulativePnl = 0;
  let peakPnl = -Infinity;
  let maxDrawdown = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const cumulativePnlData = [];

  dates.forEach(date => {
    const dayObj = dailyMap[date];
    cumulativePnl += dayObj.netPnl;
    cumulativePnlData.push(cumulativePnl);

    if (cumulativePnl > peakPnl) {
      peakPnl = cumulativePnl;
    }
    const drawdown = peakPnl - cumulativePnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    totalWins += dayObj.wins;
    totalLosses += dayObj.losses;
  });

  const avgTradeExpectancy = fills.length > 0 ? cumulativePnl / fills.length : 0;
  const winLossRatio = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : totalWins > 0 ? "∞" : "0.00";

  $("statPeak").textContent = money(peakPnl, 2);
  $("statMaxDD").textContent = "−" + plainMoney(maxDrawdown, 2);
  $("statWinLoss").textContent = `${winLossRatio} (${totalWins}W / ${totalLosses}L)`;
  $("statAvgTrade").textContent = money(avgTradeExpectancy, 2);
  $("statDays").textContent = dates.length.toLocaleString();

  renderPeriodicTable(dailyMap);

  if (pnlChartInstance) pnlChartInstance.destroy();

  const ctxPnl = $("pnlLineChart").getContext("2d");
  const chartTextColor = getComputedStyle(document.body).getPropertyValue('--text-muted') || '#8492a6';

  pnlChartInstance = new Chart(ctxPnl, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Cumulative Net P&L ($)',
        data: cumulativePnlData,
        borderColor: '#00b87c',
        backgroundColor: 'rgba(0, 184, 124, 0.12)',
        fill: true,
        tension: 0.2,
        borderWidth: 2.5,
        pointRadius: dates.length > 50 ? 0 : 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' Cumulative Net P&L: ' + plainMoney(context.raw, 2);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: chartTextColor,
            maxTicksLimit: 6,
            maxRotation: 45,
            minRotation: 0
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: {
            color: chartTextColor,
            callback: function(value) { return '$' + value.toLocaleString(); }
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function renderPeriodicTable(dailyMap) {
  const periodBody = $("periodTableBody");
  const sortedDates = Object.keys(dailyMap).sort().reverse();

  if (!sortedDates.length) {
    periodBody.innerHTML = '<tr class="empty-row"><td colspan="6">No trading data available for periodic table.</td></tr>';
    return;
  }

  const monthlyAgg = {};
  sortedDates.forEach(dateStr => {
    const d = new Date(dateStr);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mLabel = d.toLocaleString(undefined, { month: 'long', year: 'numeric' });

    if (!monthlyAgg[mKey]) {
      monthlyAgg[mKey] = { label: mLabel, closedPnl: 0, fees: 0, netPnl: 0, volume: 0, fills: 0 };
    }

    const dayObj = dailyMap[dateStr];
    monthlyAgg[mKey].closedPnl += dayObj.closedPnl || 0;
    monthlyAgg[mKey].fees += dayObj.fees || 0;
    monthlyAgg[mKey].netPnl += dayObj.netPnl || 0;
    monthlyAgg[mKey].volume += dayObj.volume || 0;
    monthlyAgg[mKey].fills += dayObj.totalTrades || 0;
  });

  const sortedMonths = Object.keys(monthlyAgg).sort().reverse();

  periodBody.innerHTML = sortedMonths.map(k => {
    const row = monthlyAgg[k];
    return `<tr>
      <td style="text-align: left; font-weight: 800;">${esc(row.label)}</td>
      <td class="${row.closedPnl > 0 ? "text-positive" : row.closedPnl < 0 ? "text-negative" : ""}">${money(row.closedPnl, 2)}</td>
      <td>${plainMoney(row.fees, 2)}</td>
      <td class="${row.netPnl > 0 ? "text-positive" : row.netPnl < 0 ? "text-negative" : ""}">${money(row.netPnl, 2)}</td>
      <td>${plainMoney(row.volume, 2)}</td>
      <td>${row.fills.toLocaleString()}</td>
    </tr>`;
  }).join("");

  $("tableMeta").textContent = `Displaying performance across ${sortedMonths.length} active month(s).`;
}