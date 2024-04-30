#!/bin/bash

cp -rpv ../ggml/src/ggml.c              ./ggml.c
cp -rpv ../ggml/src/ggml-impl.h         ./ggml-impl.h
cp -rpv ../ggml/src/ggml-alloc.c        ./ggml-alloc.c
cp -rpv ../ggml/src/ggml-backend-impl.h ./ggml-backend-impl.h
cp -rpv ../ggml/src/ggml-backend.c      ./ggml-backend.c
cp -rpv ../ggml/src/ggml-common.h       ./ggml-common.h
cp -rpv ../ggml/src/ggml-cuda/*         ./ggml-cuda/
cp -rpv ../ggml/src/ggml-cuda.cu        ./ggml-cuda.cu
cp -rpv ../ggml/src/ggml-cuda.h         ./ggml-cuda.h
cp -rpv ../ggml/src/ggml-kompute.cpp    ./ggml-kompute.cpp
cp -rpv ../ggml/src/ggml-kompute.h      ./ggml-kompute.h
cp -rpv ../ggml/src/ggml-metal.h        ./ggml-metal.h
cp -rpv ../ggml/src/ggml-metal.m        ./ggml-metal.m
cp -rpv ../ggml/src/ggml-metal.metal    ./ggml-metal.metal
#cp -rpv ../ggml/src/ggml-mpi.h          ./ggml-mpi.h
#cp -rpv ../ggml/src/ggml-mpi.c          ./ggml-mpi.c
cp -rpv ../ggml/src/ggml-opencl.cpp     ./ggml-opencl.cpp
cp -rpv ../ggml/src/ggml-opencl.h       ./ggml-opencl.h
cp -rpv ../ggml/src/ggml-quants.c       ./ggml-quants.c
cp -rpv ../ggml/src/ggml-quants.h       ./ggml-quants.h
cp -rpv ../ggml/src/ggml-sycl.cpp       ./ggml-sycl.cpp
cp -rpv ../ggml/src/ggml-sycl.h         ./ggml-sycl.h
cp -rpv ../ggml/src/ggml-vulkan.cpp     ./ggml-vulkan.cpp
cp -rpv ../ggml/src/ggml-vulkan.h       ./ggml-vulkan.h

cp -rpv ../ggml/include/ggml/ggml.h         ./ggml.h
cp -rpv ../ggml/include/ggml/ggml-alloc.h   ./ggml-alloc.h
cp -rpv ../ggml/include/ggml/ggml-backend.h ./ggml-backend.h

cp -rpv ../ggml/examples/common.h                   ./examples/common.h
cp -rpv ../ggml/examples/common.cpp                 ./examples/common.cpp
cp -rpv ../ggml/examples/common-ggml.h              ./examples/common-ggml.h
cp -rpv ../ggml/examples/common-ggml.cpp            ./examples/common-ggml.cpp
cp -rpv ../ggml/examples/whisper/grammar-parser.h   ./examples/grammar-parser.h
cp -rpv ../ggml/examples/whisper/grammar-parser.cpp ./examples/grammar-parser.cpp

cp -rpv ../ggml/examples/whisper/whisper.h    ./whisper.h
cp -rpv ../ggml/examples/whisper/whisper.cpp  ./whisper.cpp
cp -rpv ../ggml/examples/whisper/main.cpp     ./examples/main/main.cpp
cp -rpv ../ggml/examples/whisper/quantize.cpp ./examples/quantize/quantize.cpp

cp -rpv ../LICENSE                     ./LICENSE
cp -rpv ../ggml/scripts/gen-authors.sh ./scripts/gen-authors.sh
