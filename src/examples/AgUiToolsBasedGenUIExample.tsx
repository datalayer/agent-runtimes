/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiToolsBasedGenUIExample
 *
 * Demonstrates tool-based generative UI where the backend calls tools
 * that render UI components. Unlike frontend tools, these are backend
 * tools that return structured data to be rendered on the frontend.
 *
 * Backend: /api/v1/examples/agentic_generative_ui/
 */

import React, { useState, useCallback } from 'react';
import { Text, ProgressBar, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating } from '../components/chat';
import {
  CheckCircleIcon,
  CircleIcon,
  DotFillIcon,
  CheckIcon,
  XIcon,
} from '@primer/octicons-react';

// AG-UI endpoint for agentic generative UI example
const AGENTIC_GENERATIVE_UI_ENDPOINT =
  'http://localhost:8765/api/v1/examples/agentic_generative_ui/';

// Types for plan state - matches ag-ui protocol
interface PlanStep {
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  enabled?: boolean; // For user selection
}

interface PlanState {
  steps: PlanStep[];
}

/**
 * PlanStepItem Component
 * Renders a single plan step with status indicator and optional click handler
 */
const PlanStepItem: React.FC<{
  step: PlanStep;
  index: number;
  onClick?: () => void;
  isInteractive?: boolean;
}> = ({ step, index, onClick, isInteractive = false }) => {
  const statusIcon = {
    pending: <CircleIcon size={16} />,
    in_progress: <DotFillIcon size={16} />,
    completed: <CheckCircleIcon size={16} />,
  };

  const statusColor = {
    pending: 'fg.muted',
    in_progress: 'attention.fg',
    completed: 'success.fg',
  };

  const isEnabled = step.enabled !== false;

  return (
    <Box
      as={isInteractive ? 'button' : 'div'}
      onClick={isInteractive ? onClick : undefined}
      sx={{
        display: 'flex',
        gap: 2,
        padding: 3,
        borderRadius: 2,
        backgroundColor:
          step.status === 'in_progress'
            ? 'attention.subtle'
            : step.status === 'completed'
              ? 'success.subtle'
              : isEnabled
                ? 'canvas.subtle'
                : 'canvas.default',
        border: '1px solid',
        borderColor:
          step.status === 'in_progress'
            ? 'attention.muted'
            : step.status === 'completed'
              ? 'success.muted'
              : isEnabled
                ? 'border.default'
                : 'border.muted',
        cursor: isInteractive ? 'pointer' : 'default',
        opacity: isEnabled ? 1 : 0.6,
        transition: 'all 0.2s ease',
        textAlign: 'left',
        width: '100%',
        '&:hover': isInteractive
          ? {
              backgroundColor:
                step.status === 'completed' ? 'success.subtle' : 'canvas.inset',
              borderColor: 'accent.muted',
            }
          : {},
      }}
    >
      {/* Status/Checkbox indicator */}
      <Box
        sx={{
          color: statusColor[step.status],
          flexShrink: 0,
          marginTop: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
        }}
      >
        {isInteractive ? (
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: 1,
              border: '2px solid',
              borderColor: isEnabled ? 'accent.fg' : 'border.muted',
              backgroundColor: isEnabled ? 'accent.fg' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isEnabled && <CheckIcon size={12} fill="white" />}
          </Box>
        ) : (
          statusIcon[step.status]
        )}
      </Box>

      {/* Step content */}
      <Box sx={{ flex: 1 }}>
        <Text
          sx={{
            fontWeight: 'medium',
            fontSize: 1,
            textDecoration: !isEnabled ? 'line-through' : 'none',
            color: !isEnabled ? 'fg.muted' : 'fg.default',
          }}
        >
          {index + 1}. {step.description}
        </Text>
      </Box>

      {/* Status badge */}
      {step.status !== 'pending' && (
        <Box
          sx={{
            fontSize: 0,
            color: step.status === 'completed' ? 'success.fg' : 'attention.fg',
            textTransform: 'capitalize',
          }}
        >
          {step.status === 'in_progress' ? 'In Progress' : step.status}
        </Box>
      )}
    </Box>
  );
};

/**
 * PlanDisplay Component
 * Renders the full plan with progress, clickable items, and Confirm/Reject buttons
 */
const PlanDisplay: React.FC<{
  plan: PlanState | null;
  isInteractive?: boolean;
  onStepToggle?: (index: number) => void;
  onConfirm?: () => void;
  onReject?: () => void;
  decision?: 'confirmed' | 'rejected' | null;
}> = ({
  plan,
  isInteractive = true,
  onStepToggle,
  onConfirm,
  onReject,
  decision,
}) => {
  if (!plan) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          padding: 5,
          color: 'fg.muted',
          border: '2px dashed',
          borderColor: 'border.muted',
          borderRadius: 2,
        }}
      >
        <Text sx={{ fontSize: 2, display: 'block', marginBottom: 2 }}>
          📋 No plan created yet
        </Text>
        <Text sx={{ fontSize: 1, display: 'block' }}>
          Ask the AI to create a plan for you.
        </Text>
        <Text
          sx={{
            fontSize: 0,
            display: 'block',
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          Try: &quot;Create a plan to learn machine learning&quot;
        </Text>
      </Box>
    );
  }

  const enabledSteps = plan.steps.filter(s => s.enabled !== false).length;
  const completedSteps = plan.steps.filter(
    s => s.status === 'completed',
  ).length;
  const totalSteps = plan.steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <Box>
      {/* Header with progress */}
      <Box sx={{ marginBottom: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2,
          }}
        >
          <Text
            sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.default' }}
          >
            Select Steps
          </Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {isInteractive
              ? `${enabledSteps}/${totalSteps} selected`
              : `${completedSteps}/${totalSteps} completed`}
          </Text>
        </Box>
        <ProgressBar progress={progress} />
      </Box>

      {/* Step items */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: 4,
        }}
      >
        {plan.steps.map((step, index) => (
          <PlanStepItem
            key={index}
            step={step}
            index={index}
            isInteractive={isInteractive && !decision}
            onClick={() => onStepToggle?.(index)}
          />
        ))}
      </Box>

      {/* Action buttons */}
      {isInteractive && !decision && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 3,
            paddingTop: 3,
            borderTop: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Button variant="danger" onClick={onReject} size="large">
            <XIcon size={16} />
            <Text sx={{ marginLeft: 1 }}>Reject</Text>
          </Button>
          <Button variant="primary" onClick={onConfirm} size="large">
            <CheckIcon size={16} />
            <Text sx={{ marginLeft: 1 }}>Confirm ({enabledSteps})</Text>
          </Button>
        </Box>
      )}

      {/* Decision feedback */}
      {decision && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            padding: 3,
            backgroundColor:
              decision === 'confirmed' ? 'success.subtle' : 'danger.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor:
              decision === 'confirmed' ? 'success.muted' : 'danger.muted',
          }}
        >
          <Text
            sx={{
              fontWeight: 'semibold',
              color: decision === 'confirmed' ? 'success.fg' : 'danger.fg',
            }}
          >
            {decision === 'confirmed'
              ? `✓ Plan confirmed with ${enabledSteps} steps`
              : '✗ Plan rejected'}
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * AgUiToolsBasedGenUIExample Component
 *
 * Demonstrates tool-based generative UI with AG-UI.
 * The agent uses tools (create_plan, update_plan_step) that emit
 * STATE_SNAPSHOT and STATE_DELTA events to update the UI.
 *
 * Features demonstrated:
 * - STATE_SNAPSHOT events for full state updates
 * - STATE_DELTA events with JSON Patch for incremental updates
 * - Real-time UI updates as agent works
 * - Interactive step selection with Confirm/Reject buttons
 */
const AgUiToolsBasedGenUIExample: React.FC = () => {
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [decision, setDecision] = useState<'confirmed' | 'rejected' | null>(
    null,
  );

  // Handle state updates from AG-UI events
  const handleStateUpdate = useCallback((state: unknown) => {
    const s = state as PlanState;
    if (s && s.steps && Array.isArray(s.steps)) {
      // Initialize enabled state for new steps
      const stepsWithEnabled = s.steps.map(step => ({
        ...step,
        enabled: step.enabled !== undefined ? step.enabled : true,
      }));
      setPlan({ steps: stepsWithEnabled });
      // Reset decision when new plan arrives
      setDecision(null);
    }
  }, []);

  // Toggle step enabled state
  const handleStepToggle = useCallback((index: number) => {
    setPlan(prev => {
      if (!prev) return prev;
      const newSteps = [...prev.steps];
      newSteps[index] = {
        ...newSteps[index],
        enabled: !newSteps[index].enabled,
      };
      return { steps: newSteps };
    });
  }, []);

  // Confirm the plan
  const handleConfirm = useCallback(() => {
    setDecision('confirmed');
    // Here you could send the confirmed steps back to the agent
    console.log(
      'Plan confirmed with steps:',
      plan?.steps.filter(s => s.enabled !== false).map(s => s.description),
    );
  }, [plan]);

  // Reject the plan
  const handleReject = useCallback(() => {
    setDecision('rejected');
    console.log('Plan rejected');
  }, []);

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
            AG-UI: Tool-Based Generative UI Example
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            Watch the AI create and update a plan in real-time using
            STATE_SNAPSHOT and STATE_DELTA events.
          </Text>

          {/* Plan display panel */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
              minHeight: '300px',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 3 }}
            >
              Generated Plan
            </Text>
            <PlanDisplay
              plan={plan}
              isInteractive={true}
              onStepToggle={handleStepToggle}
              onConfirm={handleConfirm}
              onReject={handleReject}
              decision={decision}
            />
          </Box>

          {/* About section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              About This Example
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              This example shows how AG-UI enables tool-based generative UI. The
              agent has two tools: <code>create_plan</code> emits a
              STATE_SNAPSHOT with the full plan, and{' '}
              <code>update_plan_step</code> emits STATE_DELTA events with JSON
              Patch operations for efficient incremental updates.
            </Text>
            <Box sx={{ marginTop: 3 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'medium' }}>
                AG-UI Events Used:
              </Text>
              <Box
                as="ul"
                sx={{
                  paddingLeft: 3,
                  marginTop: 1,
                  fontSize: 1,
                  color: 'fg.muted',
                }}
              >
                <li>STATE_SNAPSHOT - Full state replacement</li>
                <li>STATE_DELTA - Incremental JSON Patch updates (RFC 6902)</li>
                <li>
                  TOOL_CALL_START / TOOL_CALL_END - Tool execution tracking
                </li>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Floating chat */}
        <ChatFloating
          endpoint={AGENTIC_GENERATIVE_UI_ENDPOINT}
          title="Plan Generator"
          description="I can create detailed plans and update them in real-time."
          position="bottom-right"
          brandColor="#0969da"
          onStateUpdate={handleStateUpdate}
          suggestions={[
            {
              title: 'Project plan',
              message: 'Create a project plan for building a mobile app.',
            },
            {
              title: 'Marketing strategy',
              message:
                'Generate a marketing strategy for a new product launch.',
            },
          ]}
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgUiToolsBasedGenUIExample;
