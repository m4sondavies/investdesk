# InvestDesk — Investment Dashboard

A portfolio dashboard for Tesla (TSLA), Apple (AAPL), NVIDIA (NVDA), Microsoft (MSFT),
and Real Estate (tracked via the VNQ ETF, since there's no single "real estate stock").

Built with **Python (Flask)** for the backend, **HTML/CSS/JS** for the frontend.
Live prices come from **yfinance** — no API key required.

## What's actually included

- ✅ Live stock prices via `yfinance` (refreshes every 5 seconds in the browser)
- ✅ Portfolio dashboard with summary stats, asset cards, sparklines, holdings table
- ✅ Add investment (symbol, shares, buy price) — stored in SQLite
- ✅ Admin panel at `/admin` — login required, can **edit or delete any user's** investment record
- ✅ WhatsApp-**styled** chat widget with a scripted/rule-based bot

## What's NOT included (and why)

- ❌ **Real WhatsApp integration.** A genuine WhatsApp bot requires Meta's WhatsApp Business
  API, a verified business phone number, and webhook approval from Meta — none of which
  can be set up from code alone. The chat widget here looks like WhatsApp but runs
  entirely inside this app, with scripted replies.
- ❌ **Multi-device sync of "who's logged in."** There's no real user login system — each
  browser is assigned a random guest ID (stored in `localStorage`) so your holdings persist
  across refreshes on the same browser. For real user accounts, you'd add a proper auth
  system (e.g. Flask-Login + password hashing).

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the server
python app.py
```

Then open:
- **Dashboard:** http://localhost:5000
- **Admin panel:** http://localhost:5000/admin

### Admin login
```
Username: admin
Password: admin123
```

⚠️ This is a hardcoded demo credential in `app.py` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).
Change it before putting this anywhere other than your own machine.

## Project structure

```
dashboard/
├── app.py                  # Flask backend: routes, yfinance fetching, SQLite CRUD
├── requirements.txt
├── dashboard.db             # created automatically on first run
├── templates/
│   ├── dashboard.html       # main investor-facing page
│   └── admin.html           # admin login + CRUD table
└── static/
    ├── css/style.css        # shared design system
    └── js/
        ├── dashboard.js     # live price polling, holdings, add investment
        ├── admin.js         # admin login, edit/delete any record
        └── chat-widget.js   # WhatsApp-styled scripted chat bot
```

## API reference

All endpoints are served by `app.py` on `http://localhost:5000`.

| Method | Endpoint                          | Auth required | Purpose                                  |
|--------|------------------------------------|----------------|-------------------------------------------|
| GET    | `/api/prices`                      | No             | Live prices for all 5 tickers             |
| GET    | `/api/investments?user_name=`      | No             | List one user's investments (or all, if omitted) |
| POST   | `/api/investments`                 | No             | Create an investment record               |
| POST   | `/api/admin/login`                 | No             | Log in as admin (sets session cookie)     |
| POST   | `/api/admin/logout`                | No             | Clear the admin session                   |
| GET    | `/api/admin/session`               | No             | Check if current session is an admin      |
| GET    | `/api/admin/investments`           | Yes            | List **every** user's investments         |
| PUT    | `/api/admin/investments/<id>`      | Yes            | Edit any investment record                |
| DELETE | `/api/admin/investments/<id>`      | Yes            | Delete any investment record              |

`POST /api/investments` body:
```json
{ "user_name": "alice", "symbol": "TSLA", "shares": 10, "buy_price": 312.50 }
```
`symbol` must be one of: `TSLA`, `AAPL`, `NVDA`, `MSFT`, `VNQ`.

## How the live prices work

`app.py` calls `yfinance` for each symbol, caching results for 15 seconds server-side
(so the browser can poll every 5 seconds without hammering Yahoo Finance). If `yfinance`
can't reach the network, the price cells show `—` instead of crashing.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Prices show `—` everywhere | No internet access, or `yfinance` not installed | `pip install yfinance`; check your connection |
| `ModuleNotFoundError: flask_cors` | Dependency missing | `pip install -r requirements.txt` |
| Admin panel keeps booting you to login | Cookies blocked, or different browser/incognito tab | Make sure cookies are enabled for `localhost` |
| Holdings disappear after closing the browser | Expected — your guest ID lives in that browser's `localStorage` | Use the same browser/profile, or add real accounts (see below) |
| `OperationalError: database is locked` | Rare with SQLite under concurrent writes | Restart `app.py`; for real concurrency, move to Postgres |
| Port 5000 already in use | Another process is using it | Run `python app.py` with `app.run(port=5050)` edited in, or stop the other process |

## Extending this

- **Real WhatsApp:** integrate Meta's WhatsApp Business Platform separately, then have
  your webhook call this app's `/api/investments` endpoints.
- **Real user accounts:** swap the `localStorage` guest ID for a proper login system.
- **More assets:** add entries to the `TICKERS` dict in `app.py` — any valid Yahoo Finance
  ticker symbol works.
- **Production deploy:** don't use Flask's built-in dev server (`debug=True`) in
  production — use something like gunicorn, and move the admin password into an
  environment variable instead of hardcoding it.
