[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# PyTorch GPU Workloads + Datalayer Client Example

This example demonstrates how to leverage GPU acceleration for computationally intensive PyTorch workloads using the Datalayer Client, showcasing significant performance improvements over CPU-only execution.

## Overview

This example showcases:

- **GPU Acceleration**: High-performance computing workloads utilizing CUDA-enabled GPUs
- **Datalayer Client**: Integration with Datalayer's runtime environment for AI workloads
- **Performance Benchmarking**: Side-by-side comparison of CPU vs GPU execution times
- **PyTorch Integration**: Optimized matrix operations and tensor computations
- **Heavy Workload Processing**: Large-scale matrix multiplications demonstrating GPU advantages

## Features

- ✅ Execute compute-intensive PyTorch operations on GPU and CPU
- ✅ Benchmark and compare performance between CPU and GPU execution
- ✅ Demonstrate significant speedup with GPU acceleration (typically 10-100x faster)
- ✅ Reproducible results with deterministic operations
- ✅ CUDA synchronization for accurate GPU timing measurements

## Prerequisites

- Python 3.9+
- Datalayer Client
- Environment access to Datalayer platform

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/datalayer/core.git
   cd core/examples/pytorch
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Quick Start

**Run the GPU vs CPU benchmark**:

```bash
python main.py
```

This will execute two comprehensive benchmarks on both CPU and GPU (if available), displaying:

- **Matrix Multiplication**: Large-scale linear algebra operations
- **Convolution Operations**: Deep learning CNN-style computations
- Execution times for both devices and operations
- Individual and average speedup factors (GPU vs CPU)

## Benchmark Results

The example performs two types of heavy computations and compares execution times:

- Large matrix multiplications (10,000x10,000 by default): Measures the performance of multiplying two large matrices, a common operation in scientific computing and machine learning.
- Convolution Benchmark. Deep learning-style 2D convolutions (48 batch size, 180 channels, 640x640 images):

Running the `main.py` scripts results in the following example output:

```bash
PyTorch CPU vs GPU Benchmark
============================

1. Matrix Multiplication Benchmark
-----------------------------------

Running on: cpu

Matrix size: 10000x10000
Execution time: 2.5394 seconds

Running on: cuda

Matrix size: 10000x10000
Execution time: 0.1122 seconds



Matrix Multiplication Speedup: 22.63x faster on GPU


2. Convolution Benchmark
------------------------

Running convolution benchmark on: cpu

Input tensor shape: torch.Size([48, 180, 640, 640])
Output tensor shape: torch.Size([48, 180, 640, 640])
Execution time: 34.7170 seconds

Running convolution benchmark on: cuda

Input tensor shape: torch.Size([48, 180, 640, 640])
Output tensor shape: torch.Size([48, 180, 640, 640])
Execution time: 0.4160 seconds



Convolution Speedup: 83.44x faster on GPU

==================================================
BENCHMARK SUMMARY
==================================================
Matrix Multiplication: 22.63x speedup
Convolution Operations: 83.44x speedup
Average GPU Speedup: 53.04x
```

## Project Structure

```
pytorch/
├── requirements.txt      # Python dependencies (torch)
├── README.md             # This file
├── main.py               # Main benchmark execution script
└── benchmark.py          # Core benchmarking functions
```

## Understanding the Benchmarks

The example includes two comprehensive benchmarks:

### Matrix Multiplication Benchmark

1. **Matrix Generation**: Creates large random matrices (10,000x10,000)
2. **Device Allocation**: Moves tensors to CPU or GPU memory
3. **Warm-up**: Ensures GPU is ready for accurate timing
4. **Matrix Multiplication**: Executes computationally expensive `torch.matmul()`
5. **Synchronization**: Ensures GPU operations complete before timing

### Convolution Benchmark

1. **Tensor Creation**: Generates large 4D tensors (batch_size=48, channels=180, height=640, width=640)
2. **CNN Layer Setup**: Creates convolutional layers with 3x3 kernels
3. **Memory Transfer**: Moves tensors and models to target device
4. **Convolution Operations**: Performs two sequential 2D convolution operations
5. **GPU Synchronization**: Ensures accurate timing measurements

## Use Cases

This example is ideal for:

- **Deep Learning Training**: Accelerating neural network training workflows
- **Scientific Computing**: Large-scale numerical computations
- **Data Processing**: High-throughput tensor operations
- **Performance Optimization**: Identifying GPU acceleration opportunities
- **Benchmarking**: Evaluating hardware performance for AI workloads

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Documentation**: [Datalayer Platform Documentation](https://datalayer.ai/docs/)
- **Issues**: [GitHub Issues](https://github.com/datalayer/core/issues)
- **Community**: [Datalayer Platform](https://datalayer.app/)

---

<p align="center">
  <strong>🚀 AI Agents for Data Analysis</strong><br></br>
  <a href="https://datalayer.app/">Get started with Datalayer today!</a>
</p>
