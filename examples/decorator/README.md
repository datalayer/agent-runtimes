[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Datalayer Decorator Example

This example demonstrates how to use the `@datalayer` decorator to seamlessly execute Python functions on remote Datalayer runtimes, enabling distributed computing with minimal code changes.

## Overview

This example showcases:

- **Function Decoration**: Transform regular functions into distributed computations using `@datalayer`
- **Remote Execution**: Execute functions on cloud-based runtimes with different environments
- **Variable Management**: Pass inputs and retrieve outputs from remote execution contexts
- **Snapshot Integration**: Use pre-configured code sandbox snapshots for consistent environments
- **Error Handling**: Timeout configuration and debug mode for development

## Features

- Simple function decoration for remote execution
- Input/output variable mapping between local and remote contexts
- Multiple runtime environments (CPU, GPU, specialized environments)
- Snapshot-based runtime initialization
- Debug mode for development and troubleshooting
- Comprehensive examples covering different use cases

## Prerequisites

- Python 3.9+
- Datalayer Client
- Environment access to Datalayer platform

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/datalayer/core.git
   cd core/examples/decorator
   ```

2. **Install dependencies**:
   ```bash
   pip install -e ../../[examples]
   ```

## Quick Start

**Run the decorator examples**:

```bash
python main.py
```

This will execute four different examples demonstrating various decorator usage patterns:

- **Simple Computation**: Basic mathematical operations
- **Data Processing**: Statistical analysis with input/output mapping
- **Machine Learning**: Model training with scikit-learn
- **Data Analysis**: Dataset analysis using pandas with snapshots

## Example Usage Patterns

### 1. Simple Function Decoration

```python
@datalayer(runtime_name="my-runtime", environment="ai-env")
def simple_computation(x: int, y: int) -> int:
    result = x * y + 10
    return result

# Function executes remotely but called normally
result = simple_computation(5, 8)
```

### 2. Input/Output Variable Mapping

```python
@datalayer(
    runtime_name="data-processing",
    environment="ai-env",
    inputs=["data"],
    output="processed_result"
)
def process_data(data: list) -> dict:
    # Process data remotely
    return {"count": len(data), "mean": sum(data)/len(data)}
```

### 3. Machine Learning with Libraries

```python
@datalayer(
    runtime_name="ml-training",
    environment="ai-env",
    inputs=["features", "labels"],
    output="model_metrics",
    debug=True
)
def train_simple_model(features: list, labels: list) -> dict:
    from sklearn.linear_model import LinearRegression
    # ML code executes in remote environment with sklearn available
    # ...
    return model_metrics
```

### 4. Snapshot-based Environments

```python
@datalayer(
    runtime_name="analysis-runtime",
    environment="ai-env",
    snapshot_name="data-analysis-env",  # Pre-configured environment
    timeout=30.0
)
def analyze_dataset() -> dict:
    import pandas as pd
    # Use pre-installed packages from snapshot
    # ...
    return analysis_results
```

## Decorator Parameters

### Core Parameters

- **`runtime_name`** (str, optional): Name for the runtime instance
- **`environment`** (str): Environment type (e.g., "ai-env", "gpu-env")
- **`inputs`** (list[str], optional): Local variables to pass to remote function
- **`output`** (str, optional): Remote variable to return as result
- **`snapshot_name`** (str, optional): Pre-configured snapshot to use
- **`debug`** (bool): Enable detailed logging and error output
- **`timeout`** (float): Execution timeout in seconds

### Environment Types

- **`ai-env`**: GPU-enabled environment for deep learning
- **`ai-agents-env`**: General-purpose environment with common ML libraries

## Use Cases

This decorator pattern is ideal for:

- **Distributed Computing**: Scale functions across multiple runtimes
- **Resource-Intensive Tasks**: Execute heavy computations on powerful remote hardware
- **Environment Isolation**: Run code in specific, controlled environments
- **Collaborative Development**: Share consistent runtime environments across teams
- **Cost Optimization**: Use cloud resources only when needed
- **GPU Acceleration**: Execute ML workloads on GPU-enabled runtimes

## Output Example

```bash
Datalayer Decorator Examples
========================================

1. Simple Computation Example
------------------------------


Computing 5 * 8 + 10 = 50


Result: 50

2. Data Processing Example
------------------------------


Processed 13 data points
Statistics: {'count': 13, 'mean': 8.846153846153847, 'median': 7, 'stdev': 7.174563329873044, 'min': 1, 'max': 25}


Processing result: {'count': 13, 'mean': 8.846153846153847, 'median': 7, 'stdev': 7.174563329873044, 'min': 1, 'max': 25}

3. Machine Learning Example
------------------------------


Model trained with R2 score: 0.993
Mean Squared Error: 22.504


Model metrics: {'mse': 22.503574409122553, 'r2': 0.9932780416026469, 'coefficient': 1.9653427974453015, 'intercept': 2.6844899679603174, 'train_size': 80, 'test_size': 20}

4. Data Analysis Example
------------------------------


Dataset Analysis Complete
Shape: (1000, 4)
Correlations with target: {'feature_1': -0.017914403077249664, 'feature_2': -0.009844943287877567, 'feature_3': -0.05046032243985329}


Analysis complete. Dataset shape: (1000, 4)
```

## Project Structure

```
decorator/
├── README.md             # This file
├── main.py               # Comprehensive decorator examples
```

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
