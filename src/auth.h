#pragma once
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

class AuthManager {
    std::unordered_map<std::string, int> sessions_;
    std::mutex mtx_;

    static std::string randomHex(int bytes);

public:
    std::string           createSession(int userId);
    void                  removeSession(const std::string& token);
    std::optional<int>    validateToken(const std::string& token);

    static std::string newSalt();
    static std::string hashPassword(const std::string& password, const std::string& salt);
    static bool        verifyPassword(const std::string& password,
                                      const std::string& hash,
                                      const std::string& salt);
};
