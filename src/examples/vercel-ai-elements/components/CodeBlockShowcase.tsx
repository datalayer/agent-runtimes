/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/vercel-ai-elements/code-block';

const jsCode = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55`;

const pythonCode = `def dijkstra(graph, start):
    distances = {node: float('inf') for node in graph}
    distances[start] = 0
    heap = [(0, start)]
    visited = set()
    
    while heap:
        current_distance, current_node = heapq.heappop(heap)
        if current_node in visited:
            continue
        visited.add(current_node)
        
        for neighbor, weight in graph[current_node].items():
            distance = current_distance + weight
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                heapq.heappush(heap, (distance, neighbor))
    
    return distances`;

const tsxCode = `import React, { useState } from 'react';

const Counter: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};

export default Counter;`;

const sqlCode = `SELECT 
  u.id,
  u.name,
  COUNT(o.id) as order_count,
  SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.active = true
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC
LIMIT 10;`;

export const CodeBlockShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">JavaScript Code Block</h3>
        <CodeBlock code={jsCode} language="javascript">
          <CodeBlockCopyButton
            onCopy={() => console.log('Copied JavaScript code')}
            onError={() => console.error('Failed to copy')}
          />
        </CodeBlock>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Python Code Block</h3>
        <CodeBlock code={pythonCode} language="python">
          <CodeBlockCopyButton
            onCopy={() => console.log('Copied Python code')}
            onError={() => console.error('Failed to copy')}
          />
        </CodeBlock>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          TypeScript/React Code Block
        </h3>
        <CodeBlock code={tsxCode} language="tsx" showLineNumbers>
          <CodeBlockCopyButton
            onCopy={() => console.log('Copied TSX code')}
            onError={() => console.error('Failed to copy')}
          />
        </CodeBlock>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          SQL Code Block with Line Numbers
        </h3>
        <CodeBlock code={sqlCode} language="sql" showLineNumbers>
          <CodeBlockCopyButton
            onCopy={() => console.log('Copied SQL code')}
            onError={() => console.error('Failed to copy')}
          />
        </CodeBlock>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Inline Code</h3>
        <div className="p-4 border rounded-md">
          <p className="text-sm">
            Use the{' '}
            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
              useState
            </code>{' '}
            hook to manage state in React. For side effects, use{' '}
            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
              useEffect
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
