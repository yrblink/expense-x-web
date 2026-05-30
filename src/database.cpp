#include "database.h"
#include <iostream>
#include <stdexcept>
#include <string>

Database::Database(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db) != SQLITE_OK)
        throw std::runtime_error(std::string("Cannot open database: ") + sqlite3_errmsg(db));

    sqlite3_exec(db, "PRAGMA foreign_keys = ON;", nullptr, nullptr, nullptr);

    exec(R"(
        CREATE TABLE IF NOT EXISTS users (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            username         TEXT    UNIQUE NOT NULL,
            password_hash    TEXT    NOT NULL,
            salt             TEXT    NOT NULL,
            balance          REAL    DEFAULT 0.0,
            starting_balance REAL    DEFAULT 0.0,
            created_at       TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            date       TEXT    NOT NULL,
            category   TEXT    NOT NULL,
            amount     REAL    NOT NULL,
            notes      TEXT    DEFAULT '',
            type       TEXT    NOT NULL DEFAULT 'expense',
            created_at TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS bills (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            name       TEXT    NOT NULL,
            category   TEXT    NOT NULL,
            amount_due REAL    NOT NULL,
            due_date   TEXT    NOT NULL,
            is_paid    INTEGER DEFAULT 0,
            created_at TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS budgets (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL,
            category      TEXT    NOT NULL,
            monthly_limit REAL    NOT NULL,
            period        TEXT    NOT NULL DEFAULT 'monthly',
            UNIQUE(user_id, category),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    )");

    // Schema migration: derived-balance model.
    // Old databases stored `users.balance` as a manually-typed snapshot adjusted by
    // transaction add/delete. New databases derive balance from starting_balance +
    // income - expenses - paid bills. Backfill so existing users see the same number.
    int schemaVersion = 0;
    sqlite3_stmt* vs;
    sqlite3_prepare_v2(db, "PRAGMA user_version", -1, &vs, nullptr);
    if (sqlite3_step(vs) == SQLITE_ROW) schemaVersion = sqlite3_column_int(vs, 0);
    sqlite3_finalize(vs);

    if (schemaVersion < 1) {
        if (!columnExists("users", "starting_balance"))
            exec("ALTER TABLE users ADD COLUMN starting_balance REAL DEFAULT 0.0;");
        if (!columnExists("transactions", "type"))
            exec("ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';");

        // old_balance = starting - sum(expenses), so starting = old_balance + sum(expenses).
        // Paid bills are also added back since they will now be deducted in the derivation.
        exec(R"(
            UPDATE users SET starting_balance = balance +
              COALESCE((SELECT SUM(amount)     FROM transactions
                        WHERE user_id = users.id), 0) +
              COALESCE((SELECT SUM(amount_due) FROM bills
                        WHERE user_id = users.id AND is_paid = 1), 0);
        )");
        exec("PRAGMA user_version = 1;");
    }

    if (schemaVersion < 2) {
        if (!columnExists("budgets", "period"))
            exec("ALTER TABLE budgets ADD COLUMN period TEXT NOT NULL DEFAULT 'monthly';");
        exec("PRAGMA user_version = 2;");
    }
}

Database::~Database() {
    if (db) sqlite3_close(db);
}

bool Database::exec(const char* sql) {
    char* err = nullptr;
    bool  ok  = sqlite3_exec(db, sql, nullptr, nullptr, &err) == SQLITE_OK;
    if (err) { std::cerr << "SQL: " << err << '\n'; sqlite3_free(err); }
    return ok;
}

bool Database::columnExists(const char* table, const char* column) {
    std::string sql = "PRAGMA table_info(" + std::string(table) + ")";
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, sql.c_str(), -1, &s, nullptr);
    bool found = false;
    while (sqlite3_step(s) == SQLITE_ROW) {
        const char* name = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        if (name && std::string(name) == column) { found = true; break; }
    }
    sqlite3_finalize(s);
    return found;
}

// ─── Users ────────────────────────────────────────────────────────────────────

int Database::createUser(const std::string& username, const std::string& hash, const std::string& salt) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "INSERT INTO users (username, password_hash, salt) VALUES (?,?,?)", -1, &s, nullptr);
    sqlite3_bind_text(s, 1, username.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(s, 2, hash.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_text(s, 3, salt.c_str(),     -1, SQLITE_STATIC);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE ? (int)sqlite3_last_insert_rowid(db) : -1;
}

std::optional<UserRecord> Database::findUser(const std::string& username) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT id, username, password_hash, salt, starting_balance FROM users WHERE username = ?",
        -1, &s, nullptr);
    sqlite3_bind_text(s, 1, username.c_str(), -1, SQLITE_STATIC);
    if (sqlite3_step(s) == SQLITE_ROW) {
        UserRecord u;
        u.id              = sqlite3_column_int(s, 0);
        u.username        = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        u.passwordHash    = reinterpret_cast<const char*>(sqlite3_column_text(s, 2));
        u.salt            = reinterpret_cast<const char*>(sqlite3_column_text(s, 3));
        u.startingBalance = sqlite3_column_double(s, 4);
        sqlite3_finalize(s);
        return u;
    }
    sqlite3_finalize(s);
    return std::nullopt;
}

std::optional<UserRecord> Database::findUserById(int id) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT id, username, password_hash, salt, starting_balance FROM users WHERE id = ?",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    if (sqlite3_step(s) == SQLITE_ROW) {
        UserRecord u;
        u.id              = sqlite3_column_int(s, 0);
        u.username        = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        u.passwordHash    = reinterpret_cast<const char*>(sqlite3_column_text(s, 2));
        u.salt            = reinterpret_cast<const char*>(sqlite3_column_text(s, 3));
        u.startingBalance = sqlite3_column_double(s, 4);
        sqlite3_finalize(s);
        return u;
    }
    sqlite3_finalize(s);
    return std::nullopt;
}

bool Database::updateStartingBalance(int userId, double amount) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "UPDATE users SET starting_balance = ? WHERE id = ?", -1, &s, nullptr);
    sqlite3_bind_double(s, 1, amount);
    sqlite3_bind_int(s,    2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE;
}

double Database::calculateBalance(int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT starting_balance + "
        "  COALESCE((SELECT SUM(amount)     FROM transactions WHERE user_id = ? AND type = 'income'),  0) - "
        "  COALESCE((SELECT SUM(amount)     FROM transactions WHERE user_id = ? AND type = 'expense'), 0) - "
        "  COALESCE((SELECT SUM(amount_due) FROM bills        WHERE user_id = ? AND is_paid = 1),      0) "
        "FROM users WHERE id = ?",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);
    sqlite3_bind_int(s, 2, userId);
    sqlite3_bind_int(s, 3, userId);
    sqlite3_bind_int(s, 4, userId);
    double balance = 0.0;
    if (sqlite3_step(s) == SQLITE_ROW) balance = sqlite3_column_double(s, 0);
    sqlite3_finalize(s);
    return balance;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

int Database::addTransaction(int userId, const std::string& date, const std::string& category,
                              double amount, const std::string& notes, const std::string& type) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "INSERT INTO transactions (user_id, date, category, amount, notes, type) VALUES (?,?,?,?,?,?)",
        -1, &s, nullptr);
    sqlite3_bind_int(s,    1, userId);
    sqlite3_bind_text(s,   2, date.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   3, category.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(s, 4, amount);
    sqlite3_bind_text(s,   5, notes.c_str(),    -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   6, type.c_str(),     -1, SQLITE_STATIC);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE ? (int)sqlite3_last_insert_rowid(db) : -1;
}

std::vector<TransactionRecord> Database::getTransactions(int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT id, date, category, amount, notes, type, created_at "
        "FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);

    std::vector<TransactionRecord> out;
    while (sqlite3_step(s) == SQLITE_ROW) {
        TransactionRecord t;
        t.id        = sqlite3_column_int(s, 0);
        t.date      = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        t.category  = reinterpret_cast<const char*>(sqlite3_column_text(s, 2));
        t.amount    = sqlite3_column_double(s, 3);
        auto* n     = sqlite3_column_text(s, 4);
        t.notes     = n ? reinterpret_cast<const char*>(n) : "";
        t.type      = reinterpret_cast<const char*>(sqlite3_column_text(s, 5));
        t.createdAt = reinterpret_cast<const char*>(sqlite3_column_text(s, 6));
        out.push_back(t);
    }
    sqlite3_finalize(s);
    return out;
}

std::optional<TransactionRecord> Database::getTransaction(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT id, date, category, amount, notes, type, created_at "
        "FROM transactions WHERE id = ? AND user_id = ?",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    if (sqlite3_step(s) == SQLITE_ROW) {
        TransactionRecord t;
        t.id        = sqlite3_column_int(s, 0);
        t.date      = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        t.category  = reinterpret_cast<const char*>(sqlite3_column_text(s, 2));
        t.amount    = sqlite3_column_double(s, 3);
        auto* n     = sqlite3_column_text(s, 4);
        t.notes     = n ? reinterpret_cast<const char*>(n) : "";
        t.type      = reinterpret_cast<const char*>(sqlite3_column_text(s, 5));
        t.createdAt = reinterpret_cast<const char*>(sqlite3_column_text(s, 6));
        sqlite3_finalize(s);
        return t;
    }
    sqlite3_finalize(s);
    return std::nullopt;
}

bool Database::updateTransaction(int id, int userId, const std::string& date,
                                  const std::string& category, double amount,
                                  const std::string& notes, const std::string& type) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "UPDATE transactions SET date=?, category=?, amount=?, notes=?, type=? "
        "WHERE id=? AND user_id=?",
        -1, &s, nullptr);
    sqlite3_bind_text(s,   1, date.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   2, category.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(s, 3, amount);
    sqlite3_bind_text(s,   4, notes.c_str(),    -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   5, type.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_int(s,    6, id);
    sqlite3_bind_int(s,    7, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

bool Database::deleteTransaction(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "DELETE FROM transactions WHERE id = ? AND user_id = ?", -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

double Database::sumTransactions(int userId, const std::string& type, bool monthOnly) {
    std::string sql = "SELECT COALESCE(SUM(amount), 0) FROM transactions "
                      "WHERE user_id = ? AND type = ?";
    if (monthOnly) sql += " AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')";

    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, sql.c_str(), -1, &s, nullptr);
    sqlite3_bind_int(s,  1, userId);
    sqlite3_bind_text(s, 2, type.c_str(), -1, SQLITE_STATIC);
    double total = 0.0;
    if (sqlite3_step(s) == SQLITE_ROW) total = sqlite3_column_double(s, 0);
    sqlite3_finalize(s);
    return total;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

int Database::addBill(int userId, const std::string& name, const std::string& category,
                       double amountDue, const std::string& dueDate) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "INSERT INTO bills (user_id, name, category, amount_due, due_date) VALUES (?,?,?,?,?)",
        -1, &s, nullptr);
    sqlite3_bind_int(s,    1, userId);
    sqlite3_bind_text(s,   2, name.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   3, category.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(s, 4, amountDue);
    sqlite3_bind_text(s,   5, dueDate.c_str(),  -1, SQLITE_STATIC);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE ? (int)sqlite3_last_insert_rowid(db) : -1;
}

std::vector<BillRecord> Database::getBills(int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT id, name, category, amount_due, due_date, is_paid "
        "FROM bills WHERE user_id = ? ORDER BY due_date ASC",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);

    std::vector<BillRecord> out;
    while (sqlite3_step(s) == SQLITE_ROW) {
        BillRecord b;
        b.id        = sqlite3_column_int(s, 0);
        b.name      = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        b.category  = reinterpret_cast<const char*>(sqlite3_column_text(s, 2));
        b.amountDue = sqlite3_column_double(s, 3);
        b.dueDate   = reinterpret_cast<const char*>(sqlite3_column_text(s, 4));
        b.isPaid    = sqlite3_column_int(s, 5) != 0;
        out.push_back(b);
    }
    sqlite3_finalize(s);
    return out;
}

bool Database::updateBill(int id, int userId, const std::string& name,
                           const std::string& category,
                           double amountDue, const std::string& dueDate) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "UPDATE bills SET name=?, category=?, amount_due=?, due_date=? "
        "WHERE id=? AND user_id=?",
        -1, &s, nullptr);
    sqlite3_bind_text(s,   1, name.c_str(),     -1, SQLITE_STATIC);
    sqlite3_bind_text(s,   2, category.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(s, 3, amountDue);
    sqlite3_bind_text(s,   4, dueDate.c_str(),  -1, SQLITE_STATIC);
    sqlite3_bind_int(s,    5, id);
    sqlite3_bind_int(s,    6, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

bool Database::payBill(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "UPDATE bills SET is_paid = 1 WHERE id = ? AND user_id = ?", -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

bool Database::unpayBill(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "UPDATE bills SET is_paid = 0 WHERE id = ? AND user_id = ?", -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

bool Database::deleteBill(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "DELETE FROM bills WHERE id = ? AND user_id = ?", -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}

double Database::sumPaidBills(int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT COALESCE(SUM(amount_due), 0) FROM bills WHERE user_id = ? AND is_paid = 1",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);
    double total = 0.0;
    if (sqlite3_step(s) == SQLITE_ROW) total = sqlite3_column_double(s, 0);
    sqlite3_finalize(s);
    return total;
}

// ─── Summary & Budgets ────────────────────────────────────────────────────────

std::vector<CategorySummary> Database::getCategorySummary(int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT category, SUM(amount) FROM transactions "
        "WHERE user_id = ? AND type = 'expense' "
        "AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now') "
        "GROUP BY category ORDER BY SUM(amount) DESC",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);

    std::vector<CategorySummary> out;
    while (sqlite3_step(s) == SQLITE_ROW) {
        CategorySummary c;
        c.category = reinterpret_cast<const char*>(sqlite3_column_text(s, 0));
        c.total    = sqlite3_column_double(s, 1);
        out.push_back(c);
    }
    sqlite3_finalize(s);
    return out;
}

bool Database::setBudget(int userId, const std::string& category,
                          double limit, const std::string& period) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "INSERT INTO budgets (user_id, category, monthly_limit, period) VALUES (?,?,?,?) "
        "ON CONFLICT(user_id, category) DO UPDATE SET "
        "  monthly_limit = excluded.monthly_limit, "
        "  period        = excluded.period",
        -1, &s, nullptr);
    sqlite3_bind_int(s,    1, userId);
    sqlite3_bind_text(s,   2, category.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(s, 3, limit);
    sqlite3_bind_text(s,   4, period.c_str(),   -1, SQLITE_STATIC);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE;
}

std::vector<BudgetRecord> Database::getBudgets(int userId) {
    // "Spent" is computed in the budget's own period window.
    // Weekly uses ISO week (%Y-%W); monthly uses %Y-%m. Both compare to "now".
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db,
        "SELECT b.id, b.category, b.monthly_limit, b.period, "
        "  COALESCE(("
        "    SELECT SUM(t.amount) FROM transactions t "
        "    WHERE t.user_id = b.user_id AND t.category = b.category "
        "      AND t.type = 'expense' "
        "      AND CASE b.period "
        "            WHEN 'weekly' THEN strftime('%Y-%W', t.date) = strftime('%Y-%W', 'now') "
        "            ELSE                strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now') "
        "          END"
        "  ), 0) "
        "FROM budgets b WHERE b.user_id = ? ORDER BY b.category",
        -1, &s, nullptr);
    sqlite3_bind_int(s, 1, userId);

    std::vector<BudgetRecord> out;
    while (sqlite3_step(s) == SQLITE_ROW) {
        BudgetRecord br;
        br.id           = sqlite3_column_int(s, 0);
        br.category     = reinterpret_cast<const char*>(sqlite3_column_text(s, 1));
        br.monthlyLimit = sqlite3_column_double(s, 2);
        br.period       = reinterpret_cast<const char*>(sqlite3_column_text(s, 3));
        br.spent        = sqlite3_column_double(s, 4);
        out.push_back(br);
    }
    sqlite3_finalize(s);
    return out;
}

bool Database::deleteBudget(int id, int userId) {
    sqlite3_stmt* s;
    sqlite3_prepare_v2(db, "DELETE FROM budgets WHERE id = ? AND user_id = ?", -1, &s, nullptr);
    sqlite3_bind_int(s, 1, id);
    sqlite3_bind_int(s, 2, userId);
    int rc = sqlite3_step(s);
    sqlite3_finalize(s);
    return rc == SQLITE_DONE && sqlite3_changes(db) > 0;
}
