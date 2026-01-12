/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Suggestion,
  Suggestions,
} from '@/components/vercel-ai-elements/suggestion';
import { useState } from 'react';

const suggestions = [
  'What are the latest trends in AI?',
  'How does machine learning work?',
  'Explain quantum computing',
  'Best practices for React development',
  'Tell me about TypeScript benefits',
  'How to optimize database queries?',
  'What is the difference between SQL and NoSQL?',
  'Explain cloud computing basics',
];

const codingSuggestions = [
  'Show me a React component example',
  'How to use async/await in JavaScript?',
  'Explain Git branching strategies',
  'What are design patterns?',
];

export const SuggestionShowcase = () => {
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  );

  const handleSuggestionClick = (suggestion: string) => {
    setSelectedSuggestion(suggestion);
    console.log('Selected suggestion:', suggestion);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Full Suggestion Grid</h3>
        <Suggestions>
          {suggestions.map(suggestion => (
            <Suggestion
              key={suggestion}
              onClick={handleSuggestionClick}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </div>

      {selectedSuggestion && (
        <div className="p-4 border rounded-md bg-muted">
          <p className="text-sm">
            <strong>Selected:</strong> {selectedSuggestion}
          </p>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-4">Fewer Suggestions</h3>
        <Suggestions>
          {suggestions.slice(0, 4).map(suggestion => (
            <Suggestion
              key={suggestion}
              onClick={handleSuggestionClick}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Single Row of Suggestions
        </h3>
        <Suggestions>
          {suggestions.slice(0, 3).map(suggestion => (
            <Suggestion
              key={suggestion}
              onClick={handleSuggestionClick}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Coding-Specific Suggestions
        </h3>
        <Suggestions>
          {codingSuggestions.map(suggestion => (
            <Suggestion
              key={suggestion}
              onClick={handleSuggestionClick}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </div>
    </div>
  );
};
