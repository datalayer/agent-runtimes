/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/vercel-ai-elements/artifact';
import { CodeBlock } from '@/components/vercel-ai-elements/code-block';
import {
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  RefreshCwIcon,
  ShareIcon,
} from 'lucide-react';

const pythonCode = `# Dijkstra's Algorithm implementation
import heapq

def dijkstra(graph, start):
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
    
    return distances

# Example graph
graph = {
    'A': {'B': 1, 'C': 4},
    'B': {'A': 1, 'C': 2, 'D': 5},
    'C': {'A': 4, 'B': 2, 'D': 1},
    'D': {'B': 5, 'C': 1}
}

print(dijkstra(graph, 'A'))`;

const reactCode = `import React, { useState } from 'react';

function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');

  const addTodo = () => {
    if (input.trim()) {
      setTodos([...todos, { id: Date.now(), text: input, done: false }]);
      setInput('');
    }
  };

  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, done: !todo.done } : todo
    ));
  };

  return (
    <div>
      <h1>Todo List</h1>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && addTodo()}
      />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map(todo => (
          <li
            key={todo.id}
            onClick={() => toggleTodo(todo.id)}
            style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
          >
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}`;

export const ArtifactShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Code Artifact</h3>
        <Artifact>
          <ArtifactHeader>
            <div>
              <ArtifactTitle>Dijkstra's Algorithm Implementation</ArtifactTitle>
              <ArtifactDescription>Updated 1 minute ago</ArtifactDescription>
            </div>
            <div className="flex items-center gap-2">
              <ArtifactActions>
                <ArtifactAction
                  icon={PlayIcon}
                  label="Run"
                  onClick={() => console.log('Run')}
                  tooltip="Run code"
                />
                <ArtifactAction
                  icon={CopyIcon}
                  label="Copy"
                  onClick={() => console.log('Copy')}
                  tooltip="Copy to clipboard"
                />
                <ArtifactAction
                  icon={RefreshCwIcon}
                  label="Regenerate"
                  onClick={() => console.log('Regenerate')}
                  tooltip="Regenerate content"
                />
                <ArtifactAction
                  icon={DownloadIcon}
                  label="Download"
                  onClick={() => console.log('Download')}
                  tooltip="Download file"
                />
                <ArtifactAction
                  icon={ShareIcon}
                  label="Share"
                  onClick={() => console.log('Share')}
                  tooltip="Share artifact"
                />
              </ArtifactActions>
            </div>
          </ArtifactHeader>
          <ArtifactContent className="p-0">
            <CodeBlock
              className="border-none"
              code={pythonCode}
              language="python"
              showLineNumbers
            />
          </ArtifactContent>
        </Artifact>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">React Component Artifact</h3>
        <Artifact>
          <ArtifactHeader>
            <div>
              <ArtifactTitle>Todo App Component</ArtifactTitle>
              <ArtifactDescription>
                React component with hooks
              </ArtifactDescription>
            </div>
            <div className="flex items-center gap-2">
              <ArtifactActions>
                <ArtifactAction
                  icon={CopyIcon}
                  label="Copy"
                  onClick={() => console.log('Copy')}
                  tooltip="Copy to clipboard"
                />
                <ArtifactAction
                  icon={DownloadIcon}
                  label="Download"
                  onClick={() => console.log('Download')}
                  tooltip="Download file"
                />
              </ArtifactActions>
            </div>
          </ArtifactHeader>
          <ArtifactContent className="p-0">
            <CodeBlock
              className="border-none"
              code={reactCode}
              language="tsx"
              showLineNumbers
            />
          </ArtifactContent>
        </Artifact>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Document Artifact</h3>
        <Artifact>
          <ArtifactHeader>
            <div>
              <ArtifactTitle>Project Documentation</ArtifactTitle>
              <ArtifactDescription>Generated documentation</ArtifactDescription>
            </div>
            <div className="flex items-center gap-2">
              <ArtifactActions>
                <ArtifactAction
                  icon={CopyIcon}
                  label="Copy"
                  onClick={() => console.log('Copy')}
                  tooltip="Copy to clipboard"
                />
                <ArtifactAction
                  icon={ShareIcon}
                  label="Share"
                  onClick={() => console.log('Share')}
                  tooltip="Share artifact"
                />
              </ArtifactActions>
            </div>
          </ArtifactHeader>
          <ArtifactContent>
            <div className="prose prose-sm max-w-none">
              <h1>Getting Started</h1>
              <p>This guide will help you get started with the project.</p>
              <h2>Installation</h2>
              <p>Install the dependencies using npm:</p>
              <pre>
                <code>npm install</code>
              </pre>
              <h2>Usage</h2>
              <p>Run the development server:</p>
              <pre>
                <code>npm run dev</code>
              </pre>
            </div>
          </ArtifactContent>
        </Artifact>
      </div>
    </div>
  );
};
