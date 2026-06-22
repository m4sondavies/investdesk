/* =========================================================================
   Dashboard logic — modern light theme with SVG icons
   ========================================================================= */

const SYMBOLS = ["TSLA", "AAPL", "NVDA", "MSFT", "VNQ"];
const POLL_MS = 5000;
const USER_KEY = "investdesk_user_name";

let latestPrices = {};
let priceHistory = {};

function getUserName() {
  let name = localStorage.getItem(USER_KEY);
  if (!name) {
    name = "guest_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_KEY, name);
  }
  return name;
}

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSign(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return n > 0 ? "+" : "";
}

function showToast(message, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------------------------------------------------------------
   Ticker tape
   --------------------------------------------------------------------- */

function renderTickerTape(prices) {
  const track = document.getElementById("tickerTrack");
  if (!track) return;
  const items = SYMBOLS.map((sym) => {
    const p = prices[sym] || {};
    const up = (p.change || 0) >= 0;
    const price = p.price !== null && p.price !== undefined ? fmtMoney(p.price) : "—";
    return `
      <div class="ticker-item">
        <span class="sym">${sym}</span>
        <span class="px">$${price}</span>
        <span class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${fmtMoney(Math.abs(p.change || 0))} (${fmtSign(p.change_pct)}${fmtMoney(p.change_pct)}%)</span>
      </div>`;
  });
  track.innerHTML = items.join("") + items.join("");
}

/* ---------------------------------------------------------------------
   Asset cards
   --------------------------------------------------------------------- */

function sparklinePath(values, w, h) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderAssetCards(prices) {
  const grid = document.getElementById("assetGrid");
  if (!grid) return;
  grid.innerHTML = SYMBOLS.map((sym) => {
    const p = prices[sym] || {};
    const up = (p.change || 0) > 0;
    const down = (p.change || 0) < 0;
    const trendClass = up ? "up" : down ? "down" : "flat";
    const arrow = up ? "▲" : down ? "▼" : "—";
    const price = p.price !== null && p.price !== undefined ? fmtMoney(p.price) : "—";
    const history = priceHistory[sym] || [];
    const path = sparklinePath(history, 200, 28);
    const strokeColor = up ? "#22c55e" : down ? "#ef4444" : "#94a3b8";

    // SVG icon for each symbol
    const iconMap = {
      TSLA: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`,
      AAPL: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`,
      NVDA: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`,
      MSFT: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`,
      VNQ: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`
    };

    return `
      <div class="asset-card">
        <div class="row1">
          <span class="sym">${iconMap[sym] || ''} ${sym}</span>
          <span class="pill sym-${sym}">${sym === "VNQ" ? "REIT" : "EQUITY"}</span>
        </div>
        <div class="name">${p.label || sym}</div>
        <div class="price">$${price}</div>
        <div class="delta ${trendClass}">
          <span>${arrow}</span>
          <span>${fmtSign(p.change)}${fmtMoney(Math.abs(p.change || 0))} (${fmtSign(p.change_pct)}${fmtMoney(p.change_pct)}%)</span>
        </div>
        ${path ? `<svg class="spark" viewBox="0 0 200 28" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round"/></svg>` : ""}
      </div>`;
  }).join("");
}

/* ---------------------------------------------------------------------
   Price polling
   --------------------------------------------------------------------- */

async function pollPrices() {
  try {
    const res = await fetch("/api/prices");
    const data = await res.json();
    latestPrices = data.prices;

    SYMBOLS.forEach((sym) => {
      const p = latestPrices[sym];
      if (p && p.price !== null && p.price !== undefined) {
        if (!priceHistory[sym]) priceHistory[sym] = [];
        priceHistory[sym].push(p.price);
        if (priceHistory[sym].length > 30) priceHistory[sym].shift();
      }
    });

    renderTickerTape(latestPrices);
    renderAssetCards(latestPrices);
    renderHoldings();
    document.getElementById("lastUpdated").textContent =
      "Last update " + new Date().toLocaleTimeString();
  } catch (err) {
    console.error("Failed to fetch prices", err);
    document.getElementById("lastUpdated").textContent = "Price feed unreachable — is app.py running?";
  }
}

/* ---------------------------------------------------------------------
   Holdings table
   --------------------------------------------------------------------- */

async function fetchHoldings() {
  const userName = getUserName();
  const res = await fetch(`/api/investments?user_name=${encodeURIComponent(userName)}`);
  return res.ok ? res.json() : [];
}

async function renderHoldings() {
  const tbody = document.getElementById("holdingsBody");
  const emptyState = document.getElementById("holdingsEmpty");
  if (!tbody) return;

  const holdings = await fetchHoldings();

  if (!holdings.length) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    updateSummary(holdings);
    return;
  }
  emptyState.classList.add("hidden");

  tbody.innerHTML = holdings
    .map((h) => {
      const live = latestPrices[h.symbol] || {};
      const currentPrice = live.price ?? h.buy_price;
      const marketValue = currentPrice * h.shares;
      const costBasis = h.buy_price * h.shares;
      const gain = marketValue - costBasis;
      const gainPct = costBasis ? (gain / costBasis) * 100 : 0;
      const gainClass = gain > 0 ? "up" : gain < 0 ? "down" : "flat";

      return `
        <tr>
          <td><span class="pill sym-${h.symbol}">${h.symbol}</span></td>
          <td class="mono-cell tabular">${h.shares}</td>
          <td class="mono-cell tabular">$${fmtMoney(h.buy_price)}</td>
          <td class="mono-cell tabular">$${fmtMoney(currentPrice)}</td>
          <td class="mono-cell tabular">$${fmtMoney(marketValue)}</td>
          <td class="mono-cell tabular delta ${gainClass}">${fmtSign(gain)}${fmtMoney(gain)} (${fmtSign(gainPct)}${fmtMoney(gainPct)}%)</td>
          <td>
            <button class="btn btn-sm btn-danger" data-delete-id="${h.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Remove
            </button>
          </td>
        </tr>`;
    })
    .join("");

  updateSummary(holdings);

  tbody.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-id");
      if (!confirm("Remove this holding?")) return;
      const res = await fetch(`/api/admin/investments/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Holding removed");
        renderHoldings();
      } else {
        showToast("Could not remove — try from Admin panel", true);
      }
    });
  });
}

function updateSummary(holdings) {
  let totalValue = 0;
  let totalCost = 0;
  holdings.forEach((h) => {
    const live = latestPrices[h.symbol] || {};
    const currentPrice = live.price ?? h.buy_price;
    totalValue += currentPrice * h.shares;
    totalCost += h.buy_price * h.shares;
  });
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;

  document.getElementById("sumValue").textContent = "$" + fmtMoney(totalValue);
  document.getElementById("sumCost").textContent = "$" + fmtMoney(totalCost);
  const gainEl = document.getElementById("sumGain");
  gainEl.textContent = fmtSign(totalGain) + "$" + fmtMoney(Math.abs(totalGain));
  gainEl.className = "value " + (totalGain > 0 ? "up" : totalGain < 0 ? "down" : "");
  const gainPctEl = document.getElementById("sumGainPct");
  gainPctEl.textContent = fmtSign(totalGainPct) + fmtMoney(totalGainPct) + "%";
  gainPctEl.className = "value " + (totalGainPct > 0 ? "up" : totalGainPct < 0 ? "down" : "");
  document.getElementById("sumCount").textContent = holdings.length;
}

/* ---------------------------------------------------------------------
   Add investment modal
   --------------------------------------------------------------------- */

function setupAddModal() {
  const openBtn = document.getElementById("openAddModal");
  const overlay = document.getElementById("addModalOverlay");
  const cancelBtn = document.getElementById("cancelAdd");
  const form = document.getElementById("addForm");

  if (!openBtn) return;

  openBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
  cancelBtn.addEventListener("click", () => overlay.classList.add("hidden"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const symbol = document.getElementById("addSymbol").value;
    const shares = document.getElementById("addShares").value;
    const buyPrice = document.getElementById("addBuyPrice").value;

    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: getUserName(),
        symbol,
        shares,
        buy_price: buyPrice,
      }),
    });

    if (res.ok) {
      overlay.classList.add("hidden");
      form.reset();
      showToast("Investment added");
      renderHoldings();
    } else {
      const err = await res.json();
      showToast(err.error || "Could not add investment", true);
    }
  });
}

/* ---------------------------------------------------------------------
   Init — inject modern styles
   --------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Inject modern light theme styles
  const style = document.createElement("style");
  style.textContent = `
    /* ----- modern light theme enhancements ----- */
    .toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #0b1b33;
      color: white;
      padding: 0.6rem 1.8rem;
      border-radius: 40px;
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      z-index: 9999;
      opacity: 0;
      animation: toastIn 0.3s forwards;
    }
    .toast.error { background: #ef4444; }
    @keyframes toastIn { 0% { opacity:0; transform:translateX(-50%) translateY(10px); } 100% { opacity:1; transform:translateX(-50%) translateY(0); } }

    .asset-card {
      background: #f8fafc;
      padding: 0.9rem 1rem;
      border-radius: 18px;
      border: 1px solid #e8edf6;
      transition: 0.15s;
    }
    .asset-card:hover { border-color: #bfdbfe; background: #fafcff; }
    .asset-card .row1 { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem; }
    .asset-card .sym { font-weight:600; font-size:1rem; display:flex; align-items:center; gap:0.3rem; }
    .asset-card .name { font-size:0.7rem; color:#64748b; margin-bottom:0.1rem; }
    .asset-card .price { font-size:1.2rem; font-weight:600; }
    .asset-card .delta { font-size:0.75rem; font-weight:500; }
    .asset-card .delta.up { color:#22c55e; }
    .asset-card .delta.down { color:#ef4444; }
    .asset-card .delta.flat { color:#94a3b8; }
    .asset-card .spark { width:100%; height:28px; margin-top:0.3rem; }

    .pill {
      display: inline-block;
      padding: 0.05rem 0.6rem;
      border-radius: 30px;
      font-weight: 600;
      font-size: 0.65rem;
      background: #f1f5f9;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .pill.sym-TSLA { background: #dbeafe; color: #1d4ed8; }
    .pill.sym-AAPL { background: #dcfce7; color: #15803d; }
    .pill.sym-NVDA { background: #e0e7ff; color: #4338ca; }
    .pill.sym-MSFT { background: #fef3c7; color: #b45309; }
    .pill.sym-VNQ { background: #fce7f3; color: #be185d; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      background: transparent;
      border: 1px solid #d0d9e6;
      padding: 0.2rem 0.8rem;
      border-radius: 30px;
      font-weight: 500;
      font-size: 0.7rem;
      cursor: pointer;
      transition: 0.12s;
      color: #1e293b;
      font-family: inherit;
    }
    .btn-sm { font-size: 0.7rem; padding: 0.15rem 0.6rem; }
    .btn-danger { background: #fee2e2; border-color: #fecaca; color: #dc2626; }
    .btn-danger:hover { background: #fecaca; }
    .btn-primary { background: #2563eb; border-color: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }

    .delta.up { color: #22c55e; }
    .delta.down { color: #ef4444; }
    .delta.flat { color: #94a3b8; }

    .mono-cell { font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 0.8rem; }
    .tabular { font-variant-numeric: tabular-nums; }
  `;
  document.head.appendChild(style);

  document.getElementById("currentUserLabel").textContent = getUserName();
  setupAddModal();
  pollPrices();
  setInterval(pollPrices, POLL_MS);
});