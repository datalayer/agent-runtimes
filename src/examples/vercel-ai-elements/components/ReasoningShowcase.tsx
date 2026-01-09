/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/vercel-ai-elements/reasoning';

const reasoningSteps = `## Step 1: Understanding the Problem
First, I need to understand what the user is asking for. They want to know about React hooks.

## Step 2: Identifying Key Concepts
React hooks are functions that let you use state and lifecycle features in functional components.

## Step 3: Structuring the Response
I should explain:
- What hooks are
- Why they were introduced
- The most commonly used hooks
- Best practices

## Step 4: Providing Examples
Include code examples for useState and useEffect to make it concrete.

## Step 5: Final Review
Ensure the explanation is clear, concise, and helpful.`;

const complexReasoning = `## Analysis Phase

### 1. Problem Decomposition
Breaking down the complex algorithm into smaller, manageable steps:
- Input validation
- Data structure selection
- Core algorithm implementation
- Edge case handling

### 2. Complexity Consideration
Time complexity: O(n log n)
Space complexity: O(n)

### 3. Trade-offs
- Memory vs Speed: Chose to prioritize speed with additional memory
- Readability vs Performance: Optimized for readability first

## Implementation Phase

### 4. Algorithm Selection
Selected Dijkstra's algorithm because:
- Optimal for single-source shortest path
- Well-tested and reliable
- Efficient for sparse graphs

### 5. Optimization Opportunities
- Use of heap data structure for efficiency
- Early termination when target is reached
- Path reconstruction capabilities

## Validation Phase

### 6. Test Cases Considered
- Empty graph
- Single node
- Disconnected components
- Negative weights (not applicable)

### 7. Final Verification
Confirmed algorithm correctness through:
- Unit testing
- Edge case validation
- Performance benchmarking`;

export const ReasoningShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Basic Reasoning Display</h3>
        <Reasoning>
          <ReasoningTrigger>Show reasoning (5 steps, 2.3s)</ReasoningTrigger>
          <ReasoningContent>{reasoningSteps}</ReasoningContent>
        </Reasoning>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Complex Reasoning Process
        </h3>
        <Reasoning>
          <ReasoningTrigger>
            Show detailed reasoning (7 steps, 4.1s)
          </ReasoningTrigger>
          <ReasoningContent>{complexReasoning}</ReasoningContent>
        </Reasoning>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Reasoning in Message Context
        </h3>
        <div className="p-4 border rounded-md space-y-4">
          <p className="text-sm font-semibold">
            Here's the solution to your algorithm problem:
          </p>
          <Reasoning>
            <ReasoningTrigger>View my reasoning process</ReasoningTrigger>
            <ReasoningContent>{reasoningSteps}</ReasoningContent>
          </Reasoning>
          <div className="mt-4">
            <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
              <code>{`function solution(arr) {
  return arr.sort((a, b) => a - b);
}`}</code>
            </pre>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Quick Reasoning</h3>
        <Reasoning>
          <ReasoningTrigger>Show reasoning (2 steps, 0.8s)</ReasoningTrigger>
          <ReasoningContent>
            Step 1: Analyzed the input requirements. Step 2: Generated the
            optimal solution.
          </ReasoningContent>
        </Reasoning>
      </div>
    </div>
  );
};
