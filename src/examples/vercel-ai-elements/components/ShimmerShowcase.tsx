/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Shimmer } from '@/components/vercel-ai-elements/shimmer';

export const ShimmerShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default Shimmer</h3>
        <div className="p-8 border rounded-md bg-background flex items-center justify-center">
          <Shimmer>This text has a shimmer effect</Shimmer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Shimmer Heading</h3>
        <div className="p-8 border rounded-md bg-background flex items-center justify-center">
          <Shimmer as="h1" className="font-bold text-4xl">
            Large Heading with Shimmer
          </Shimmer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Different Shimmer Speeds</h3>
        <div className="p-8 border rounded-md bg-background space-y-4">
          <Shimmer duration={1}>Fast shimmer (1 second)</Shimmer>
          <Shimmer duration={2}>Normal shimmer (2 seconds)</Shimmer>
          <Shimmer duration={4}>Slow shimmer (4 seconds)</Shimmer>
          <Shimmer duration={6}>Very slow shimmer (6 seconds)</Shimmer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Different Shimmer Spreads
        </h3>
        <div className="p-8 border rounded-md bg-background space-y-4">
          <Shimmer spread={1}>Narrow spread (1)</Shimmer>
          <Shimmer spread={2}>Medium spread (2)</Shimmer>
          <Shimmer spread={4}>Wide spread (4)</Shimmer>
          <Shimmer spread={6}>Very wide spread (6)</Shimmer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Combined Effects</h3>
        <div className="p-8 border rounded-md bg-background flex items-center justify-center">
          <Shimmer duration={3} spread={3} className="text-2xl font-bold">
            Slower shimmer with wider spread
          </Shimmer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Shimmer in Different Contexts
        </h3>
        <div className="p-8 border rounded-md bg-background space-y-6">
          <div>
            <Shimmer as="h2" className="text-2xl font-bold mb-2">
              Section Title
            </Shimmer>
            <p className="text-sm text-muted-foreground">
              Regular text beneath a shimmering heading
            </p>
          </div>

          <div className="flex gap-4">
            <Shimmer className="px-4 py-2 bg-primary text-primary-foreground rounded">
              Button Text
            </Shimmer>
            <Shimmer className="px-4 py-2 border rounded">
              Outlined Button
            </Shimmer>
          </div>

          <div className="bg-muted p-4 rounded">
            <Shimmer className="text-sm">
              This is a shimmer effect inside a card component
            </Shimmer>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Loading States with Shimmer
        </h3>
        <div className="p-8 border rounded-md bg-background space-y-3">
          <Shimmer className="h-4 w-full bg-muted rounded">Loading...</Shimmer>
          <Shimmer className="h-4 w-3/4 bg-muted rounded">Loading...</Shimmer>
          <Shimmer className="h-4 w-5/6 bg-muted rounded">Loading...</Shimmer>
          <Shimmer className="h-4 w-2/3 bg-muted rounded">Loading...</Shimmer>
        </div>
      </div>
    </div>
  );
};
