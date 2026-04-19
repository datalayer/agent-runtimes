/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { Button, Heading, Label, Spinner, Text } from '@primer/react';
import { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { Form, yamlSchemaToJsonSchema } from '@datalayer/primer-rjsf';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { ErrorView } from './components';
import { Chat } from '../chat';

setupPrimerPortals();

const BASE_URL = 'http://localhost:8765';
const AGENT_SPEC_ID = 'demo-parameters';
const AGENT_NAME = 'parameters-demo';

type LibrarySpecResponse = {
  parameters?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeJsonSchema(value: unknown): value is RJSFSchema {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.type === 'string' ||
    isRecord(value.properties) ||
    Array.isArray(value.required)
  );
}

function unwrapTypedLiterals(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(unwrapTypedLiterals);
  }

  if (!isRecord(value)) {
    return value;
  }

  const keys = Object.keys(value);
  const hasTypedDefault =
    typeof value.type === 'string' && 'default' in value && keys.length <= 2;

  if (hasTypedDefault) {
    return unwrapTypedLiterals(value.default);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    normalized[key] = unwrapTypedLiterals(nested);
  }
  return normalized;
}

function hasWrappedSchemaLiterals(value: RJSFSchema): boolean {
  const schema = value as Record<string, unknown>;
  const typeIsWrapped = isRecord(schema.type);
  const requiredHasWrapped =
    Array.isArray(schema.required) &&
    schema.required.some(item => isRecord(item));
  return typeIsWrapped || requiredHasWrapped;
}

function toRjsfSchema(parameters: unknown): RJSFSchema {
  if (looksLikeJsonSchema(parameters)) {
    return parameters;
  }

  const converted = yamlSchemaToJsonSchema(parameters ?? {});
  if (hasWrappedSchemaLiterals(converted)) {
    return unwrapTypedLiterals(converted) as RJSFSchema;
  }

  return converted;
}

function collectTopLevelDefaults(schema: RJSFSchema): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : {};

  for (const [key, value] of Object.entries(properties)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'default' in value
    ) {
      defaults[key] = (value as { default: unknown }).default;
    }
  }

  return defaults;
}

function hasRequiredValues(
  schema: RJSFSchema | null,
  formData: Record<string, unknown>,
): boolean {
  if (
    !schema ||
    !Array.isArray(schema.required) ||
    schema.required.length === 0
  ) {
    return true;
  }

  return schema.required.every(fieldName => {
    if (typeof fieldName !== 'string') {
      return true;
    }
    const value = formData[fieldName];
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  });
}

const AgentParametersExample: React.FC = () => {
  const [showSchemaForm, setShowSchemaForm] = useState(false);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [agentId, setAgentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formTouched, setFormTouched] = useState(false);

  const hasRequired = useMemo(
    () => hasRequiredValues(schema, formData),
    [schema, formData],
  );

  const canLaunch = useMemo(() => {
    return showSchemaForm && schema !== null && !isSchemaLoading && hasRequired;
  }, [schema, showSchemaForm, isSchemaLoading, hasRequired]);

  const loadSchemaForm = async () => {
    if (schema) {
      setShowSchemaForm(true);
      return;
    }

    setIsSchemaLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BASE_URL}/api/v1/agents/library/${AGENT_SPEC_ID}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load schema: ${response.status}`);
      }

      const data = (await response.json()) as LibrarySpecResponse;
      const convertedSchema = toRjsfSchema(data.parameters ?? {});
      setSchema(convertedSchema);
      setFormData(collectTopLevelDefaults(convertedSchema));
      setShowSchemaForm(true);
      setFormTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema');
    } finally {
      setIsSchemaLoading(false);
    }
  };

  const launchAgent = async () => {
    if (!canLaunch) {
      return;
    }
    setIsCreating(true);
    setError(null);

    try {
      const name = uniqueAgentId(AGENT_NAME);
      const response = await fetch(`${BASE_URL}/api/v1/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          agent_spec_id: AGENT_SPEC_ID,
          transport: 'vercel-ai',
          agent_parameters: formData,
        }),
      });

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          data.detail || `Failed to create agent: ${response.status}`,
        );
      }

      const data = await response.json();
      setAgentId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch agent');
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (!agentId) {
        return;
      }
      void fetch(`${BASE_URL}/api/v1/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore teardown failures in example mode.
      });
    };
  }, [agentId]);

  if (!agentId) {
    return (
      <ThemedProvider>
        <Box
          sx={{
            maxWidth: 760,
            mx: 'auto',
            mt: 6,
            px: 3,
            py: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            bg: 'canvas.subtle',
          }}
        >
          <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
            CONFIGURE AGENT
          </Text>

          <Heading as="h2" sx={{ fontSize: 2 }}>
            Launch Parameterized Agent
          </Heading>
          <Text sx={{ color: 'fg.muted', fontSize: 1, maxWidth: 620 }}>
            Load the runtime schema directly from demo-parameters, fill the
            generated form, then launch with validated parameters.
          </Text>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Label variant="accent">Spec: {AGENT_SPEC_ID}</Label>
            <Label variant="secondary">Transport: vercel-ai</Label>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="small"
              type="button"
              onClick={loadSchemaForm}
              disabled={isSchemaLoading}
            >
              {isSchemaLoading ? (
                <>
                  <Spinner size="small" /> Loading Schema...
                </>
              ) : (
                'Show Parameter Form'
              )}
            </Button>
            {schema && (
              <Button
                variant="invisible"
                size="small"
                type="button"
                onClick={() => {
                  setShowSchemaForm(v => !v);
                }}
              >
                {showSchemaForm ? 'Hide Form' : 'Show Form'}
              </Button>
            )}
          </Box>

          {schema && (
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                alignItems: 'center',
                py: 2,
                px: 3,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.subtle',
              }}
            >
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                Required fields:{' '}
                {Array.isArray(schema.required) ? schema.required.length : 0}
              </Text>
              <Label variant={hasRequired ? 'success' : 'attention'}>
                {hasRequired ? 'Ready to launch' : 'Complete required fields'}
              </Label>
            </Box>
          )}

          {showSchemaForm && schema && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                p: 2,
                bg: 'canvas.default',
              }}
            >
              <Form
                schema={schema}
                formData={formData}
                uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
                validator={validator}
                onChange={({ formData: nextData }) => {
                  setFormTouched(true);
                  setFormData((nextData as Record<string, unknown>) ?? {});
                }}
                onSubmit={(_, event) => {
                  event?.preventDefault();
                  event?.stopPropagation();
                  // Prevent implicit form submission; launching is click-only.
                }}
                noHtml5Validate
              />
            </Box>
          )}

          <Button
            variant="primary"
            size="small"
            type="button"
            onClick={launchAgent}
            disabled={!canLaunch || isCreating}
            sx={{ width: '100%' }}
          >
            {isCreating ? (
              <>
                <Spinner size="small" /> Launching...
              </>
            ) : (
              'Launch Agent'
            )}
          </Button>

          {schema && formTouched && (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              Parameters are sent as agent_parameters in the create-agent
              request.
            </Text>
          )}

          {error && <ErrorView error="Launch failed" detail={error} />}
        </Box>
      </ThemedProvider>
    );
  }

  return (
    <Chat
      protocol="vercel-ai"
      baseUrl={BASE_URL}
      agentId={agentId}
      title={`Parameterized Agent: ${String(formData.project ?? 'Project')}`}
      placeholder="Ask something about your configured project..."
      description={`Role: ${String(formData.role ?? 'n/a')} · Tone: ${String(formData.tone ?? 'n/a')}`}
      showHeader={true}
      showModelSelector={true}
      showToolsMenu={true}
      showSkillsMenu={true}
      showTokenUsage={true}
      showInformation={true}
      autoFocus
      height="100vh"
      runtimeId={agentId}
      historyEndpoint={`${BASE_URL}/api/v1/history`}
      suggestions={[
        {
          title: 'Print demo_params',
          message:
            'Use execute_code to print(demo_params) from the sandbox, then explain what it is.',
        },
        {
          title: 'Inspect demo_params',
          message:
            "Use execute_code to print('demo_params =', demo_params) and confirm its type.",
        },
      ]}
      submitOnSuggestionClick
    />
  );
};

export default AgentParametersExample;
