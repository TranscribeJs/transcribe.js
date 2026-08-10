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

if (GGML_WEBGPU)
    # Compile directly to the final filename so Emscripten bakes the correct
    # worker script URL into the JS (pthread workers load the file by name).
    set_target_properties(${TARGET} PROPERTIES OUTPUT_NAME "shout.wasm_webgpu")
    # Signal to shout.wasm.cpp that this is a GPU-enabled build.
    target_compile_definitions(${TARGET} PRIVATE SHOUT_USE_WEBGPU)
    # Asyncify (added by ggml-webgpu) needs a much larger stack than the
    # default 4 KB to handle whisper.cpp's deep call chains during inference.
    # Without this, Asyncify silently overflows into adjacent heap memory and
    # causes a hang.  64 KB is a safe margin for the full encoder+decoder path.
    target_link_options(${TARGET} PRIVATE "-sASYNCIFY_STACK_SIZE=65536")
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
    -s DYNAMIC_EXECUTION=0 \
    ${EXTRA_FLAGS} \
    ")
