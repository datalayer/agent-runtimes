/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/vercel-ai-elements/sources';

const sources = [
  {
    href: 'https://react.dev/learn',
    title: 'React Documentation - Learn React',
    description: 'Official React documentation and tutorials',
  },
  {
    href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    title: 'MDN Web Docs - JavaScript',
    description: 'Comprehensive JavaScript reference',
  },
  {
    href: 'https://www.typescriptlang.org/docs/',
    title: 'TypeScript Documentation',
    description: 'Official TypeScript handbook and reference',
  },
  {
    href: 'https://nodejs.org/docs/',
    title: 'Node.js Documentation',
    description: 'Node.js API and guides',
  },
];

const articleSources = [
  {
    href: 'https://example.com/article1',
    title: 'Understanding Async/Await in JavaScript',
    description: 'A comprehensive guide to asynchronous programming',
  },
  {
    href: 'https://example.com/article2',
    title: 'React Hooks Best Practices',
    description: 'Tips and tricks for using React hooks effectively',
  },
];

export const SourcesShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Multiple Sources</h3>
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source, index) => (
              <Source key={index} href={source.href} title={source.title} />
            ))}
          </SourcesContent>
        </Sources>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Fewer Sources</h3>
        <Sources>
          <SourcesTrigger count={articleSources.length} />
          <SourcesContent>
            {articleSources.map((source, index) => (
              <Source key={index} href={source.href} title={source.title} />
            ))}
          </SourcesContent>
        </Sources>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Single Source</h3>
        <Sources>
          <SourcesTrigger count={1} />
          <SourcesContent>
            <Source href={sources[0].href} title={sources[0].title} />
          </SourcesContent>
        </Sources>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Sources in Context</h3>
        <div className="p-4 border rounded-md space-y-4">
          <p className="text-sm">
            React hooks are a powerful feature introduced in React 16.8 that
            allow you to use state and other React features without writing a
            class.
          </p>
          <Sources>
            <SourcesTrigger count={sources.length}>
              View {sources.length} sources
            </SourcesTrigger>
            <SourcesContent>
              {sources.map((source, index) => (
                <Source key={index} href={source.href} title={source.title} />
              ))}
            </SourcesContent>
          </Sources>
        </div>
      </div>
    </div>
  );
};
