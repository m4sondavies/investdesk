/* =========================================================================
   Admin panel logic — modern light theme with SVG icons
   ========================================================================= */

const SYMBOLS = ["TSLA", "AAPL", "NVDA", "MSFT", "VNQ"];
const POLL_MS = 8000;
let latestPrices = {};
let editingId = null;

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------------------------------------------------------------
   Ticker tape (shared visual language with the main dashboard)
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
        <span class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${fmtMoney(Math.abs(p.change || 0))} (${up ? "+" : ""}${fmtMoney(p.change_pct)}%)</span>
      </div>`;
  });
  track.innerHTML = items.join("") + items.join("");
}

async function pollPrices() {
  try {
    const res = await fetch("/api/prices");
    const data = await res.json();
    latestPrices = data.prices;
    renderTickerTape(latestPrices);
    renderTable();
  } catch (err) {
    console.error(err);
  }
}

/* ---------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------- */

async function checkSession() {
  const res = await fetch("/api/admin/session");
  const data = await res.json();
  return data.is_admin;
}

async function login(username, password) {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.ok;
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  showLogin();
}

function showLogin() {
  document.getElementById("loginShell").classList.remove("hidden");
  document.getElementById("adminShell").classList.add("hidden");
}

function showAdmin() {
  document.getElementById("loginShell").classList.add("hidden");
  document.getElementById("adminShell").classList.remove("hidden");
  pollPrices();
  setInterval(pollPrices, POLL_MS);
}

/* ---------------------------------------------------------------------
   Table of ALL users' investments
   --------------------------------------------------------------------- */

async function fetchAllInvestments() {
  const res = await fetch("/api/admin/investments");
  if (res.status === 401) {
    showLogin();
    return [];
  }
  return res.ok ? res.json() : [];
}

async function renderTable() {
  const tbody = document.getElementById("adminBody");
  const emptyState = document.getElementById("adminEmpty");
  if (!tbody) return;

  const rows = await fetchAllInvestments();

  document.getElementById("statTotalRows").textContent = rows.length;
  const uniqueUsers = new Set(rows.map((r) => r.user_name)).size;
  document.getElementById("statTotalUsers").textContent = uniqueUsers;

  let totalValue = 0;
  rows.forEach((r) => {
    const live = latestPrices[r.symbol] || {};
    const price = live.price ?? r.buy_price;
    totalValue += price * r.shares;
  });
  document.getElementById("statTotalValue").textContent = "$" + fmtMoney(totalValue);

  if (!rows.length) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  tbody.innerHTML = rows
    .map((r) => {
      const live = latestPrices[r.symbol] || {};
      const currentPrice = live.price ?? r.buy_price;
      const marketValue = currentPrice * r.shares;
      const costBasis = r.buy_price * r.shares;
      const gain = marketValue - costBasis;
      const gainClass = gain > 0 ? "up" : gain < 0 ? "down" : "flat";

      return `
        <tr>
          <td class="mono-cell">#${r.id}</td>
          <td><strong>${escapeHtml(r.user_name)}</strong></td>
          <td><span class="pill sym-${r.symbol}">${r.symbol}</span></td>
          <td class="mono-cell tabular">${r.shares}</td>
          <td class="mono-cell tabular">$${fmtMoney(r.buy_price)}</td>
          <td class="mono-cell tabular">$${fmtMoney(currentPrice)}</td>
          <td class="mono-cell tabular delta ${gainClass}">${gain > 0 ? "+" : ""}${fmtMoney(gain)}</td>
          <td>
            <button class="btn btn-sm btn-edit" data-edit-id="${r.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              Edit
            </button>
            <button class="btn btn-sm btn-danger" data-delete-id="${r.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Delete
            </button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => String(r.id) === btn.getAttribute("data-edit-id"));
      openEditModal(row);
    });
  });

  tbody.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-id");
      if (!confirm(`Delete investment #${id}? This cannot be undone.`)) return;
      const res = await fetch(`/api/admin/investments/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Investment deleted");
        renderTable();
      } else {
        showToast("Delete failed", true);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------------------
   Edit modal
   --------------------------------------------------------------------- */

function openEditModal(row) {
  editingId = row.id;
  document.getElementById("editUserName").value = row.user_name;
  document.getElementById("editSymbol").value = row.symbol;
  document.getElementById("editShares").value = row.shares;
  document.getElementById("editBuyPrice").value = row.buy_price;
  document.getElementById("editModalOverlay").classList.remove("hidden");
}

function setupEditModal() {
  const overlay = document.getElementById("editModalOverlay");
  const cancelBtn = document.getElementById("cancelEdit");
  const form = document.getElementById("editForm");

  cancelBtn.addEventListener("click", () => overlay.classList.add("hidden"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      user_name: document.getElementById("editUserName").value,
      symbol: document.getElementById("editSymbol").value,
      shares: document.getElementById("editShares").value,
      buy_price: document.getElementById("editBuyPrice").value,
    };

    const res = await fetch(`/api/admin/investments/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      overlay.classList.add("hidden");
      showToast("Investment updated");
      renderTable();
    } else {
      const err = await res.json();
      showToast(err.error || "Update failed", true);
    }
  });
}

/* ---------------------------------------------------------------------
   Init
   --------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  // Inject styles for modern light theme
  const style = document.createElement("style");
  style.textContent = `
    /* ----- modern light theme overrides ----- */
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

    /* login shell */
    #loginShell {
      max-width: 420px;
      margin: 3rem auto;
      padding: 2rem;
      background: #ffffff;
      border-radius: 28px;
      border: 1px solid #e8edf6;
      box-shadow: 0 8px 30px rgba(0,0,0,0.04);
    }
    #loginShell h2 {
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 0.2rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    #loginShell .sub {
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 1.2rem;
    }
    #loginShell .field { margin-bottom: 0.8rem; }
    #loginShell .field label { display:block; font-size:0.75rem; font-weight:500; color:#475569; margin-bottom:0.2rem; }
    #loginShell .field input { width:100%; padding:0.5rem 0.75rem; border-radius:14px; border:1px solid #d0d9e6; background:white; font-family:inherit; }
    #loginShell .field input:focus { border-color:#2563eb; outline:none; }
    #loginError { color:#ef4444; font-size:0.8rem; margin-top:0.4rem; display:none; }
    #loginError.show { display:block; }

    /* admin shell */
    #adminShell .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.8rem;
      margin-bottom: 1.2rem;
    }
    #adminShell .admin-header h1 {
      font-size: 1.4rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    #adminShell .admin-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px,1fr));
      gap: 0.6rem;
      margin-bottom: 1.2rem;
    }
    #adminShell .stat-card {
      background: #f8fafc;
      padding: 0.6rem 1rem;
      border-radius: 14px;
      border: 1px solid #e8edf6;
    }
    #adminShell .stat-card .label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    #adminShell .stat-card .value {
      font-weight: 600;
      font-size: 1.1rem;
    }

    /* table enhancements */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      background: transparent;
      border: 1px solid #d0d9e6;
      padding: 0.2rem 0.7rem;
      border-radius: 30px;
      font-weight: 500;
      font-size: 0.7rem;
      cursor: pointer;
      transition: 0.12s;
      color: #1e293b;
      font-family: inherit;
    }
    .btn-sm { font-size: 0.7rem; padding: 0.15rem 0.6rem; }
    .btn-edit { background: #dbeafe; border-color: #bfdbfe; color: #2563eb; }
    .btn-edit:hover { background: #bfdbfe; }
    .btn-danger { background: #fee2e2; border-color: #fecaca; color: #dc2626; }
    .btn-danger:hover { background: #fecaca; }
    .btn-primary { background: #2563eb; border-color: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }

    .pill {
      display: inline-block;
      padding: 0.05rem 0.6rem;
      border-radius: 30px;
      font-weight: 600;
      font-size: 0.75rem;
      background: #f1f5f9;
      color: #1e293b;
    }
    .pill.sym-TSLA { background: #dbeafe; color: #1d4ed8; }
    .pill.sym-AAPL { background: #dcfce7; color: #15803d; }
    .pill.sym-NVDA { background: #e0e7ff; color: #4338ca; }
    .pill.sym-MSFT { background: #fef3c7; color: #b45309; }
    .pill.sym-VNQ { background: #fce7f3; color: #be185d; }

    .delta.up { color: #22c55e; }
    .delta.down { color: #ef4444; }
    .delta.flat { color: #94a3b8; }

    .mono-cell { font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 0.8rem; }
    .tabular { font-variant-numeric: tabular-nums; }

    /* empty state */
    #adminEmpty .icon { font-size: 2rem; opacity:0.4; }

    /* edit modal */
    #editModalOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.2);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    #editModalOverlay.hidden { display: none; }
    #editModalOverlay .modal {
      background: white;
      padding: 2rem;
      border-radius: 28px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 20px 48px rgba(0,0,0,0.08);
    }
    #editModalOverlay .modal h3 {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 1.2rem;
      font-weight: 600;
    }
    #editModalOverlay .field { margin-bottom: 0.8rem; }
    #editModalOverlay .field label { display:block; font-size:0.75rem; font-weight:500; color:#475569; margin-bottom:0.2rem; }
    #editModalOverlay .field input, #editModalOverlay .field select { width:100%; padding:0.5rem 0.75rem; border-radius:14px; border:1px solid #d0d9e6; background:white; font-family:inherit; }
    #editModalOverlay .modal-actions { display:flex; gap:0.5rem; justify-content:flex-end; margin-top:1.2rem; }
  `;
  document.head.appendChild(style);

  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const ok = await login(username, password);
    if (ok) {
      loginError.classList.remove("show");
      showAdmin();
    } else {
      loginError.textContent = "Invalid username or password.";
      loginError.classList.add("show");
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", logout);
  setupEditModal();

  const isAdmin = await checkSession();
  if (isAdmin) {
    showAdmin();
  } else {
    showLogin();
  }
});