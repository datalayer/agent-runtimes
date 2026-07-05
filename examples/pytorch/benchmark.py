"""Benchmark functions for comparing PyTorch CPU vs GPU performance."""
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

import os
import time
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F

os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"


# Set maximum reproducibility (may impact performance)
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
torch.use_deterministic_algorithms(True)


def run_benchmark(device: Any, size: int = 10000, seed: int = 42) -> float:
    """
    Perform matrix multiplication - a computationally expensive operation.

    Parameters
    ----------
    device : Any
        The PyTorch device (CPU or CUDA) to run the benchmark on.
    size : int, optional
        The size of the square matrices to multiply, by default 10000.
    seed : int, optional
        Random seed for reproducible results, by default 42.

    Returns
    -------
    float
        The execution time in seconds.
    """
    print(f"\nRunning on: {device}")

    # Set random seed for reproducibility
    torch.manual_seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)  # For multi-GPU setups

    # Create large random matrices (reproducible)
    matrix_a = torch.randn(size, size, device=device)
    matrix_b = torch.randn(size, size, device=device)

    # Warm up (important for GPU benchmarking)
    if device.type == "cuda":
        torch.cuda.synchronize()
        _ = torch.matmul(matrix_a, matrix_b)
        torch.cuda.synchronize()

    # Benchmark the operation
    start_time = time.time()

    # Perform expensive matrix multiplication
    torch.matmul(matrix_a, matrix_b)

    # Ensure GPU operations complete before measuring time
    if device.type == "cuda":
        torch.cuda.synchronize()

    end_time = time.time()

    execution_time = end_time - start_time
    print(f"Matrix size: {size}x{size}")
    print(f"Execution time: {execution_time:.4f} seconds")

    return execution_time


def run_convolution_benchmark(
    device: Any,
    batch_size: int = 48,
    channels: int = 180,
    height: int = 640,
    width: int = 640,
    seed: int = 42,
) -> float:
    """
    Perform 2D convolutions - a computationally expensive operation common in deep learning.

    Parameters
    ----------
    device : Any
        The PyTorch device (CPU or CUDA) to run the benchmark on.
    batch_size : int, optional
        The batch size for the input tensor, by default 48.
    channels : int, optional
        The number of input and output channels, by default 180.
    height : int, optional
        The height of the input tensor, by default 640.
    width : int, optional
        The width of the input tensor, by default 640.
    seed : int, optional
        Random seed for reproducible results, by default 42.

    Returns
    -------
    float
        The execution time in seconds.
    """
    print(f"\nRunning convolution benchmark on: {device}")

    # Set random seed for reproducibility
    torch.manual_seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

    # Create large input tensor (batch_size, channels, height, width)
    input_tensor = torch.randn(batch_size, channels, height, width, device=device)

    # Create a convolutional layer with many filters
    conv_layer = nn.Conv2d(
        in_channels=channels,
        out_channels=channels,
        kernel_size=3,
        padding=1,
        bias=False,
    ).to(device)

    # Initialize weights for reproducibility
    with torch.no_grad():
        torch.manual_seed(seed)
        conv_layer.weight.data = torch.randn_like(conv_layer.weight.data)

    # Warm up (important for GPU benchmarking)
    if device.type == "cuda":
        torch.cuda.synchronize()
        _ = conv_layer(input_tensor)
        torch.cuda.synchronize()

    # Benchmark the operation
    start_time = time.time()

    # Perform expensive convolution operation
    output = conv_layer(input_tensor)

    # Add another convolution for more computation
    output = F.conv2d(output, conv_layer.weight, padding=1)

    # Ensure GPU operations complete before measuring time
    if device.type == "cuda":
        torch.cuda.synchronize()

    end_time = time.time()

    execution_time = end_time - start_time

    print(f"Input tensor shape: {input_tensor.shape}")
    print(f"Output tensor shape: {output.shape}")
    print(f"Execution time: {execution_time:.4f} seconds")

    return execution_time
