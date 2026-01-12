/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/vercel-ai-elements/tool';

const searchParameters = {
  query: 'React hooks tutorial',
  maxResults: 10,
  language: 'en',
};

const searchResults = [
  {
    title: 'React Hooks Documentation',
    url: 'https://react.dev/reference/react',
  },
  { title: 'Complete Guide to React Hooks', url: 'https://example.com/guide' },
  { title: 'React Hooks Tutorial', url: 'https://example.com/tutorial' },
];

const calculatorInput = {
  operation: 'multiply',
  a: 42,
  b: 7,
};

const fileReadInput = {
  path: '/home/user/data.json',
  encoding: 'utf-8',
};

export const ToolShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Tool with Completed Output
        </h3>
        <Tool>
          <ToolHeader
            title="Web Search"
            type="tool-web-search"
            state="output-available"
          />
          <ToolContent>
            <ToolInput input={searchParameters} />
            <ToolOutput output={searchResults} errorText={undefined} />
          </ToolContent>
        </Tool>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Tool with Pending State</h3>
        <Tool>
          <ToolHeader
            title="Generate Text"
            type="tool-generate-text"
            state="input-streaming"
          />
          <ToolContent>
            <ToolInput input={{ prompt: 'Write a poem about coding' }} />
          </ToolContent>
        </Tool>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Tool with Error</h3>
        <Tool>
          <ToolHeader
            title="Read File"
            type="tool-read-file"
            state="output-error"
          />
          <ToolContent>
            <ToolInput input={fileReadInput} />
            <ToolOutput
              output={undefined}
              errorText="File not found: /home/user/data.json"
            />
          </ToolContent>
        </Tool>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Simple Calculator Tool</h3>
        <Tool>
          <ToolHeader
            title="Calculator"
            type="tool-calculator"
            state="output-available"
          />
          <ToolContent>
            <ToolInput input={calculatorInput} />
            <ToolOutput output={{ result: 294 }} errorText={undefined} />
          </ToolContent>
        </Tool>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Tool Execution Sequence</h3>
        <div className="space-y-4">
          <Tool>
            <ToolHeader
              title="Analyze Data"
              type="tool-analyze-data"
              state="output-available"
            />
            <ToolContent>
              <ToolInput input={{ dataset: 'sales_2024.csv' }} />
              <ToolOutput
                output={{
                  rows: 1523,
                  columns: 12,
                  summary:
                    'Dataset contains 1,523 sales records across 12 columns',
                }}
                errorText={undefined}
              />
            </ToolContent>
          </Tool>

          <Tool>
            <ToolHeader
              title="Create Visualization"
              type="tool-create-visualization"
              state="output-available"
            />
            <ToolContent>
              <ToolInput
                input={{
                  type: 'bar_chart',
                  data: 'sales_by_region',
                  title: 'Sales by Region 2024',
                }}
              />
              <ToolOutput
                output={{
                  image_url: 'https://example.com/chart.png',
                  format: 'PNG',
                  size: '1200x800',
                }}
                errorText={undefined}
              />
            </ToolContent>
          </Tool>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Tool with Complex Output</h3>
        <Tool>
          <ToolHeader
            title="Code Analysis"
            type="tool-code-analysis"
            state="output-available"
          />
          <ToolContent>
            <ToolInput
              input={{
                file: 'src/App.tsx',
                checks: ['complexity', 'duplicates', 'security'],
              }}
            />
            <ToolOutput
              output={{
                complexity: 'Low (3.2)',
                duplicates: 0,
                security_issues: [],
                suggestions: [
                  'Consider splitting large components',
                  'Add error boundaries',
                ],
              }}
              errorText={undefined}
            />
          </ToolContent>
        </Tool>
      </div>
    </div>
  );
};
