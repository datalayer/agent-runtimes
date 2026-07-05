"""PyTorch GPU vs CPU benchmark example using the Datalayer Client."""
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from pathlib import Path

from dotenv import load_dotenv

from agent_runtimes.client import RuntimeClient

load_dotenv()


HERE = Path(__file__).parent


print("\n\nPyTorch CPU vs GPU Benchmark")
print("=" * 28)

client = RuntimeClient()

with client.create_runtime(name="pytorch-benchmark", environment="ai-env") as runtime:
    runtime.execute_file(HERE / "benchmark.py")

    # Matrix multiplication benchmark
    print("\n1. Matrix Multiplication Benchmark")
    print("-" * 34)
    runtime.execute_code(
        """# Test matrix multiplication on CPU
cpu_device = torch.device("cpu")
cpu_time = run_benchmark(cpu_device, seed=42)

# Test matrix multiplication on GPU
gpu_device = torch.device("cuda")
gpu_time = run_benchmark(gpu_device, seed=42)""",
        debug=True,
    )
    cpu_time = runtime.get_variable("cpu_time")
    gpu_time = runtime.get_variable("gpu_time")

    speedup = cpu_time / gpu_time
    print(f"\nMatrix Multiplication Speedup: {speedup:.2f}x faster on GPU")

    # Convolution benchmark
    print("\n\n2. Convolution Benchmark")
    print("-" * 24)
    runtime.execute_code(
        """# Test convolution on CPU
cpu_conv_time = run_convolution_benchmark(cpu_device, seed=42)

# Test convolution on GPU
gpu_conv_time = run_convolution_benchmark(gpu_device, seed=42)""",
        debug=True,
        timeout=600,
    )
    cpu_conv_time = runtime.get_variable("cpu_conv_time")
    gpu_conv_time = runtime.get_variable("gpu_conv_time")

    conv_speedup = cpu_conv_time / gpu_conv_time
    print(f"\nConvolution Speedup: {conv_speedup:.2f}x faster on GPU")

    # Overall summary
    print(f"\n{'=' * 50}")
    print("BENCHMARK SUMMARY")
    print(f"{'=' * 50}")
    print(f"Matrix Multiplication: {speedup:.2f}x speedup")
    print(f"Convolution Operations: {conv_speedup:.2f}x speedup")
    print(f"Average GPU Speedup: {(speedup + conv_speedup) / 2:.2f}x\n")
