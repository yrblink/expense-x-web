# ExpenseX

A personal finance tracker with a C++ backend and a vanilla JS frontend, backed by SQLite. Runs locally on Windows. You add transactions, track recurring bills, and set per-category budgets; the dashboard shows where you stand.

## Features

The dashboard pulls the picture together in one screen: current balance, monthly income and spending, a category breakdown, recent transactions, and an upcoming-bills strip sorted by due date. Balance is derived (starting balance plus income, minus expenses and paid bills), so editing a transaction or your starting balance recomputes the number on the next request.

The Balance Breakdown panel has two views: horizontal bars or a pie chart. Pick whichever reads better at the moment.

Transactions take a date, category, amount, type (expense or income), and notes. Edit and delete inline.

Bills work the same way: name, category, amount, due date. Mark them paid or unpaid as you go. Unpaid ones show up on the dashboard with overdue, due-soon, and later states.

Budgets live per-category with a weekly or monthly period. The budgets page shows a wheel with overall usage and a table of each budget's progress.

Authentication is per-user. Passwords get a random salt before SHA-256 hashing. Sessions sit in memory, so a server restart logs everyone out. That's fine for a single-user local app and risky if you ever expose it to a network.

A light/dark theme toggle persists per browser. The layout reflows for narrow viewports: the sidebar collapses to icons under 1100px and becomes a top bar on phones.

## Tech stack

| Layer    | Tech |
|----------|------|
| Backend  | C++17, [cpp-httplib](https://github.com/yhirose/cpp-httplib) |
| Database | SQLite3, bundled |
| JSON     | [nlohmann/json](https://github.com/nlohmann/json), bundled |
| Frontend | Vanilla HTML/CSS/JS, [Chart.js](https://www.chartjs.org/) |
| Fonts    | Barlow Condensed (display), Figtree (body) |
| Build    | CMake 3.16+ |

Nothing external needs installing. Everything is either bundled under `src/libs/` or linked from Windows system libraries.

## Getting started

You need Windows 10 or 11 plus [Visual Studio 2022](https://visualstudio.microsoft.com/) with the *Desktop development with C++* workload. CMake with MSVC or MinGW works too.

### Visual Studio

Open the folder. Visual Studio picks up `CMakeLists.txt` and configures itself. Choose the x64-Debug configuration, build with Ctrl+Shift+B, run with F5.

### CMake CLI

```powershell
cmake -B out/build/x64-Debug -S .
cmake --build out/build/x64-Debug
.\expensex.exe
```

Run the server from the project root so it can find `./frontend`. The SQLite file (`expensex.db`) is created on first launch, and schema upgrades apply automatically on startup. Then open `http://localhost:8080`.

## Project structure

```
├── src/
│   ├── main.cpp          # HTTP server, routes
│   ├── database.cpp/h    # SQLite wrapper, schema + migrations
│   ├── auth.cpp/h        # Sessions, password hashing
│   ├── sha256.h          # SHA-256 implementation
│   └── libs/             # sqlite3, httplib, json.hpp
├── frontend/
│   ├── index.html        # Login / register
│   ├── dashboard.html
│   ├── transactions.html
│   ├── bills.html
│   ├── budgets.html
│   ├── css/style.css     # Single sheet, themed via CSS variables
│   └── js/               # One file per page + shared api.js
└── CMakeLists.txt
```

## Notes

The app speaks plain HTTP. Put it behind a TLS proxy like Caddy or Nginx if you want it reachable beyond localhost. No bank connectivity and no third-party APIs: every transaction is one you typed in yourself.
