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
    double      balance;
};

struct TransactionRecord {
    int         id;
    std::string date;
    std::string category;
    double      amount;
    std::string notes;
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

public:
    explicit Database(const std::string& path);
    ~Database();

    // Users
    int                        createUser(const std::string& username,
                                          const std::string& hash,
                                          const std::string& salt);
    std::optional<UserRecord>  findUser(const std::string& username);
    std::optional<UserRecord>  findUserById(int id);
    bool                       updateBalance(int userId, double balance);

    // Transactions
    int                              addTransaction(int userId, const std::string& date,
                                                    const std::string& category,
                                                    double amount, const std::string& notes);
    std::vector<TransactionRecord>   getTransactions(int userId);
    bool                             deleteTransaction(int id, int userId);

    // Bills
    int                       addBill(int userId, const std::string& name,
                                      const std::string& category,
                                      double amountDue, const std::string& dueDate);
    std::vector<BillRecord>   getBills(int userId);
    bool                      payBill(int id, int userId);
    bool                      deleteBill(int id, int userId);

    // Summary & Budgets
    std::vector<CategorySummary>  getCategorySummary(int userId);
    bool                          setBudget(int userId, const std::string& category, double limit);
    std::vector<BudgetRecord>     getBudgets(int userId);
    bool                          deleteBudget(int id, int userId);
};
