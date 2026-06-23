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
import json
import traceback

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

# Only 4 stocks allowed
TICKERS = {
    "TSLA": "Tesla",
    "AAPL": "Apple",
    "NVDA": "NVIDIA",
    "MSFT": "Microsoft",
}

PRICE_CACHE = {}
PRICE_CACHE_LOCK = threading.Lock()
CACHE_TTL_SECONDS = 15

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
    # Check if email column exists, add if not
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(investments)")
    columns = [col[1] for col in cursor.fetchall()]
    if "email" not in columns:
        cursor.execute("ALTER TABLE investments ADD COLUMN email TEXT")
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Live price fetching
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
        info = ticker.fast_info
        price = info.get("lastPrice") or info.get("last_price")
        prev_close = info.get("previousClose") or info.get("previous_close")

        if price is None:
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
    return send_from_directory("templates", "index.html")


@app.route("/dashboard")
def dashboard():
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
    try:
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
    except Exception as e:
        print(f"Error in list_investments: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/investments", methods=["POST"])
def create_investment():
    """User creates an investment (dashboard only)"""
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    
    try:
        user_name = (payload.get("user_name") or "").strip()
        email = (payload.get("email") or "").strip()
        symbol = (payload.get("symbol") or "").strip().upper()
        shares = payload.get("shares")
        buy_price = payload.get("buy_price")

        if not user_name or symbol not in TICKERS or shares is None or buy_price is None:
            return jsonify({"error": "user_name, valid symbol, shares, and buy_price are required"}), 400

        try:
            shares = float(shares)
            buy_price = float(buy_price)
        except (TypeError, ValueError):
            return jsonify({"error": "shares and buy_price must be numbers"}), 400

        db = get_db()
        cur = db.execute(
            "INSERT INTO investments (user_name, email, symbol, shares, buy_price, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_name, email, symbol, shares, buy_price, datetime.utcnow().isoformat()),
        )
        db.commit()
        new_row = db.execute("SELECT * FROM investments WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(dict(new_row)), 201
    except Exception as e:
        print(f"Error in create_investment: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Routes — admin auth
# ---------------------------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    
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
    try:
        return jsonify({"is_admin": bool(session.get("is_admin"))})
    except Exception as e:
        print(f"Error in admin_session: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Routes — admin CRUD on investments (full control)
# ---------------------------------------------------------------------------

@app.route("/api/admin/investments", methods=["GET"])
@admin_required
def admin_list_investments():
    try:
        db = get_db()
        rows = db.execute("SELECT * FROM investments ORDER BY created_at DESC").fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        print(f"Error in admin_list_investments: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/investments", methods=["POST"])
@admin_required
def admin_create_investment():
    """Admin creates a new investment record"""
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    
    try:
        user_name = (payload.get("user_name") or "").strip()
        email = (payload.get("email") or "").strip()
        symbol = (payload.get("symbol") or "").strip().upper()
        shares = payload.get("shares")
        buy_price = payload.get("buy_price")

        if not user_name or symbol not in TICKERS or shares is None or buy_price is None:
            return jsonify({"error": "user_name, symbol, shares, and buy_price are required"}), 400

        try:
            shares = float(shares)
            buy_price = float(buy_price)
        except (TypeError, ValueError):
            return jsonify({"error": "shares and buy_price must be numbers"}), 400

        db = get_db()
        cur = db.execute(
            "INSERT INTO investments (user_name, email, symbol, shares, buy_price, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_name, email, symbol, shares, buy_price, datetime.utcnow().isoformat()),
        )
        db.commit()
        new_row = db.execute("SELECT * FROM investments WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(dict(new_row)), 201
    except Exception as e:
        print(f"Error in admin_create_investment: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/investments/<int:investment_id>", methods=["PUT"])
@admin_required
def admin_update_investment(investment_id):
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    
    try:
        db = get_db()
        existing = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
        if not existing:
            return jsonify({"error": "Investment not found"}), 404

        user_name = payload.get("user_name", existing["user_name"])
        email = payload.get("email", existing.get("email", ""))
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
            "UPDATE investments SET user_name = ?, email = ?, symbol = ?, shares = ?, buy_price = ? WHERE id = ?",
            (user_name, email, symbol, shares, buy_price, investment_id),
        )
        db.commit()
        updated = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
        return jsonify(dict(updated))
    except Exception as e:
        print(f"Error in admin_update_investment: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/investments/<int:investment_id>", methods=["DELETE"])
@admin_required
def admin_delete_investment(investment_id):
    try:
        db = get_db()
        existing = db.execute("SELECT * FROM investments WHERE id = ?", (investment_id,)).fetchone()
        if not existing:
            return jsonify({"error": "Investment not found"}), 404
        db.execute("DELETE FROM investments WHERE id = ?", (investment_id,))
        db.commit()
        return jsonify({"ok": True, "deleted_id": investment_id})
    except Exception as e:
        print(f"Error in admin_delete_investment: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Resource not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


@app.errorhandler(400)
def bad_request(error):
    return jsonify({"error": "Bad request"}), 400


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method not allowed"}), 405


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print(" Investment Dashboard")
    print(" Landing Page : http://localhost:5000")
    print(" Dashboard    : http://localhost:5000/dashboard")
    print(" Admin        : http://localhost:5000/admin")
    print(f" Admin login  : {ADMIN_USERNAME} / {ADMIN_PASSWORD}")
    print(" Allowed stocks: TSLA, AAPL, NVDA, MSFT")
    if not YFINANCE_AVAILABLE:
        print(" WARNING: yfinance is not installed — prices will not load.")
        print("          Run: pip install yfinance")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
