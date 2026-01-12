/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useState } from 'react';
import { MessageShowcase } from './components/MessageShowcase';
import { LoaderShowcase } from './components/LoaderShowcase';
import { CodeBlockShowcase } from './components/CodeBlockShowcase';
import { SuggestionShowcase } from './components/SuggestionShowcase';
import { ShimmerShowcase } from './components/ShimmerShowcase';
import { ArtifactShowcase } from './components/ArtifactShowcase';
import { SourcesShowcase } from './components/SourcesShowcase';
import { PromptInputShowcase } from './components/PromptInputShowcase';
import { ConversationShowcase } from './components/ConversationShowcase';
import { ModelSelectorShowcase } from './components/ModelSelectorShowcase';
import { ReasoningShowcase } from './components/ReasoningShowcase';
import { ToolShowcase } from './components/ToolShowcase';

import './showcase.css';
import '../../../style/base.css';
import '../../../style/showcase-vercel-ai.css';

/**
 * Vercel AI Elements Showcase
 *
 * A comprehensive showcase of all available Vercel AI Elements components.
 * This page displays static examples of each component to demonstrate their
 * visual appearance and basic functionality.
 */
export const VercelAiElementsShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState('message');

  const components = [
    { id: 'message', label: 'Message', component: <MessageShowcase /> },
    {
      id: 'conversation',
      label: 'Conversation',
      component: <ConversationShowcase />,
    },
    {
      id: 'prompt-input',
      label: 'Prompt Input',
      component: <PromptInputShowcase />,
    },
    {
      id: 'model-selector',
      label: 'Model Selector',
      component: <ModelSelectorShowcase />,
    },
    { id: 'artifact', label: 'Artifact', component: <ArtifactShowcase /> },
    { id: 'code-block', label: 'Code Block', component: <CodeBlockShowcase /> },
    {
      id: 'suggestion',
      label: 'Suggestions',
      component: <SuggestionShowcase />,
    },
    { id: 'sources', label: 'Sources', component: <SourcesShowcase /> },
    { id: 'reasoning', label: 'Reasoning', component: <ReasoningShowcase /> },
    { id: 'tool', label: 'Tool', component: <ToolShowcase /> },
    { id: 'loader', label: 'Loader', component: <LoaderShowcase /> },
    { id: 'shimmer', label: 'Shimmer', component: <ShimmerShowcase /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto py-6 px-4 md:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-foreground">
            Vercel AI Elements Showcase
          </h1>
          <p className="text-muted-foreground mt-2">
            A comprehensive collection of all available Vercel AI Elements
            components
          </p>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
        <div className="w-full">
          {/* Tab Navigation */}
          <div className="border-b border-border">
            <nav
              className="flex gap-1 overflow-x-auto"
              aria-label="Component tabs"
            >
              {components.map(component => (
                <button
                  key={component.id}
                  onClick={() => setActiveTab(component.id)}
                  className={`
                    px-4 py-2 text-sm font-medium whitespace-nowrap
                    border-b-2 transition-colors
                    ${
                      activeTab === component.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    }
                  `}
                  aria-current={activeTab === component.id ? 'page' : undefined}
                >
                  {component.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {components.map(component => (
              <div
                key={component.id}
                className={activeTab === component.id ? 'block' : 'hidden'}
                role="tabpanel"
              >
                <div className="border rounded-lg bg-card">
                  <div className="border-b px-6 py-4">
                    <h2 className="text-2xl font-semibold text-foreground">
                      {component.label}
                    </h2>
                    <p className="text-muted-foreground mt-1">
                      Example implementations of the {component.label} component
                    </p>
                  </div>
                  <div className="p-6">
                    <div className="max-h-[calc(100vh-350px)] overflow-y-auto">
                      {component.component}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default VercelAiElementsShowcase;
