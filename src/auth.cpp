#include "auth.h"
#include "sha256.h"
#include <iomanip>
#include <random>
#include <sstream>

std::string AuthManager::randomHex(int bytes) {
    std::random_device rd;
    std::mt19937_64    gen(rd());
    std::uniform_int_distribution<uint64_t> dis;
    std::ostringstream oss;
    // each uint64 gives 16 hex chars = 8 bytes
    for (int i = 0; i < bytes / 8; ++i)
        oss << std::hex << std::setw(16) << std::setfill('0') << dis(gen);
    return oss.str();
}

std::string AuthManager::createSession(int userId) {
    auto token = randomHex(32);
    std::lock_guard<std::mutex> lock(mtx_);
    sessions_[token] = userId;
    return token;
}

void AuthManager::removeSession(const std::string& token) {
    std::lock_guard<std::mutex> lock(mtx_);
    sessions_.erase(token);
}

std::optional<int> AuthManager::validateToken(const std::string& token) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = sessions_.find(token);
    if (it == sessions_.end()) return std::nullopt;
    return it->second;
}

std::string AuthManager::newSalt() { return randomHex(16); }

std::string AuthManager::hashPassword(const std::string& password, const std::string& salt) {
    return SHA256::hash(password + salt);
}

bool AuthManager::verifyPassword(const std::string& password,
                                  const std::string& hash,
                                  const std::string& salt) {
    return hashPassword(password, salt) == hash;
}
