# from whisper.cpp/examples/whisper.wasm/CMakeLists.txt
set(TARGET shout.wasm)


add_executable(${TARGET}
    shout.wasm.cpp
    )

# include(DefaultTargetOptions)
include(${CMAKE_CURRENT_SOURCE_DIR}/../whisper.cpp/cmake/DefaultTargetOptions.cmake)

target_link_libraries(${TARGET} PRIVATE
    whisper
    )

target_compile_features(${TARGET} PRIVATE cxx_std_17)

unset(EXTRA_FLAGS)

if (WHISPER_WASM_SINGLE_FILE)
    set(EXTRA_FLAGS "-s SINGLE_FILE=1")
    message(STATUS "Embedding transcribe.wasm inside transcribe.wasm.js")
endif()

if (NO_SIMD)
    # remove -msimd128 set in whisper.cpp/ggml/src/ggml-cpu/CMakeList.txt:344 to disable SIMD
    set_target_properties(ggml-cpu PROPERTIES COMPILE_FLAGS "")
endif()

set_target_properties(${TARGET} PROPERTIES LINK_FLAGS " \
    --bind \
    -s USE_PTHREADS=1 \
    -s PTHREAD_POOL_SIZE_STRICT=0 \
    -s INITIAL_MEMORY=512MB \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s FORCE_FILESYSTEM=1 \
    -s EXPORTED_RUNTIME_METHODS=\"['out', 'err', 'ccall', 'cwrap', 'HEAPU8']\" \
    -s EXPORTED_FUNCTIONS=\"['_malloc', '_free']\" \
    -s ENVIRONMENT='web,webview,worker' \
    -s EXPORT_ES6=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=\"createModule\" \
    ${EXTRA_FLAGS} \
    ")
