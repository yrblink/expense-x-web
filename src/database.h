#pragma once
#include "libs/sqlite3.h"
#include <optional>
#include <string>
#include <vector>

struct UserRecord {
    int         id;
    std::string username;
    std::string passwordHash;
    std::string salt;
    double      startingBalance;
};

struct TransactionRecord {
    int         id;
    std::string date;
    std::string category;
    double      amount;
    std::string notes;
    std::string type;        // "expense" or "income"
    std::string createdAt;
};

struct BillRecord {
    int         id;
    std::string name;
    std::string category;
    double      amountDue;
    std::string dueDate;
    bool        isPaid;
};

struct CategorySummary {
    std::string category;
    double      total;
};

struct BudgetRecord {
    int         id;
    std::string category;
    double      monthlyLimit;
    double      spent;
};

class Database {
    sqlite3* db = nullptr;

    bool exec(const char* sql);
    bool columnExists(const char* table, const char* column);

public:
    explicit Database(const std::string& path);
    ~Database();

    // Users
    int                        createUser(const std::string& username,
                                          const std::string& hash,
                                          const std::string& salt);
    std::optional<UserRecord>  findUser(const std::string& username);
    std::optional<UserRecord>  findUserById(int id);
    bool                       updateStartingBalance(int userId, double amount);

    // Balance is always derived: starting + income - expenses - paid bills.
    double                     calculateBalance(int userId);

    // Transactions
    int                              addTransaction(int userId, const std::string& date,
                                                    const std::string& category,
                                                    double amount, const std::string& notes,
                                                    const std::string& type);
    std::vector<TransactionRecord>   getTransactions(int userId);
    std::optional<TransactionRecord> getTransaction(int id, int userId);
    bool                             deleteTransaction(int id, int userId);

    // Aggregated sums by transaction type.
    double  sumTransactions(int userId, const std::string& type, bool monthOnly);

    // Bills
    int                       addBill(int userId, const std::string& name,
                                      const std::string& category,
                                      double amountDue, const std::string& dueDate);
    std::vector<BillRecord>   getBills(int userId);
    bool                      payBill(int id, int userId);
    bool                      unpayBill(int id, int userId);
    bool                      deleteBill(int id, int userId);
    double                    sumPaidBills(int userId);

    // Summary & Budgets
    std::vector<CategorySummary>  getCategorySummary(int userId);
    bool                          setBudget(int userId, const std::string& category, double limit);
    std::vector<BudgetRecord>     getBudgets(int userId);
    bool                          deleteBudget(int id, int userId);
};
