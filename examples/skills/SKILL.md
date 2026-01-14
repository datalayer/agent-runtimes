---
name: data_pipeline
description: Process data through a multi-step pipeline with validation
version: 1.0.0
allowed-tools:
  - filesystem__read_file
  - filesystem__write_file
  - data__validate
  - data__transform
model: claude-sonnet-4-20250514
context: fork
user-invocable: true
tags:
  - data
  - pipeline
  - etl
hooks:
  before-invoke: echo "Starting data pipeline..."
  after-invoke: echo "Pipeline complete"
  on-error: echo "Pipeline failed: $SKILL_ERROR"
author: Datalayer Team
---

# Data Pipeline Skill

This skill processes data through a multi-step ETL (Extract, Transform, Load) pipeline.

## Overview

The data pipeline skill:
1. Reads data from a source file
2. Validates the data structure
3. Transforms the data according to rules
4. Writes the result to an output file

## Parameters

- `input_path` (required): Path to the input data file
- `output_path` (required): Path for the output file
- `transform_rules` (optional): Dictionary of transformation rules

## Usage

```python
# Set parameters
input_path = "/data/input.csv"
output_path = "/data/output.json"
transform_rules = {
    "uppercase_columns": ["name", "city"],
    "date_format": "%Y-%m-%d"
}

# Run the skill
result = await run_skill("data_pipeline", {
    "input_path": input_path,
    "output_path": output_path,
    "transform_rules": transform_rules
})
```

## Implementation

```python
import json
import os

# Get parameters
input_path = input_path if "input_path" in dir() else "/tmp/input.txt"
output_path = output_path if "output_path" in dir() else "/tmp/output.json"
transform_rules = transform_rules if "transform_rules" in dir() else {}

# Step 1: Read input data
if not os.path.exists(input_path):
    raise FileNotFoundError(f"Input file not found: {input_path}")

with open(input_path, "r") as f:
    data = f.read()

# Step 2: Validate data
if not data.strip():
    raise ValueError("Input file is empty")

# Step 3: Transform data
lines = data.strip().split("\n")
records = []

for line in lines:
    record = {"raw": line, "processed": True}
    
    # Apply transformation rules
    if transform_rules.get("uppercase_columns"):
        record["raw"] = line.upper()
    
    records.append(record)

# Step 4: Write output
output_data = {
    "source": input_path,
    "record_count": len(records),
    "records": records,
}

with open(output_path, "w") as f:
    json.dump(output_data, f, indent=2)

print(f"Pipeline complete: {len(records)} records processed")
print(f"Output written to: {output_path}")
```

## Error Handling

The skill handles these error conditions:
- Missing input file: Raises `FileNotFoundError`
- Empty input: Raises `ValueError`
- Write permission issues: Raises `PermissionError`

## Examples

### Basic Usage

```python
result = await run_skill("data_pipeline", {
    "input_path": "data.csv",
    "output_path": "result.json"
})
```

### With Transformations

```python
result = await run_skill("data_pipeline", {
    "input_path": "customers.csv",
    "output_path": "customers_processed.json",
    "transform_rules": {
        "uppercase_columns": ["name", "email"],
        "date_format": "%Y-%m-%d"
    }
})
```
