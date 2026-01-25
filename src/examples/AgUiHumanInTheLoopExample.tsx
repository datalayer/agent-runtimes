/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiHumanInTheLoopExample
 *
 * Demonstrates a floating chat popup that connects to the AG-UI
 * Human in the Loop example backend. This shows how to implement
 * approval workflows where the human must approve generated plans.
 *
 * Backend: /api/v1/examples/human_in_the_loop/
 *
 * Pattern: Uses renderToolResult with respond callback for human-in-the-loop
 * interactions, matching the CopilotKit useHumanInTheLoop pattern.
 */

import React, { useState, useEffect } from 'react';
import {
  Text,
  Checkbox,
  FormControl,
  Label,
  ProgressBar,
  Button,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating, type ToolCallRenderContext } from '../components/chat';
import {
  TasklistIcon,
  CheckCircleFillIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';

// AG-UI endpoint for human in the loop example
const HUMAN_IN_THE_LOOP_ENDPOINT =
  'http://localhost:8765/api/v1/examples/human_in_the_loop/';

// Types for task steps (ag-ui standard)
interface TaskStep {
  description: string;
  status: 'enabled' | 'disabled' | 'executing';
}

/**
 * StepsFeedback Component
 *
 * Renders the task steps with Reject/Confirm buttons.
 * Matches the CopilotKit pattern for human-in-the-loop tool rendering.
 */
const StepsFeedback: React.FC<{
  args: Record<string, unknown>;
  status: ToolCallRenderContext['status'];
  respond?: (result: unknown) => void;
  result?: unknown;
}> = ({ args, status, respond, result }) => {
  const [localSteps, setLocalSteps] = useState<TaskStep[]>([]);
  const [accepted, setAccepted] = useState<boolean | null>(null);

  // Helper to normalize steps - handles both string[] and TaskStep[]
  const normalizeSteps = (rawSteps: unknown): TaskStep[] => {
    if (!rawSteps || !Array.isArray(rawSteps)) return [];
    return rawSteps.map(step => {
      // Handle string steps (from tool args)
      if (typeof step === 'string') {
        return { description: step, status: 'enabled' as const };
      }
      // Handle TaskStep objects (from state snapshot)
      return {
        description: step.description || '',
        status: step.status || 'enabled',
      };
    });
  };

  // Initialize local steps when status becomes executing
  useEffect(() => {
    if (status === 'executing' && localSteps.length === 0) {
      const normalized = normalizeSteps(args.steps);
      if (normalized.length > 0) {
        setLocalSteps(normalized);
      }
    }
  }, [status, args.steps, localSteps.length]);

  // Check if result has accepted status (for completed state)
  useEffect(() => {
    if (status === 'complete' && result && accepted === null) {
      const r = result as { accepted?: boolean };
      if (typeof r.accepted === 'boolean') {
        setAccepted(r.accepted);
      }
    }
  }, [status, result, accepted]);

  const normalizedSteps = normalizeSteps(args.steps);
  if (normalizedSteps.length === 0) {
    return null;
  }

  const displaySteps = localSteps.length > 0 ? localSteps : normalizedSteps;
  const enabledCount = displaySteps.filter(s => s.status === 'enabled').length;
  const progress =
    displaySteps.length > 0 ? (enabledCount / displaySteps.length) * 100 : 0;

  const handleStepToggle = (index: number) => {
    setLocalSteps(prev =>
      prev.map((step, i) =>
        i === index
          ? {
              ...step,
              status: step.status === 'enabled' ? 'disabled' : 'enabled',
            }
          : step,
      ),
    );
  };

  const handleReject = () => {
    if (respond) {
      setAccepted(false);
      respond({ accepted: false });
    }
  };

  const handleConfirm = () => {
    if (respond) {
      setAccepted(true);
      respond({
        accepted: true,
        steps: localSteps.filter(step => step.status === 'enabled'),
      });
    }
  };

  return (
    <Box
      data-testid="select-steps"
      sx={{
        width: '100%',
        padding: 3,
        backgroundColor: 'canvas.subtle',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'border.default',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TasklistIcon size={16} />
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>Select Steps</Text>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {enabledCount}/{displaySteps.length} Selected
          </Text>
          <Label
            variant={status === 'executing' ? 'accent' : 'secondary'}
            size="small"
          >
            {status === 'executing' ? 'Ready' : 'Waiting'}
          </Label>
        </Box>
      </Box>

      {/* Progress bar */}
      <ProgressBar progress={progress} barSize="small" sx={{ mb: 3 }} />

      {/* Steps list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        {displaySteps.map((step, index) => (
          <Box
            key={index}
            data-testid="step-item"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 2,
              borderRadius: 2,
              backgroundColor:
                step.status === 'enabled' ? 'success.subtle' : 'canvas.default',
              border: '1px solid',
              borderColor:
                step.status === 'enabled' ? 'success.muted' : 'border.muted',
              opacity: status !== 'executing' ? 0.7 : 1,
              cursor: status === 'executing' ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
            }}
            onClick={() => status === 'executing' && handleStepToggle(index)}
          >
            <FormControl disabled={status !== 'executing'}>
              <Checkbox
                checked={step.status === 'enabled'}
                onChange={() => handleStepToggle(index)}
                disabled={status !== 'executing'}
              />
            </FormControl>
            <Text
              data-testid="step-text"
              sx={{
                flex: 1,
                fontSize: 1,
                textDecoration:
                  step.status === 'disabled' ? 'line-through' : 'none',
                color: step.status === 'disabled' ? 'fg.muted' : 'fg.default',
              }}
            >
              {step.description}
            </Text>
            {step.status === 'enabled' && (
              <CheckCircleFillIcon size={16} className="color-fg-success" />
            )}
          </Box>
        ))}
      </Box>

      {/* Action buttons - only show when executing and not yet responded */}
      {accepted === null && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 3 }}>
          <Button
            variant="default"
            disabled={status !== 'executing'}
            onClick={handleReject}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <XCircleFillIcon size={14} />
            Reject
          </Button>
          <Button
            variant="primary"
            disabled={status !== 'executing'}
            onClick={handleConfirm}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              backgroundColor: 'success.emphasis',
              '&:hover': {
                backgroundColor: 'success.emphasis',
              },
            }}
          >
            <CheckCircleFillIcon size={14} />
            Confirm
            <Label
              variant="accent"
              size="small"
              sx={{ ml: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              {enabledCount}
            </Label>
          </Button>
        </Box>
      )}

      {/* Result state - show after responding */}
      {accepted !== null && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 4,
              py: 2,
              borderRadius: 2,
              backgroundColor: accepted ? 'success.subtle' : 'danger.subtle',
              border: '1px solid',
              borderColor: accepted ? 'success.muted' : 'danger.muted',
            }}
          >
            {accepted ? (
              <>
                <CheckCircleFillIcon size={16} className="color-fg-success" />
                <Text sx={{ fontWeight: 'semibold', color: 'success.fg' }}>
                  Accepted
                </Text>
              </>
            ) : (
              <>
                <XCircleFillIcon size={16} className="color-fg-danger" />
                <Text sx={{ fontWeight: 'semibold', color: 'danger.fg' }}>
                  Rejected
                </Text>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * Render function for the generate_task_steps tool
 *
 * This matches the CopilotKit pattern where:
 * - args: Tool arguments (the steps array)
 * - status: 'inProgress' | 'executing' | 'complete' | 'error'
 * - respond: Callback to send result back (only when status === 'executing')
 * - result: Tool result (only when status === 'complete')
 */
const renderTaskStepsTool = (context: ToolCallRenderContext) => {
  const { toolName, args, status, respond, result } = context;

  // Only render for the generate_task_steps tool
  if (toolName !== 'generate_task_steps') {
    return null;
  }

  return (
    <StepsFeedback
      args={args}
      status={status}
      respond={respond}
      result={result}
    />
  );
};

/**
 * AgUiHumanInTheLoopExample Component
 *
 * Demonstrates human-in-the-loop approval patterns with AG-UI.
 * The agent generates task steps that require human approval before proceeding.
 *
 * Features demonstrated:
 * - Tool call rendering with Reject/Confirm buttons
 * - respond callback for sending user decisions back to the agent
 * - UI state changes based on user actions
 */
const AgUiHumanInTheLoopExample: React.FC = () => {
  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
          padding: 4,
        }}
      >
        {/* Page content */}
        <Box
          sx={{
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <Text
            as="h1"
            sx={{
              fontSize: 4,
              fontWeight: 'bold',
              marginBottom: 2,
            }}
          >
            AG-UI: Human in the Loop Example
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            This example demonstrates human review workflows. Ask the AI to
            create a plan, then use the Reject/Confirm buttons to respond.
          </Text>

          {/* About section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              About This Example
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              This demonstrates the "Human in the Loop" pattern where
              AI-generated task plans require human approval before proceeding.
              The pattern follows CopilotKit's useHumanInTheLoop hook.
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', marginTop: 2 }}>
              <strong>How it works:</strong>
            </Text>
            <Box as="ul" sx={{ fontSize: 1, color: 'fg.muted', mt: 1, pl: 3 }}>
              <li>The agent calls the generate_task_steps tool</li>
              <li>A custom UI renders with toggleable steps</li>
              <li>User clicks Reject or Confirm to send response back</li>
              <li>The UI updates to show Rejected or Accepted state</li>
            </Box>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', marginTop: 2 }}>
              <strong>Try:</strong> "Create a plan to learn machine learning" or
              "Plan a trip to Paris in 5 steps"
            </Text>
          </Box>

          {/* Instructions */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'accent.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'accent.muted',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              Key Concept: respond() Callback
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.default' }}>
              The <code>renderToolResult</code> function receives a{' '}
              <code>respond</code> callback when the tool status is "executing".
              Calling <code>respond({'{ accepted: true, steps: [...] }'})</code>{' '}
              sends the user's decision back to the agent, completing the
              human-in-the-loop interaction.
            </Text>
          </Box>
        </Box>

        {/* Floating chat with tool rendering */}
        <ChatFloating
          endpoint={HUMAN_IN_THE_LOOP_ENDPOINT}
          title="Task Planner"
          description="I can help you plan tasks. I'll generate steps for your review."
          position="bottom-right"
          brandColor="#059669"
          renderToolResult={renderTaskStepsTool}
          hideMessagesAfterToolUI={true}
          suggestions={[
            {
              title: 'Plan a trip',
              message: 'Plan a weekend trip to Paris.',
            },
            {
              title: 'Organize party',
              message: 'Plan a birthday party for next Saturday.',
            },
          ]}
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgUiHumanInTheLoopExample;
