"""
Investment Dashboard — Backend
--------------------------------
Flask + yfinance + SQLite. No external API key required.

Run:
    pip install flask yfinance flask-cors
    python app.py

Then open http://localhost:5000 in your browser.
"""

import sqlite3
import time
import threading
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, request, session, send_from_directory, g
from flask_cors import CORS

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    print("WARNING: yfinance not installed. Run: pip install yfinance")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH = "dashboard.db"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Real estate has no single stock ticker, so we proxy it with VNQ
# (Vanguard Real Estate ETF) — a widely used real-estate market proxy.
TICKERS = {
    "TSLA": "Tesla",
    "AAPL": "Apple",
    "NVDA": "NVIDIA",
    "MSFT": "Microsoft",
    "VNQ": "Real Estate (VNQ ETF)",
}

PRICE_CACHE = {}
PRICE_CACHE_LOCK = threading.Lock()
CACHE_TTL_SECONDS = 15  # refetch from yfinance at most every 15s per symbol

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = "dev-secret-key-change-in-production"
CORS(app, supports_credentials=True)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            shares REAL NOT NULL,
            buy_price REAL NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Live price fetching (yfinance), with a small in-memory cache so we don't
# hammer Yahoo Finance on every browser poll.
# ---------------------------------------------------------------------------

def fetch_price(symbol):
    """Fetch the latest price + daily change for a symbol via yfinance."""
    now = time.time()
    with PRICE_CACHE_LOCK:
        cached = PRICE_CACHE.get(symbol)
        if cached and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
            return cached

    if not YFINANCE_AVAILABLE:
        return {"symbol": symbol, "price": None, "change": None,
                "change_pct": None, "error": "yfinance not installed",
                "fetched_at": now}

    try:
        ticker = yf.Ticker(symbol)
        # fast_info is the lightweight, low-latency path in yfinance
        info = ticker.fast_info
        price = info.get("lastPrice") or info.get("last_price")
        prev_close = info.get("previousClose") or info.get("previous_close")

        if price is None:
            # fallback: 1-day history
            hist = ticker.history(period="2d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])
                prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price

        change = (price - prev_close) if (price is not None and prev_close) else 0
        change_pct = (change / prev_close * 100) if prev_close else 0

        result = {
            "symbol": symbol,
            "price": round(float(price), 2) if price is not None else None,
            "change": round(float(change), 2),
            "change_pct": round(float(change_pct), 2),
            "error": None,
            "fetched_at": now,
        }
    except Exception as exc:
        result = {"symbol": symbol, "price": None, "change": None,
                   "change_pct": None, "error": str(exc), "fetched_at": now}

    with PRICE_CACHE_LOCK:
        PRICE_CACHE[symbol] = result
    return result


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "Admin authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Routes — static frontend
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory("templates", "dashboard.html")


@app.route("/admin")
def admin_page():
    return send_from_directory("templates", "admin.html")


@app.route("/static/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


# ---------------------------------------------------------------------------
# Routes — live prices
# ---------------------------------------------------------------------------

@app.route("/api/prices")
def api_prices():
    results = {}
    for symbol, label in TICKERS.items():
        data = fetch_price(symbol)
        data["label"] = label
        results[symbol] = data
    return jsonify({"prices": results, "server_time": datetime.utcnow().isoformat()})


# ---------------------------------------------------------------------------
# Routes — investments (user-facing: create + list own)
# ---------------------------------------------------------------------------

@app.route("/api/investments", methods=["GET"])
def list_investments():
    user_name = request.args.get("user_name", "").strip()
    db = get_db()
    if user_name:
        rows = db.execute(
            "SELECT * FROM investments WHERE user_name = ? ORDER BY created_at DESC",
            (user_name,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM investments ORDER BY created_at DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/investments", methods=["POST"])
def create_investment():
    payload = request.get_json(force=True) or {}
    user_name = (payload.get("user_name") or "").strip()
    symbol = (payload.get("symbol") or "").strip().upper()
    shares = payload.get("shares")
    buy_price = payload.get("buy_price")

    if not user_name or symbol not in TICKERS or not shares or not buy_price:
        return jsonify({"error": "user_name, valid symbol, shares, and buy_price are required"}), 400

    try:
        shares = float(shares)
        buy_price = float(buy_price)
    except (TypeError, ValueError):
        return jsonify({"error": "shares and buy_price must be numbers"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO investments (user_name, symbol, shares, buy_price, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_name, symbol, shares, buy_price, datetime.utcnow().isoformat()),
    )
    db.commit()
    new_row = db.execute("SELECT * FROM investments WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(new_row)), 201


# ---------------------------------------------------------------------------
# Routes — admin auth
# ---------------------------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    payload = request.get_json(force=True) or {}
    username = payload.get("username", "")
    password = payload.get("password", "")
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "Invalid username or password"}), 401


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("is_admin", None)
    return jsonify({"ok": True})


@app.route("/api/admin/session")
def admin_session():
    return jsonify({"is_admin": bool(session.get("is_admin"))})


# ---------------------------------------------------------------------------
# Routes — admin CRUD on investments (edit / delete any user's record)
# ---------------------------------------------------------------------------

@app.route("/api/admin/investments", methods=["GET"])
@admin_required
def admin_list_investments():
    db = get_db()
    rows = db.execute("SELECT * FROM investments ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/admin/investments/<int:investment_id>", methods=["PUT"])
@admin_required
def admin_update_investment(investment_id):
    payload = request.get_json(force=True) or {}
    db = get_db()
    existing = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
    if not existing:
        return jsonify({"error": "Investment not found"}), 404

    user_name = payload.get("user_name", existing["user_name"])
    symbol = (payload.get("symbol", existing["symbol"]) or "").upper()
    shares = payload.get("shares", existing["shares"])
    buy_price = payload.get("buy_price", existing["buy_price"])

    if symbol not in TICKERS:
        return jsonify({"error": f"symbol must be one of {list(TICKERS.keys())}"}), 400

    try:
        shares = float(shares)
        buy_price = float(buy_price)
    except (TypeError, ValueError):
        return jsonify({"error": "shares and buy_price must be numbers"}), 400

    db.execute(
        "UPDATE investments SET user_name = ?, symbol = ?, shares = ?, buy_price = ? WHERE id = ?",
        (user_name, symbol, shares, buy_price, investment_id),
    )
    db.commit()
    updated = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
    return jsonify(dict(updated))


@app.route("/api/admin/investments/<int:investment_id>", methods=["DELETE"])
@admin_required
def admin_delete_investment(investment_id):
    db = get_db()
    existing = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
    if not existing:
        return jsonify({"error": "Investment not found"}), 404
    db.execute("DELETE FROM investments WHERE id = ?", (investment_id,))
    db.commit()
    return jsonify({"ok": True, "deleted_id": investment_id})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print(" Investment Dashboard")
    print(" Dashboard : http://localhost:5000")
    print(" Admin     : http://localhost:5000/admin")
    print(f" Admin login: {ADMIN_USERNAME} / {ADMIN_PASSWORD}")
    if not YFINANCE_AVAILABLE:
        print(" WARNING: yfinance is not installed — prices will not load.")
        print("          Run: pip install yfinance")
    print("=" * 60)
    app.run(debug=True, port=5000)