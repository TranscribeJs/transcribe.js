# Hey!
# I've actually never used CMake before, so I'm not sure if this is the right way to do it.
# It compiles to wasm on my machine (intel mac), but I'm pretty sure it will not compile on other machines.
# If you have any suggestions, please let me know!

cmake_minimum_required (VERSION 3.5)

project(Shout.wasm)
add_subdirectory(whisper.cpp)

set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -pthread -s TOTAL_STACK=5242880")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -pthread -s TOTAL_STACK=5242880")


# from: whisper.cpp/examples/CMakeLists.txt
# most parts are not needed right now, but maybe in the future

# dependencies

find_package(Threads REQUIRED)

# third-party

if (WHISPER_SDL2)
    # SDL2
    find_package(SDL2 REQUIRED)

    string(STRIP "${SDL2_LIBRARIES}" SDL2_LIBRARIES)

    message(STATUS "SDL2_INCLUDE_DIRS = ${SDL2_INCLUDE_DIRS}")
    message(STATUS "SDL2_LIBRARIES = ${SDL2_LIBRARIES}")
endif()

if (WHISPER_CLBLAST)
    find_package(CLBlast REQUIRED)
endif()

# common

set(TARGET common)

add_library(${TARGET} STATIC
    whisper.cpp/examples/common.h
    whisper.cpp/examples/common.cpp
    whisper.cpp/examples/common-ggml.h
    whisper.cpp/examples/common-ggml.cpp
    whisper.cpp/examples/grammar-parser.cpp
    )

# include(DefaultTargetOptions)
include(whisper.cpp/cmake/DefaultTargetOptions.cmake)

target_link_libraries(${TARGET} PRIVATE whisper)

set_target_properties(${TARGET} PROPERTIES POSITION_INDEPENDENT_CODE ON)

if (WHISPER_SDL2)
    # common-sdl

    set(TARGET common-sdl)

    add_library(${TARGET} STATIC
        whisper.cpp/examples/common-sdl.h
        whisper.cpp/examples/common-sdl.cpp
        )

    # include(DefaultTargetOptions)
    include(whisper.cpp/cmake/DefaultTargetOptions.cmake)

    target_include_directories(${TARGET} PUBLIC ${SDL2_INCLUDE_DIRS})
    target_link_libraries(${TARGET} PRIVATE ${SDL2_LIBRARIES})

    set_target_properties(${TARGET} PROPERTIES POSITION_INDEPENDENT_CODE ON)
endif()

# add json lib
add_library(json_cpp INTERFACE whisper.cpp/examples/json.hpp)

# library to compile
add_subdirectory(src)