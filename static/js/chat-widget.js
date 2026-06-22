/* =========================================================================
   WhatsApp-style chat widget — modern light theme with SVG icons
   ========================================================================= */

(function () {
  const BOT_NAME = "InvestDesk Support";

  const RESPONSES = [
    {
      test: /price|quote|trading at|how much/i,
      reply: "You can see live prices for Tesla, Apple, NVIDIA, Microsoft and Real Estate (VNQ) right on the dashboard — they refresh automatically every few seconds.",
    },
    {
      test: /add|invest|buy|new holding/i,
      reply: "To add a holding, click “Add Investment” above the table, pick a symbol, enter your shares and buy price, and save. It'll show up in your table right away.",
    },
    {
      test: /delete|remove/i,
      reply: "You can remove a holding from your own table directly. If you need a different record corrected, an admin can edit or delete any entry from the Admin panel.",
    },
    {
      test: /admin|login|password/i,
      reply: "The admin panel is at /admin. It's used to review, edit, or delete any user's investment records.",
    },
    {
      test: /real estate|vnq/i,
      reply: "Real estate is tracked using VNQ, the Vanguard Real Estate ETF — a common stand-in for the real estate market since there's no single “real estate stock.”",
    },
    {
      test: /hi|hello|hey/i,
      reply: "Hey! I can help with adding holdings, reading your dashboard, or pointing you to the admin panel. What do you need?",
    },
    {
      test: /human|agent|real person/i,
      reply: "I'm just a scripted assistant for this demo — there's no live agent behind me. For a real handoff you'd wire this up to a support inbox or a live WhatsApp Business number.",
    },
  ];

  const DEFAULT_REPLY =
    "Got it. I'm a simple scripted assistant for this demo, so I can only answer questions about prices, adding investments, and the admin panel. Try one of the quick replies below.";

  const QUICK_REPLIES = [
    "How do I add an investment?",
    "Where do prices come from?",
    "What is VNQ?",
  ];

  function fmtTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function buildWidget() {
    // --- Launcher button with SVG icon and badge ---
    const launcher = document.createElement("div");
    launcher.className = "chat-launcher";
    launcher.id = "chatLauncher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.32C8.55 21.5 10.27 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.13 14.13c-.22.62-1.27 1.18-1.74 1.25-.45.07-1 .1-1.6-.1-.37-.12-.84-.28-1.45-.55-2.55-1.1-4.2-3.66-4.33-3.84-.13-.18-1.03-1.37-1.03-2.6 0-1.24.65-1.85.88-2.1.22-.25.49-.31.65-.31.16 0 .32 0 .47.01.15.01.35-.06.55.42.2.49.69 1.7.75 1.82.06.13.1.28.02.45-.08.17-.13.27-.25.42-.13.15-.27.33-.38.45-.13.13-.26.27-.11.53.15.27.69 1.13 1.48 1.83 1.02.9 1.88 1.18 2.15 1.31.27.13.43.11.59-.06.16-.18.69-.8.87-1.08.18-.27.36-.23.6-.14.25.09 1.57.74 1.84.87.27.13.45.2.51.31.07.12.07.65-.15 1.27z"/>
      </svg>
      <span class="chat-badge" id="chatBadge">1</span>
    `;

    // --- Chat window ---
    const win = document.createElement("div");
    win.className = "chat-window hidden";
    win.id = "chatWindow";
    win.innerHTML = `
      <div class="chat-header">
        <div class="chat-avatar">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <div class="chat-header-info">
          <div class="name">${BOT_NAME}</div>
          <div class="status"><span class="dot"></span> Online · scripted demo bot</div>
        </div>
        <button class="chat-close" id="chatClose">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#94a3b8">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="chat-disclaimer">Styled like WhatsApp — not connected to the real WhatsApp network</div>
      <div class="chat-body" id="chatBody"></div>
      <div class="chat-quickreplies" id="chatQuick"></div>
      <div class="chat-input-row">
        <input type="text" id="chatInput" placeholder="Type a message" autocomplete="off" />
        <div class="chat-send" id="chatSend">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#2563eb">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(win);

    // --- Styles (injected) ---
    const style = document.createElement("style");
    style.textContent = `
      /* ----- launcher ----- */
      .chat-launcher {
        position: fixed;
        bottom: 28px;
        right: 28px;
        width: 60px;
        height: 60px;
        border-radius: 60px;
        background: #2563eb;
        color: white;
        border: none;
        box-shadow: 0 8px 30px rgba(37,99,235,0.35);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: 0.2s;
        z-index: 9999;
      }
      .chat-launcher:hover { transform: scale(1.05); background: #1d4ed8; }
      .chat-launcher .chat-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 0.65rem;
        font-weight: 600;
        border-radius: 30px;
        padding: 0.15rem 0.5rem;
        min-width: 20px;
        text-align: center;
        border: 2px solid white;
      }
      .chat-badge.hidden { display: none; }

      /* ----- chat window (modern light) ----- */
      .chat-window {
        position: fixed;
        bottom: 100px;
        right: 28px;
        width: 400px;
        max-width: calc(100vw - 40px);
        height: 560px;
        max-height: calc(100vh - 140px);
        background: #ffffff;
        border-radius: 28px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.04);
        border: 1px solid #e8edf6;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9998;
        transition: 0.2s;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .chat-window.hidden { display: none !important; }

      .chat-header {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.9rem 1.2rem;
        background: #f8fafc;
        border-bottom: 1px solid #e8edf6;
        flex-shrink: 0;
      }
      .chat-avatar {
        width: 38px;
        height: 38px;
        border-radius: 38px;
        background: #2563eb;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .chat-header-info { flex: 1; }
      .chat-header-info .name { font-weight: 600; font-size: 0.9rem; color: #0b1b33; }
      .chat-header-info .status {
        font-size: 0.7rem;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .chat-header-info .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 8px;
        background: #22c55e;
      }
      .chat-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.6;
        transition: 0.15s;
        border-radius: 8px;
      }
      .chat-close:hover { opacity: 1; background: #f1f5f9; }

      .chat-disclaimer {
        font-size: 0.6rem;
        color: #94a3b8;
        text-align: center;
        padding: 0.3rem 0.5rem;
        background: #fafcff;
        border-bottom: 1px solid #e8edf6;
        flex-shrink: 0;
        letter-spacing: 0.02em;
      }

      .chat-body {
        flex: 1;
        overflow-y: auto;
        padding: 0.8rem 1rem 0.5rem;
        background: #fafcff;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .chat-body::-webkit-scrollbar { width: 4px; }
      .chat-body::-webkit-scrollbar-thumb { background: #d0d9e6; border-radius: 10px; }

      .chat-msg {
        max-width: 82%;
        padding: 0.5rem 0.9rem;
        border-radius: 16px;
        font-size: 0.85rem;
        line-height: 1.4;
        position: relative;
        word-break: break-word;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02);
      }
      .chat-msg.user {
        align-self: flex-end;
        background: #2563eb;
        color: white;
        border-bottom-right-radius: 4px;
      }
      .chat-msg.bot {
        align-self: flex-start;
        background: white;
        color: #0b1b33;
        border: 1px solid #e8edf6;
        border-bottom-left-radius: 4px;
      }
      .chat-msg .time {
        font-size: 0.55rem;
        opacity: 0.6;
        margin-top: 0.2rem;
        text-align: right;
        letter-spacing: 0.02em;
      }
      .chat-msg.user .time { color: rgba(255,255,255,0.7); }

      .chat-typing {
        align-self: flex-start;
        background: white;
        padding: 0.5rem 1rem;
        border-radius: 20px;
        border: 1px solid #e8edf6;
        display: flex;
        gap: 0.3rem;
        margin: 0.2rem 0;
      }
      .chat-typing span {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 8px;
        background: #94a3b8;
        animation: typing 1.2s infinite;
      }
      .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
      .chat-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing {
        0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
        30% { opacity: 0.8; transform: translateY(-4px); }
      }

      .chat-quickreplies {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        padding: 0.4rem 1rem 0.6rem;
        background: #fafcff;
        border-top: 1px solid #e8edf6;
        flex-shrink: 0;
      }
      .chat-quickreply {
        background: #f1f5f9;
        border: 1px solid #e8edf6;
        border-radius: 30px;
        padding: 0.2rem 0.9rem;
        font-size: 0.7rem;
        font-weight: 500;
        color: #1e293b;
        cursor: pointer;
        transition: 0.12s;
        font-family: inherit;
        white-space: nowrap;
      }
      .chat-quickreply:hover { background: #e2e8f0; border-color: #cbd5e1; }

      .chat-input-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 1rem 0.8rem;
        background: white;
        border-top: 1px solid #e8edf6;
        flex-shrink: 0;
      }
      .chat-input-row input {
        flex: 1;
        border: 1px solid #d0d9e6;
        border-radius: 30px;
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        font-family: inherit;
        outline: none;
        transition: 0.12s;
        background: #f8fafc;
      }
      .chat-input-row input:focus { border-color: #2563eb; background: white; }
      .chat-send {
        width: 40px;
        height: 40px;
        border-radius: 40px;
        background: #dbeafe;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: 0.12s;
        flex-shrink: 0;
      }
      .chat-send:hover { background: #bfdbfe; }
      .chat-send svg { fill: #2563eb; }

      @media (max-width: 500px) {
        .chat-window {
          bottom: 80px;
          right: 12px;
          width: calc(100vw - 24px);
          height: 70vh;
          border-radius: 20px;
        }
        .chat-launcher {
          bottom: 20px;
          right: 20px;
          width: 56px;
          height: 56px;
        }
      }
    `;
    document.head.appendChild(style);

    // --- Logic ---
    const body = win.querySelector("#chatBody");
    const quick = win.querySelector("#chatQuick");
    const input = win.querySelector("#chatInput");

    function addMessage(text, who) {
      const msg = document.createElement("div");
      msg.className = `chat-msg ${who}`;
      msg.innerHTML = `${text}<div class="time">${fmtTime()}</div>`;
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function showTyping(cb) {
      const t = document.createElement("div");
      t.className = "chat-typing";
      t.innerHTML = "<span></span><span></span><span></span>";
      body.appendChild(t);
      body.scrollTop = body.scrollHeight;
      setTimeout(() => {
        t.remove();
        cb();
      }, 700 + Math.random() * 500);
    }

    function botReply(userText) {
      const match = RESPONSES.find((r) => r.test.test(userText));
      const reply = match ? match.reply : DEFAULT_REPLY;
      showTyping(() => addMessage(reply, "bot"));
    }

    function send(text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      addMessage(trimmed, "user");
      input.value = "";
      botReply(trimmed);
    }

    function renderQuickReplies() {
      quick.innerHTML = "";
      QUICK_REPLIES.forEach((q) => {
        const btn = document.createElement("button");
        btn.className = "chat-quickreply";
        btn.textContent = q;
        btn.addEventListener("click", () => send(q));
        quick.appendChild(btn);
      });
    }

    win.querySelector("#chatSend").addEventListener("click", () => send(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send(input.value);
    });

    launcher.addEventListener("click", () => {
      win.classList.remove("hidden");
      launcher.classList.add("hidden");
      const badge = document.getElementById("chatBadge");
      if (badge) badge.classList.add("hidden");
      if (!body.dataset.greeted) {
        body.dataset.greeted = "1";
        showTyping(() =>
          addMessage(
            "Hi! I'm the InvestDesk assistant. Ask me about prices, adding a holding, or the admin panel.",
            "bot"
          )
        );
        renderQuickReplies();
      }
    });

    win.querySelector("#chatClose").addEventListener("click", () => {
      win.classList.add("hidden");
      launcher.classList.remove("hidden");
    });
  }

  document.addEventListener("DOMContentLoaded", buildWidget);
})();