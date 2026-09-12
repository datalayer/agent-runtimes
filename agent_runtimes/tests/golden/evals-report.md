# Evals Report: evalset-reference

- Generated at: 2026-09-09T12:00:00.000000Z
- Experiments: 2
- Agentspecs: 2
- Cases: 6
- Evalset evaluators: 1
- Report evaluators: 0
- Run window per experiment: 10
- Evalset run details: [Open in Datalayer](https://datalayer.app/benchmarks/evalset-reference)

> The body summarises results (evaluators, per-case outcomes, drift, and comparisons). Full configuration, cases, heatmaps, per-experiment timelines, and per-run details are in the appendices at the end.

## Agentspec Coverage

| Agentspec ID         | Agentspec            | Model | Version | Experiments | Runs | Details                                                                |
| :------------------- | :------------------- | :---- | :------ | ----------: | ---: | :--------------------------------------------------------------------- |
| jupyter-data-analyst | jupyter-data-analyst | -     | -       |           1 |    3 | [Open](https://datalayer.app/settings/agentspecs/jupyter-data-analyst) |
| example-evals        | example-evals        | -     | -       |           1 |    2 | [Open](https://datalayer.app/settings/agentspecs/example-evals)        |


## Evaluator Results

Evalset-scoped evaluators run for each case; report-scoped evaluators run once over the aggregated report. Scores are aggregated across all runs in the run window (full evaluator configuration is in the appendix).

Runs Passed counts runs where the evaluator passed; Latest reflects the most recent run.

| Evaluator           | Scope   | Runs Passed | Mean Score | Latest Score | Latest | Summary                         |
| :------------------ | :------ | ----------: | ---------: | -----------: | :----- | :------------------------------ |
| pass_rate_threshold | evalset |         2/5 |      0.567 |        0.833 | pass   | pass rate 0.83 ≥ threshold 0.60 |

## Per-Case Outcomes

Pass rate for each case across every fetched run (all experiments and agentspecs combined). This reveals which cases are reliable and which ones regress, instead of only the aggregate run pass rate.

| Case                 | Runs | Passed | Pass Rate | Avg Score |
| :------------------- | ---: | -----: | --------: | --------: |
| row-count            |    5 |    5/5 |    100.0% |     1.000 |
| exact-duplicate-rows |    5 |    3/5 |     60.0% |     0.600 |
| duplicate-customers  |    5 |    0/5 |      0.0% |     0.000 |
| duplicate-rows       |    5 |    1/5 |     20.0% |     0.200 |
| largest-plan         |    5 |    5/5 |    100.0% |     1.000 |
| unique-customers     |    5 |    3/5 |     60.0% |     0.600 |

### Per-Case Pass Rate By Agentspec

Compare how each case performs across agentspecs (for example codemode vs no-codemode).

| Case                 | jupyter-data-analyst | example-evals |
| :------------------- | -------------------: | ------------: |
| row-count            |               100.0% |        100.0% |
| exact-duplicate-rows |               100.0% |          0.0% |
| duplicate-customers  |                 0.0% |          0.0% |
| duplicate-rows       |                33.3% |          0.0% |
| largest-plan         |               100.0% |        100.0% |
| unique-customers     |                66.7% |         50.0% |

## Experiment Overview

| Experiment           | Agentspec            | Runs (fetched/total) | Latest | Baseline | Drift       | Latest-2 Delta |
| :------------------- | :------------------- | -------------------: | -----: | -------: | ----------: | -------------: |
| jupyter-data-analyst | jupyter-data-analyst |                  3/3 |  83.3% |    50.0% | 🟢 +33.3 pts |    🟢 +16.7 pts |
| example-evals        | example-evals        |                  2/2 |  33.3% |    50.0% | 🔴 -16.7 pts |    🔴 -16.7 pts |

## Comparison Combinations

### By Latest Pass Rate

| Rank | Experiment           | Latest |
| ---: | :------------------- | -----: |
|    1 | jupyter-data-analyst |  83.3% |
|    2 | example-evals        |  33.3% |

Latest pass-rate histogram (pts):
`   0.0 to   12.5 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  12.5 to   25.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  25.0 to   37.5 pts |████████████████████| 1`
`  37.5 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   62.5 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  62.5 to   75.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  75.0 to   87.5 pts |████████████████████| 1`
`  87.5 to  100.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`

### By Drift (Most Negative To Most Positive)

| Rank | Experiment           | Drift       |
| ---: | :------------------- | ----------: |
|    1 | example-evals        | 🔴 -16.7 pts |
|    2 | jupyter-data-analyst | 🟢 +33.3 pts |

Drift histogram (delta pts):
` -16.7 to  -10.4 pts |████████████████████| 1`
` -10.4 to   -4.2 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  -4.2 to    2.1 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`   2.1 to    8.3 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`   8.3 to   14.6 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  14.6 to   20.8 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  20.8 to   27.1 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  27.1 to   33.3 pts |████████████████████| 1`

### By Stability (Lowest Pass-Rate StdDev)

| Rank | Experiment           | StdDev    | Mean  |
| ---: | :------------------- | --------: | ----: |
|    1 | example-evals        |  8.33 pts | 41.7% |
|    2 | jupyter-data-analyst | 13.61 pts | 66.7% |

### Token Usage Across Runs By Experiment

Total tokens across fetched runs for each experiment. Trends are ordered oldest to newest run.

| Experiment           | Runs With Tokens | Latest Tokens | Mean Tokens | Total Tokens | Token Trend |
| :------------------- | ---------------: | ------------: | ----------: | -----------: | :---------- |
| jupyter-data-analyst |              3/3 |         9,000 |       9,000 |       27,000 | `▇▇▇`       |
| example-evals        |              2/2 |         9,000 |       9,000 |       18,000 | `▇▇`        |

### Pairwise Latest-Pass Deltas

| Pair                                  | Left Latest | Right Latest | Delta (Left-Right) |
| :------------------------------------ | ----------: | -----------: | -----------------: |
| jupyter-data-analyst vs example-evals |       83.3% |        33.3% |        🟢 +50.0 pts |

Pairwise latest-delta histogram (pts):
`  50.0 to   50.0 pts |████████████████████| 1`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`
`  50.0 to   50.0 pts |░░░░░░░░░░░░░░░░░░░░| 0`

### Within-Agentspec Pairwise Latest-Pass Deltas

| Pair | Agentspec | Left Latest | Right Latest | Delta (Left-Right) |
| :--- | :-------- | ----------: | -----------: | -----------------: |
| n/a  | n/a       |         n/a |          n/a |                n/a |

### Cross-Agentspec Pairwise Latest-Pass Deltas

| Pair                                                                         | Left Latest | Right Latest | Delta (Left-Right) |
| :--------------------------------------------------------------------------- | ----------: | -----------: | -----------------: |
| jupyter-data-analyst (jupyter-data-analyst) vs example-evals (example-evals) |       83.3% |        33.3% |        🟢 +50.0 pts |

### Insight Highlights

- Top latest pass-rate: jupyter-data-analyst (83.3%).
- Lowest latest pass-rate: example-evals (33.3%).
- Strongest positive drift: jupyter-data-analyst (🟢 +33.3 pts).
- Strongest negative drift: example-evals (🔴 -16.7 pts).
- Stability leader: example-evals (stddev=8.33 pts, mean=41.7%).

Drift balance meter:
`NEG ███████ (1) | FLAT · (0) | POS ███████ (1)`

## Notes

- Drift is computed as latest - baseline.
- Baseline uses the first half of fetched runs (minimum 1, maximum 3).
- Latest-2 delta uses the latest two runs returned in the fetched window.

# Appendices

Full configuration, cases, heatmaps, per-experiment timelines, and per-run details are collected below to keep the summary above readable.

## Appendix: Agentspec Details

### jupyter-data-analyst

- ID: `jupyter-data-analyst`
- Experiments (1): jupyter-data-analyst
- Runs analysed: 3
- Details: [Open in Datalayer](https://datalayer.app/settings/agentspecs/jupyter-data-analyst)

### example-evals

- ID: `example-evals`
- Experiments (1): example-evals
- Runs analysed: 2
- Details: [Open in Datalayer](https://datalayer.app/settings/agentspecs/example-evals)

## Appendix: Evaluator Configuration

Evalset-level evaluators run for each case; report-level evaluators run once after all cases. Evaluator names are resolved at runtime via the Pydantic evaluator registries.

### Evalset Evaluators

```json
[
  {
    "arguments": {
      "threshold": 0.6
    },
    "name": "pass_rate_threshold"
  }
]
```

### Report Evaluators

No report-level evaluators configured.

## Appendix: Evalset Cases

6 case(s) in this evalset.

| Case                 | ID     | Inputs                                      | Expected Output | Evaluators            | Metadata                                        |
| :------------------- | :----- | :------------------------------------------ | :-------------- | :-------------------- | :---------------------------------------------- |
| row-count            | case-1 | {"prompt":"Question 1 about customers.csv"} | 2000            | [{"name":"contains"}] | {"category":"counting","difficulty":"easy"}     |
| exact-duplicate-rows | case-2 | {"prompt":"Question 2 about customers.csv"} | 0               | [{"name":"contains"}] | {"category":"duplicates","difficulty":"easy"}   |
| duplicate-customers  | case-3 | {"prompt":"Question 3 about customers.csv"} | 157             | [{"name":"contains"}] | {"category":"duplicates","difficulty":"medium"} |
| duplicate-rows       | case-4 | {"prompt":"Question 4 about customers.csv"} | 314             | [{"name":"contains"}] | {"category":"duplicates","difficulty":"medium"} |
| largest-plan         | case-5 | {"prompt":"Question 5 about customers.csv"} | free            | [{"name":"contains"}] | {"category":"aggregation","difficulty":"easy"}  |
| unique-customers     | case-6 | {"prompt":"Question 6 about customers.csv"} | 1843            | [{"name":"contains"}] | {"category":"counting","difficulty":"medium"}   |

## Appendix: Structured Report Analyses

The JSON block below is rendered directly from the top-level `report_analyses` payload.

```json
[
  {
    "kind": "scalar",
    "metric": "experiment_count",
    "name": "Experiment Count",
    "value": 2
  },
  {
    "kind": "scalar",
    "metric": "overall_mean_pass_rate",
    "name": "Overall Mean Pass Rate",
    "value": 0.5666666666666667
  },
  {
    "columns": [
      "experiment",
      "latest_pass_rate",
      "baseline_pass_rate",
      "drift_delta"
    ],
    "kind": "table",
    "name": "Experiment Latest/Baseline",
    "rows": [
      [
        "jupyter-data-analyst",
        0.8333333333333334,
        0.5,
        0.33333333333333337
      ],
      [
        "example-evals",
        0.3333333333333333,
        0.5,
        -0.16666666666666669
      ]
    ]
  },
  {
    "kind": "line",
    "name": "Latest Pass Rate By Experiment",
    "x": [
      "jupyter-data-analyst",
      "example-evals"
    ],
    "y": [
      0.8333333333333334,
      0.3333333333333333
    ]
  },
  {
    "columns": [
      "-5",
      "-4",
      "-3",
      "-2",
      "-1",
      "latest"
    ],
    "kind": "heatmap",
    "name": "Recent Runs",
    "rows": [
      "jupyter-data-analyst",
      "example-evals"
    ],
    "values": [
      [
        null,
        null,
        null,
        0.8333333333333334,
        0.6666666666666666,
        0.5
      ],
      [
        null,
        null,
        null,
        null,
        0.3333333333333333,
        0.5
      ]
    ]
  },
  {
    "convention": "delta = candidate - baseline",
    "kind": "pairwise",
    "name": "Pairwise Deltas",
    "pairs": [
      {
        "baseline": "example-evals",
        "baseline_pass_rate": 0.3333333333333333,
        "candidate": "jupyter-data-analyst",
        "candidate_pass_rate": 0.8333333333333334,
        "delta_pass_rate": 0.5
      },
      {
        "baseline": "jupyter-data-analyst",
        "baseline_pass_rate": 0.8333333333333334,
        "candidate": "example-evals",
        "candidate_pass_rate": 0.3333333333333333,
        "delta_pass_rate": -0.5
      }
    ]
  }
]
```

## Appendix: Heatmaps

Pass-rate heatmap by experiment and run window:

```text
Experiment           | r01 r02 r03 r04 r05 r06 r07 r08 r09 r10 r11 r12
----------------------------------------------------------------------
jupyter-data-analyst | ▓ ▓ ▓ · · · · · · · · ·
example-evals        | ▒ ▓ · · · · · · · · · ·
Legend: low='░' .. high='█' (r01=latest fetched run, '·'=no run)
```

Consecutive delta heatmap (A-B) by experiment:

```text
Experiment           | d01 d02 d03 d04 d05 d06 d07 d08 d09 d10 d11 d12
----------------------------------------------------------------------
jupyter-data-analyst | +▒ +░ ·· ·· ·· ·· ·· ·· ·· ·· ·· ··
example-evals        | -░ ·· ·· ·· ·· ·· ·· ·· ·· ·· ·· ··
Legend: dNN are consecutive deltas (A-B), sign shows direction, magnitude uses '░'..'█', '··'=no comparison
```

## Appendix: Per-Experiment Details

### jupyter-data-analyst

Agentspec: [jupyter-data-analyst](https://datalayer.app/settings/agentspecs/jupyter-data-analyst)
Evalset run details: [Open run page](https://datalayer.app/benchmarks/evalset-reference)

#### Run Timeline

| # | Run ID                                                               | Status    | Pass Rate | Total Tokens | ASCII Trend                    | Failure Cause |
| --: | :------------------------------------------------------------------- | :-------- | --------: | -----------: | :----------------------------- | :------------ |
| 1 | [run-1-3](https://datalayer.app/runs/launch-123/experiments/run-1-3) | completed |     83.3% |        9,000 | `███████████████████████░░░░░` | -             |
| 2 | [run-1-2](https://datalayer.app/runs/launch-122/experiments/run-1-2) | completed |     66.7% |        9,000 | `███████████████████░░░░░░░░░` | -             |
| 3 | [run-1-1](https://datalayer.app/runs/launch-121/experiments/run-1-1) | completed |     50.0% |        9,000 | `██████████████░░░░░░░░░░░░░░` | -             |

Pass-rate sparkline: `█▄▁`
Token usage sparkline: `▇▇▇`

#### Consecutive Run Deltas (A-B)

| Run A   | Run B   | A Pass | B Pass | Delta       |
| :------ | :------ | -----: | -----: | ----------: |
| run-1-3 | run-1-2 |  83.3% |  66.7% | 🟢 +16.7 pts |
| run-1-2 | run-1-1 |  66.7% |  50.0% | 🟢 +16.7 pts |

### example-evals

Agentspec: [example-evals](https://datalayer.app/settings/agentspecs/example-evals)
Evalset run details: [Open run page](https://datalayer.app/benchmarks/evalset-reference)

#### Run Timeline

| # | Run ID                                                               | Status    | Pass Rate | Total Tokens | ASCII Trend                    | Failure Cause |
| --: | :------------------------------------------------------------------- | :-------- | --------: | -----------: | :----------------------------- | :------------ |
| 1 | [run-2-2](https://datalayer.app/runs/launch-122/experiments/run-2-2) | completed |     33.3% |        9,000 | `█████████░░░░░░░░░░░░░░░░░░░` | -             |
| 2 | [run-2-1](https://datalayer.app/runs/launch-121/experiments/run-2-1) | completed |     50.0% |        9,000 | `██████████████░░░░░░░░░░░░░░` | -             |

Pass-rate sparkline: `▁█`
Token usage sparkline: `▇▇`

#### Consecutive Run Deltas (A-B)

| Run A   | Run B   | A Pass | B Pass | Delta       |
| :------ | :------ | -----: | -----: | ----------: |
| run-2-2 | run-2-1 |  33.3% |  50.0% | 🔴 -16.7 pts |

## Appendix: Run Details

Per-run detail for every run fetched in the window above. Each Run ID opens the run-details overlay directly in Datalayer, and the collapsible blocks below reproduce the same prompt, agent output, summary, and report shown by the in-app run-details dialog.

### jupyter-data-analyst

Agentspec: jupyter-data-analyst

| # | Run ID                                                               | Status    | Pass Rate | Cases (pass/total) | Avg Score | Total Tokens | Credits | Created              | Failure Cause |
| --: | :------------------------------------------------------------------- | :-------- | --------: | -----------------: | --------: | -----------: | ------: | :------------------- | :------------ |
| 1 | [run-1-3](https://datalayer.app/runs/launch-123/experiments/run-1-3) | completed |     83.3% |                5/6 |     0.833 |         9000 |     3.2 | 2026-09-03T10:18:24Z | -             |
| 2 | [run-1-2](https://datalayer.app/runs/launch-122/experiments/run-1-2) | completed |     66.7% |                4/6 |     0.667 |         9000 |     3.2 | 2026-09-02T10:18:24Z | -             |
| 3 | [run-1-1](https://datalayer.app/runs/launch-121/experiments/run-1-1) | completed |     50.0% |                3/6 |     0.500 |         9000 |     3.2 | 2026-09-01T10:18:24Z | -             |

#### Full Run Detail (as shown in the UI)

<details><summary>Run 1 — run-1-3 (status: completed, pass rate: 83.3%)</summary>

- Run ID: `run-1-3`
- Status: completed
- Pass rate: 83.3%
- Created: 2026-09-03T10:18:24Z

**Per-Case Results**

| Case                 | Result | Score | Category    | Difficulty |
| :------------------- | :----- | ----: | :---------- | :--------- |
| row-count            | ✅ pass | 1.000 | counting    | easy       |
| exact-duplicate-rows | ✅ pass | 1.000 | duplicates  | easy       |
| duplicate-customers  | ❌ fail | 0.000 | duplicates  | medium     |
| duplicate-rows       | ✅ pass | 1.000 | duplicates  | medium     |
| largest-plan         | ✅ pass | 1.000 | aggregation | easy       |
| unique-customers     | ✅ pass | 1.000 | counting    | medium     |

**Per-Case Prompts and Outputs**

<details><summary>Case row-count (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: easy

**Prompt**

```text
Question 1 about customers.csv
```

**Output**

```text
2000
```

**Expected Output**

```text
2000
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case exact-duplicate-rows (pass, score: 1.000)</summary>

- Category: duplicates
- Difficulty: easy

**Prompt**

```text
Question 2 about customers.csv
```

**Output**

```text
0
```

**Expected Output**

```text
0
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-customers (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 3 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
157
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-rows (pass, score: 1.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 4 about customers.csv
```

**Output**

```text
314
```

**Expected Output**

```text
314
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case largest-plan (pass, score: 1.000)</summary>

- Category: aggregation
- Difficulty: easy

**Prompt**

```text
Question 5 about customers.csv
```

**Output**

```text
free
```

**Expected Output**

```text
free
```

**Case Metadata**

```json
{
  "category": "aggregation",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case unique-customers (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: medium

**Prompt**

```text
Question 6 about customers.csv
```

**Output**

```text
1843
```

**Expected Output**

```text
1843
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

**Prompt Sent**

```text
(none)
```

**Agent Output Received**

```text
(none)
```

**Pydantic AI Usage**

| Metric            | Value             |
| :---------------- | :---------------- |
| provider          | bedrock           |
| model             | claude-sonnet-4-6 |
| requests          | 6                 |
| prompt_tokens     | 7200              |
| completion_tokens | 1800              |
| total_tokens      | 9000              |
| duration_ms       | 184000            |
| credits_consumed  | 3.2               |

Raw usage payload:

```json
{
  "completion_tokens": 1800,
  "credits_consumed": 3.2,
  "duration_ms": 184000,
  "model": "claude-sonnet-4-6",
  "prompt_tokens": 7200,
  "provider": "bedrock",
  "requests": 6,
  "total_tokens": 9000
}
```

**Run Summary**

```json
{
  "agent_spec_id": "jupyter-data-analyst",
  "execution_target": "cloud",
  "launch_source": "datalayer-core",
  "run_mode": "batch"
}
```

**Run Report**

```json
{
  "interaction": [
    {
      "case": "row-count",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "exact-duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-customers",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "largest-plan",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "unique-customers",
      "output": "…",
      "prompt": "…"
    }
  ]
}
```

</details>

<details><summary>Run 2 — run-1-2 (status: completed, pass rate: 66.7%)</summary>

- Run ID: `run-1-2`
- Status: completed
- Pass rate: 66.7%
- Created: 2026-09-02T10:18:24Z

**Per-Case Results**

| Case                 | Result | Score | Category    | Difficulty |
| :------------------- | :----- | ----: | :---------- | :--------- |
| row-count            | ✅ pass | 1.000 | counting    | easy       |
| exact-duplicate-rows | ✅ pass | 1.000 | duplicates  | easy       |
| duplicate-customers  | ❌ fail | 0.000 | duplicates  | medium     |
| duplicate-rows       | ❌ fail | 0.000 | duplicates  | medium     |
| largest-plan         | ✅ pass | 1.000 | aggregation | easy       |
| unique-customers     | ✅ pass | 1.000 | counting    | medium     |

**Per-Case Prompts and Outputs**

<details><summary>Case row-count (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: easy

**Prompt**

```text
Question 1 about customers.csv
```

**Output**

```text
2000
```

**Expected Output**

```text
2000
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case exact-duplicate-rows (pass, score: 1.000)</summary>

- Category: duplicates
- Difficulty: easy

**Prompt**

```text
Question 2 about customers.csv
```

**Output**

```text
0
```

**Expected Output**

```text
0
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-customers (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 3 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
157
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 4 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
314
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case largest-plan (pass, score: 1.000)</summary>

- Category: aggregation
- Difficulty: easy

**Prompt**

```text
Question 5 about customers.csv
```

**Output**

```text
free
```

**Expected Output**

```text
free
```

**Case Metadata**

```json
{
  "category": "aggregation",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case unique-customers (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: medium

**Prompt**

```text
Question 6 about customers.csv
```

**Output**

```text
1843
```

**Expected Output**

```text
1843
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

**Prompt Sent**

```text
(none)
```

**Agent Output Received**

```text
(none)
```

**Pydantic AI Usage**

| Metric            | Value             |
| :---------------- | :---------------- |
| provider          | bedrock           |
| model             | claude-sonnet-4-6 |
| requests          | 6                 |
| prompt_tokens     | 7200              |
| completion_tokens | 1800              |
| total_tokens      | 9000              |
| duration_ms       | 184000            |
| credits_consumed  | 3.2               |

Raw usage payload:

```json
{
  "completion_tokens": 1800,
  "credits_consumed": 3.2,
  "duration_ms": 184000,
  "model": "claude-sonnet-4-6",
  "prompt_tokens": 7200,
  "provider": "bedrock",
  "requests": 6,
  "total_tokens": 9000
}
```

**Run Summary**

```json
{
  "agent_spec_id": "jupyter-data-analyst",
  "execution_target": "cloud",
  "launch_source": "datalayer-core",
  "run_mode": "batch"
}
```

**Run Report**

```json
{
  "interaction": [
    {
      "case": "row-count",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "exact-duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-customers",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "largest-plan",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "unique-customers",
      "output": "…",
      "prompt": "…"
    }
  ]
}
```

</details>

<details><summary>Run 3 — run-1-1 (status: completed, pass rate: 50.0%)</summary>

- Run ID: `run-1-1`
- Status: completed
- Pass rate: 50.0%
- Created: 2026-09-01T10:18:24Z

**Per-Case Results**

| Case                 | Result | Score | Category    | Difficulty |
| :------------------- | :----- | ----: | :---------- | :--------- |
| row-count            | ✅ pass | 1.000 | counting    | easy       |
| exact-duplicate-rows | ✅ pass | 1.000 | duplicates  | easy       |
| duplicate-customers  | ❌ fail | 0.000 | duplicates  | medium     |
| duplicate-rows       | ❌ fail | 0.000 | duplicates  | medium     |
| largest-plan         | ✅ pass | 1.000 | aggregation | easy       |
| unique-customers     | ❌ fail | 0.000 | counting    | medium     |

**Per-Case Prompts and Outputs**

<details><summary>Case row-count (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: easy

**Prompt**

```text
Question 1 about customers.csv
```

**Output**

```text
2000
```

**Expected Output**

```text
2000
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case exact-duplicate-rows (pass, score: 1.000)</summary>

- Category: duplicates
- Difficulty: easy

**Prompt**

```text
Question 2 about customers.csv
```

**Output**

```text
0
```

**Expected Output**

```text
0
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-customers (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 3 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
157
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 4 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
314
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case largest-plan (pass, score: 1.000)</summary>

- Category: aggregation
- Difficulty: easy

**Prompt**

```text
Question 5 about customers.csv
```

**Output**

```text
free
```

**Expected Output**

```text
free
```

**Case Metadata**

```json
{
  "category": "aggregation",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case unique-customers (fail, score: 0.000)</summary>

- Category: counting
- Difficulty: medium

**Prompt**

```text
Question 6 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
1843
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

**Prompt Sent**

```text
(none)
```

**Agent Output Received**

```text
(none)
```

**Pydantic AI Usage**

| Metric            | Value             |
| :---------------- | :---------------- |
| provider          | bedrock           |
| model             | claude-sonnet-4-6 |
| requests          | 6                 |
| prompt_tokens     | 7200              |
| completion_tokens | 1800              |
| total_tokens      | 9000              |
| duration_ms       | 184000            |
| credits_consumed  | 3.2               |

Raw usage payload:

```json
{
  "completion_tokens": 1800,
  "credits_consumed": 3.2,
  "duration_ms": 184000,
  "model": "claude-sonnet-4-6",
  "prompt_tokens": 7200,
  "provider": "bedrock",
  "requests": 6,
  "total_tokens": 9000
}
```

**Run Summary**

```json
{
  "agent_spec_id": "jupyter-data-analyst",
  "execution_target": "cloud",
  "launch_source": "datalayer-core",
  "run_mode": "batch"
}
```

**Run Report**

```json
{
  "interaction": [
    {
      "case": "row-count",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "exact-duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-customers",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "largest-plan",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "unique-customers",
      "output": "…",
      "prompt": "…"
    }
  ]
}
```

</details>

### example-evals

Agentspec: example-evals

| # | Run ID                                                               | Status    | Pass Rate | Cases (pass/total) | Avg Score | Total Tokens | Credits | Created              | Failure Cause |
| --: | :------------------------------------------------------------------- | :-------- | --------: | -----------------: | --------: | -----------: | ------: | :------------------- | :------------ |
| 1 | [run-2-2](https://datalayer.app/runs/launch-122/experiments/run-2-2) | completed |     33.3% |                2/6 |     0.333 |         9000 |     3.2 | 2026-09-02T10:18:24Z | -             |
| 2 | [run-2-1](https://datalayer.app/runs/launch-121/experiments/run-2-1) | completed |     50.0% |                3/6 |     0.500 |         9000 |     3.2 | 2026-09-01T10:18:24Z | -             |

#### Full Run Detail (as shown in the UI)

<details><summary>Run 1 — run-2-2 (status: completed, pass rate: 33.3%)</summary>

- Run ID: `run-2-2`
- Status: completed
- Pass rate: 33.3%
- Created: 2026-09-02T10:18:24Z

**Per-Case Results**

| Case                 | Result | Score | Category    | Difficulty |
| :------------------- | :----- | ----: | :---------- | :--------- |
| row-count            | ✅ pass | 1.000 | counting    | easy       |
| exact-duplicate-rows | ❌ fail | 0.000 | duplicates  | easy       |
| duplicate-customers  | ❌ fail | 0.000 | duplicates  | medium     |
| duplicate-rows       | ❌ fail | 0.000 | duplicates  | medium     |
| largest-plan         | ✅ pass | 1.000 | aggregation | easy       |
| unique-customers     | ❌ fail | 0.000 | counting    | medium     |

**Per-Case Prompts and Outputs**

<details><summary>Case row-count (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: easy

**Prompt**

```text
Question 1 about customers.csv
```

**Output**

```text
2000
```

**Expected Output**

```text
2000
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case exact-duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: easy

**Prompt**

```text
Question 2 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
0
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-customers (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 3 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
157
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 4 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
314
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case largest-plan (pass, score: 1.000)</summary>

- Category: aggregation
- Difficulty: easy

**Prompt**

```text
Question 5 about customers.csv
```

**Output**

```text
free
```

**Expected Output**

```text
free
```

**Case Metadata**

```json
{
  "category": "aggregation",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case unique-customers (fail, score: 0.000)</summary>

- Category: counting
- Difficulty: medium

**Prompt**

```text
Question 6 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
1843
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

**Prompt Sent**

```text
(none)
```

**Agent Output Received**

```text
(none)
```

**Pydantic AI Usage**

| Metric            | Value             |
| :---------------- | :---------------- |
| provider          | bedrock           |
| model             | claude-sonnet-4-6 |
| requests          | 6                 |
| prompt_tokens     | 7200              |
| completion_tokens | 1800              |
| total_tokens      | 9000              |
| duration_ms       | 184000            |
| credits_consumed  | 3.2               |

Raw usage payload:

```json
{
  "completion_tokens": 1800,
  "credits_consumed": 3.2,
  "duration_ms": 184000,
  "model": "claude-sonnet-4-6",
  "prompt_tokens": 7200,
  "provider": "bedrock",
  "requests": 6,
  "total_tokens": 9000
}
```

**Run Summary**

```json
{
  "agent_spec_id": "example-evals",
  "execution_target": "cloud",
  "launch_source": "datalayer-core",
  "run_mode": "batch"
}
```

**Run Report**

```json
{
  "interaction": [
    {
      "case": "row-count",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "exact-duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-customers",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "largest-plan",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "unique-customers",
      "output": "…",
      "prompt": "…"
    }
  ]
}
```

</details>

<details><summary>Run 2 — run-2-1 (status: completed, pass rate: 50.0%)</summary>

- Run ID: `run-2-1`
- Status: completed
- Pass rate: 50.0%
- Created: 2026-09-01T10:18:24Z

**Per-Case Results**

| Case                 | Result | Score | Category    | Difficulty |
| :------------------- | :----- | ----: | :---------- | :--------- |
| row-count            | ✅ pass | 1.000 | counting    | easy       |
| exact-duplicate-rows | ❌ fail | 0.000 | duplicates  | easy       |
| duplicate-customers  | ❌ fail | 0.000 | duplicates  | medium     |
| duplicate-rows       | ❌ fail | 0.000 | duplicates  | medium     |
| largest-plan         | ✅ pass | 1.000 | aggregation | easy       |
| unique-customers     | ✅ pass | 1.000 | counting    | medium     |

**Per-Case Prompts and Outputs**

<details><summary>Case row-count (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: easy

**Prompt**

```text
Question 1 about customers.csv
```

**Output**

```text
2000
```

**Expected Output**

```text
2000
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case exact-duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: easy

**Prompt**

```text
Question 2 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
0
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-customers (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 3 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
157
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case duplicate-rows (fail, score: 0.000)</summary>

- Category: duplicates
- Difficulty: medium

**Prompt**

```text
Question 4 about customers.csv
```

**Output**

```text
unsure
```

**Expected Output**

```text
314
```

**Case Metadata**

```json
{
  "category": "duplicates",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case largest-plan (pass, score: 1.000)</summary>

- Category: aggregation
- Difficulty: easy

**Prompt**

```text
Question 5 about customers.csv
```

**Output**

```text
free
```

**Expected Output**

```text
free
```

**Case Metadata**

```json
{
  "category": "aggregation",
  "difficulty": "easy"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

<details><summary>Case unique-customers (pass, score: 1.000)</summary>

- Category: counting
- Difficulty: medium

**Prompt**

```text
Question 6 about customers.csv
```

**Output**

```text
1843
```

**Expected Output**

```text
1843
```

**Case Metadata**

```json
{
  "category": "counting",
  "difficulty": "medium"
}
```

**Case Evaluators**

```json
[
  {
    "name": "contains"
  }
]
```

</details>

**Prompt Sent**

```text
(none)
```

**Agent Output Received**

```text
(none)
```

**Pydantic AI Usage**

| Metric            | Value             |
| :---------------- | :---------------- |
| provider          | bedrock           |
| model             | claude-sonnet-4-6 |
| requests          | 6                 |
| prompt_tokens     | 7200              |
| completion_tokens | 1800              |
| total_tokens      | 9000              |
| duration_ms       | 184000            |
| credits_consumed  | 3.2               |

Raw usage payload:

```json
{
  "completion_tokens": 1800,
  "credits_consumed": 3.2,
  "duration_ms": 184000,
  "model": "claude-sonnet-4-6",
  "prompt_tokens": 7200,
  "provider": "bedrock",
  "requests": 6,
  "total_tokens": 9000
}
```

**Run Summary**

```json
{
  "agent_spec_id": "example-evals",
  "execution_target": "cloud",
  "launch_source": "datalayer-core",
  "run_mode": "batch"
}
```

**Run Report**

```json
{
  "interaction": [
    {
      "case": "row-count",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "exact-duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-customers",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "duplicate-rows",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "largest-plan",
      "output": "…",
      "prompt": "…"
    },
    {
      "case": "unique-customers",
      "output": "…",
      "prompt": "…"
    }
  ]
}
```

</details>
