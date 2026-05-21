# ExpenseX

A personal finance tracker built with a C++ backend and a vanilla JS frontend. Track your spending, manage recurring bills, and set monthly budgets — all from a clean web UI served locally.

## Features

- **Dashboard** — spending overview, category breakdown chart, recent transactions, and projected balance after bills
- **Transactions** — log expenses by date, category, and amount with optional notes
- **Bills** — track recurring bills, mark them as paid, and see how much is still owed
- **Budgets** — set monthly spending limits per category and track progress against them
- **Auth** — per-user accounts with salted password hashing and session tokens

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | C++17, [cpp-httplib](https://github.com/yhirose/cpp-httplib) |
| Database | SQLite3 (bundled) |
| JSON | [nlohmann/json](https://github.com/nlohmann/json) (bundled) |
| Frontend | Vanilla HTML/CSS/JS, [Chart.js](https://www.chartjs.org/) |
| Build | CMake 3.16+ |

No external dependencies need to be installed — everything is either bundled in `src/libs/` or linked from Windows system libraries.

## Getting Started

### Prerequisites

- Windows 10/11
- [Visual Studio 2022](https://visualstudio.microsoft.com/) with the **Desktop development with C++** workload, **or** CMake + MSVC/MinGW

### Option 1 — Visual Studio (recommended)

1. Open Visual Studio → **File → Open → Folder** → select this repo
2. Visual Studio auto-detects `CMakeLists.txt` and configures the project
3. Select the **x64-Debug** configuration from the toolbar
4. Press **Ctrl+Shift+B** to build
5. Press **F5** to run

### Option 2 — CMake CLI

```powershell
cmake -B out/build/x64-Debug -S .
cmake --build out/build/x64-Debug
.\expensex.exe
```

### Running

Start the server from the project root:

```powershell
.\expensex.exe
```

Then open your browser to `http://localhost:8080`.

The server must be run from the project root so it can locate the `./frontend` directory. The SQLite database (`expensex.db`) is created automatically on first run.

## Project Structure

```
├── src/
│   ├── main.cpp          # HTTP server, route definitions
│   ├── database.cpp/h    # SQLite wrapper
│   ├── auth.cpp/h        # Session management, password hashing
│   ├── sha256.h          # SHA-256 implementation
│   └── libs/             # Bundled: sqlite3, httplib, json.hpp
├── frontend/
│   ├── index.html        # Login / Register
│   ├── dashboard.html
│   ├── transactions.html
│   ├── bills.html
│   ├── budgets.html
│   ├── css/style.css
│   └── js/               # One JS file per page + shared api.js
└── CMakeLists.txt
```

## API Overview

All endpoints (except `/api/register` and `/api/login`) require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Sign in, returns token |
| POST | `/api/logout` | Invalidate token |
| GET | `/api/user` | Get current user info |
| PUT | `/api/user/balance` | Update balance |
| GET/POST | `/api/transactions` | List or add transactions |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| GET/POST | `/api/bills` | List or add bills |
| PUT | `/api/bills/:id/pay` | Mark bill as paid |
| DELETE | `/api/bills/:id` | Delete a bill |
| GET/POST | `/api/budgets` | List or set budgets |
| DELETE | `/api/budgets/:id` | Delete a budget |
| GET | `/api/summary` | Dashboard summary data |

## Notes

- Sessions are stored in memory and are cleared on server restart
- Passwords are hashed with SHA-256 + a random salt per user
- The app runs over plain HTTP — not recommended for use on a public network without adding HTTPS (e.g. via a reverse proxy like Caddy or Nginx)
- No bank connectivity — all data is entered manually
