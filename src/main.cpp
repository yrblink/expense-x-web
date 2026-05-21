#ifdef _WIN32
  #define WIN32_LEAN_AND_MEAN
  #ifndef _WIN32_WINNT
    #define _WIN32_WINNT 0x0A00
  #endif
#endif

#include "libs/httplib.h"
#include "libs/json.hpp"
#include "database.h"
#include "auth.h"
#include <iostream>

using json = nlohmann::json;

// Pull authenticated user ID from "Authorization: Bearer <token>" header.
static std::optional<int> authedUser(const httplib::Request& req, AuthManager& auth) {
    auto it = req.headers.find("Authorization");
    if (it == req.headers.end()) return std::nullopt;
    const auto& h = it->second;
    if (h.size() < 8 || h.substr(0, 7) != "Bearer ") return std::nullopt;
    return auth.validateToken(h.substr(7));
}

static void send(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

int main() {
    Database    db("expensex.db");
    AuthManager auth;
    httplib::Server svr;

    // Add CORS headers to every response so the browser frontend can call the API.
    svr.set_default_headers({
        {"Access-Control-Allow-Origin",  "*"},
        {"Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"},
        {"Access-Control-Allow-Headers", "Content-Type, Authorization"}
    });
    svr.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        res.status = 204;
    });

    // ── Auth ─────────────────────────────────────────────────────────────────

    svr.Post("/api/register", [&](const httplib::Request& req, httplib::Response& res) {
        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.contains("username") || !body.contains("password"))
            return send(res, 400, {{"error", "username and password required"}});

        std::string username = body["username"].get<std::string>();
        std::string password = body["password"].get<std::string>();

        if (username.size() < 3)
            return send(res, 400, {{"error", "Username must be at least 3 characters"}});
        if (password.size() < 8)
            return send(res, 400, {{"error", "Password must be at least 8 characters"}});

        auto salt  = AuthManager::newSalt();
        auto hash  = AuthManager::hashPassword(password, salt);
        int  uid   = db.createUser(username, hash, salt);
        if (uid < 0)
            return send(res, 409, {{"error", "Username already taken"}});

        auto token = auth.createSession(uid);
        send(res, 201, {{"token", token}, {"userId", uid}, {"username", username}, {"balance", 0.0}});
    });

    svr.Post("/api/login", [&](const httplib::Request& req, httplib::Response& res) {
        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.contains("username") || !body.contains("password"))
            return send(res, 400, {{"error", "username and password required"}});

        auto user = db.findUser(body["username"].get<std::string>());
        if (!user)
            return send(res, 401, {{"error", "Invalid credentials"}});
        if (!AuthManager::verifyPassword(body["password"].get<std::string>(),
                                          user->passwordHash, user->salt))
            return send(res, 401, {{"error", "Invalid credentials"}});

        auto token = auth.createSession(user->id);
        send(res, 200, {{"token", token}, {"userId", user->id},
                        {"username", user->username}, {"balance", user->balance}});
    });

    svr.Post("/api/logout", [&](const httplib::Request& req, httplib::Response& res) {
        auto it = req.headers.find("Authorization");
        if (it != req.headers.end() && it->second.size() > 7)
            auth.removeSession(it->second.substr(7));
        send(res, 200, {{"ok", true}});
    });

    // ── User ─────────────────────────────────────────────────────────────────

    svr.Get("/api/user", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto user = db.findUserById(*uid);
        if (!user) return send(res, 404, {{"error", "User not found"}});
        send(res, 200, {{"username", user->username}, {"balance", user->balance}});
    });

    svr.Put("/api/user/balance", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.contains("balance"))
            return send(res, 400, {{"error", "balance required"}});

        double bal = body["balance"].get<double>();
        if (bal < 0) return send(res, 400, {{"error", "Balance cannot be negative"}});

        db.updateBalance(*uid, bal);
        send(res, 200, {{"balance", bal}});
    });

    // ── Transactions ─────────────────────────────────────────────────────────

    svr.Get("/api/transactions", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto rows = db.getTransactions(*uid);
        json arr  = json::array();
        for (auto& t : rows)
            arr.push_back({{"id",t.id},{"date",t.date},{"category",t.category},
                           {"amount",t.amount},{"notes",t.notes}});
        send(res, 200, arr);
    });

    svr.Post("/api/transactions", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() ||
            !body.contains("date") || !body.contains("category") || !body.contains("amount"))
            return send(res, 400, {{"error", "date, category, and amount required"}});

        std::string notes = body.value("notes", "");
        int id = db.addTransaction(*uid,
                                   body["date"].get<std::string>(),
                                   body["category"].get<std::string>(),
                                   body["amount"].get<double>(),
                                   notes);
        if (id < 0) return send(res, 500, {{"error", "Failed to save transaction"}});
        send(res, 201, {{"id", id}});
    });

    svr.Delete("/api/transactions/(\\d+)", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        int txId = std::stoi(req.matches[1]);
        if (!db.deleteTransaction(txId, *uid))
            return send(res, 404, {{"error", "Transaction not found"}});
        send(res, 200, {{"ok", true}});
    });

    // ── Bills ─────────────────────────────────────────────────────────────────

    svr.Get("/api/bills", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto rows = db.getBills(*uid);
        json arr  = json::array();
        for (auto& b : rows)
            arr.push_back({{"id",b.id},{"name",b.name},{"category",b.category},
                           {"amountDue",b.amountDue},{"dueDate",b.dueDate},
                           {"isPaid",b.isPaid}});
        send(res, 200, arr);
    });

    svr.Post("/api/bills", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() ||
            !body.contains("name") || !body.contains("category") ||
            !body.contains("amountDue") || !body.contains("dueDate"))
            return send(res, 400, {{"error", "name, category, amountDue, dueDate required"}});

        int id = db.addBill(*uid,
                            body["name"].get<std::string>(),
                            body["category"].get<std::string>(),
                            body["amountDue"].get<double>(),
                            body["dueDate"].get<std::string>());
        if (id < 0) return send(res, 500, {{"error", "Failed to save bill"}});
        send(res, 201, {{"id", id}});
    });

    svr.Put("/api/bills/(\\d+)/pay", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        int billId = std::stoi(req.matches[1]);
        if (!db.payBill(billId, *uid))
            return send(res, 404, {{"error", "Bill not found"}});
        send(res, 200, {{"ok", true}});
    });

    svr.Delete("/api/bills/(\\d+)", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        int billId = std::stoi(req.matches[1]);
        if (!db.deleteBill(billId, *uid))
            return send(res, 404, {{"error", "Bill not found"}});
        send(res, 200, {{"ok", true}});
    });

    // ── Summary ───────────────────────────────────────────────────────────────

    svr.Get("/api/summary", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto user       = db.findUserById(*uid);
        auto categories = db.getCategorySummary(*uid);
        auto bills      = db.getBills(*uid);

        double totalSpent = 0;
        for (auto& c : categories) totalSpent += c.total;

        double billsDue = 0;
        for (auto& b : bills) if (!b.isPaid) billsDue += b.amountDue;

        json catArr = json::array();
        for (auto& c : categories)
            catArr.push_back({{"category", c.category}, {"total", c.total}});

        double balance = user ? user->balance : 0.0;
        send(res, 200, {
            {"balance",           balance},
            {"totalSpent",        totalSpent},
            {"billsDue",          billsDue},
            {"balanceAfterBills", balance - billsDue},
            {"byCategory",        catArr}
        });
    });

    // ── Budgets ───────────────────────────────────────────────────────────────

    svr.Get("/api/budgets", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto rows = db.getBudgets(*uid);
        json arr  = json::array();
        for (auto& br : rows)
            arr.push_back({{"id",br.id},{"category",br.category},
                           {"monthlyLimit",br.monthlyLimit},{"spent",br.spent}});
        send(res, 200, arr);
    });

    svr.Post("/api/budgets", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        auto body = json::parse(req.body, nullptr, false);
        if (body.is_discarded() || !body.contains("category") || !body.contains("monthlyLimit"))
            return send(res, 400, {{"error", "category and monthlyLimit required"}});

        bool ok = db.setBudget(*uid,
                               body["category"].get<std::string>(),
                               body["monthlyLimit"].get<double>());
        send(res, ok ? 200 : 500, ok ? json{{"ok", true}} : json{{"error", "Failed"}});
    });

    svr.Delete("/api/budgets/(\\d+)", [&](const httplib::Request& req, httplib::Response& res) {
        auto uid = authedUser(req, auth);
        if (!uid) return send(res, 401, {{"error", "Unauthorized"}});

        int budgetId = std::stoi(req.matches[1]);
        if (!db.deleteBudget(budgetId, *uid))
            return send(res, 404, {{"error", "Budget not found"}});
        send(res, 200, {{"ok", true}});
    });

    // ── Static frontend files ─────────────────────────────────────────────────
    if (!svr.set_mount_point("/", "./frontend")) {
        std::cerr << "Could not mount ./frontend — make sure you run from the project root.\n";
        return 1;
    }

    std::cout << "ExpenseX is running at http://localhost:8080\n";
    svr.listen("0.0.0.0", 8080);
    return 0;
}
