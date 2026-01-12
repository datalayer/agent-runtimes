/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Loader } from '@/components/vercel-ai-elements/loader';

export const LoaderShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default Loader</h3>
        <div className="flex items-center justify-center p-8 border rounded-md bg-muted/50">
          <Loader />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Loader Sizes</h3>
        <div className="flex items-center justify-around p-8 border rounded-md gap-4 bg-muted/50">
          <div className="text-center">
            <Loader className="h-4 w-4" />
            <p className="text-sm text-muted-foreground mt-2">Small</p>
          </div>
          <div className="text-center">
            <Loader className="h-6 w-6" />
            <p className="text-sm text-muted-foreground mt-2">Medium</p>
          </div>
          <div className="text-center">
            <Loader className="h-8 w-8" />
            <p className="text-sm text-muted-foreground mt-2">Large</p>
          </div>
          <div className="text-center">
            <Loader className="h-12 w-12" />
            <p className="text-sm text-muted-foreground mt-2">Extra Large</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Loader in Context</h3>
        <div className="space-y-4">
          <div className="p-4 border rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4" />
              <span className="text-sm">Loading your data...</span>
            </div>
          </div>

          <div className="p-4 border rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4" />
              <span className="text-sm">Generating response...</span>
            </div>
          </div>

          <div className="p-4 border rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4" />
              <span className="text-sm">Processing request...</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Centered Loader</h3>
        <div className="h-64 flex items-center justify-center border rounded-md bg-muted/50">
          <div className="text-center">
            <Loader className="h-8 w-8 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading content...</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Inline Loaders</h3>
        <div className="p-4 border rounded-md space-y-2 bg-muted/50">
          <div className="text-sm flex items-center gap-2">
            <Loader className="h-3 w-3" />
            <span>Analyzing data</span>
          </div>
          <div className="text-sm flex items-center gap-2">
            <Loader className="h-3 w-3" />
            <span>Running calculations</span>
          </div>
          <div className="text-sm flex items-center gap-2">
            <Loader className="h-3 w-3" />
            <span>Preparing results</span>
          </div>
        </div>
      </div>
    </div>
  );
};
