cmake_minimum_required(VERSION 3.16)
project(ExpenseX CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# sqlite3 ships as a plain C amalgamation — compile it as C, not C++.
add_library(sqlite3_lib STATIC src/libs/sqlite3.c)
target_include_directories(sqlite3_lib PUBLIC src/libs)

add_executable(expensex
    src/main.cpp
    src/database.cpp
    src/auth.cpp
)

target_include_directories(expensex PRIVATE src)
target_link_libraries(expensex PRIVATE sqlite3_lib)

# Windows requires Winsock for cpp-httplib.
if(WIN32)
    target_link_libraries(expensex PRIVATE ws2_32)
    target_compile_definitions(expensex PRIVATE
        WIN32_LEAN_AND_MEAN
        _WIN32_WINNT=0x0A00   # Windows 10+
    )
endif()

# Run the binary from the project root so ./frontend is reachable.
set_target_properties(expensex PROPERTIES
    VS_DEBUGGER_WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
    RUNTIME_OUTPUT_DIRECTORY      "${CMAKE_SOURCE_DIR}"
)
