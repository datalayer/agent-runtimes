/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { environments } from '../runtimes';
import {
  testConfig,
  debugLog,
  skipIfNoToken,
} from '../../__tests__/shared/test-config';

let DATALAYER_API_KEY: string;
let BASE_URL: string;

// Skip all tests if no token is available
const skipTests = skipIfNoToken();
const runExternalIntegration =
  process.env.DATALAYER_TEST_RUN_EXTERNAL_INTEGRATION === 'true';

beforeAll(async () => {
  if (skipTests) {
    console.log(
      'WARNING: Skipping Runtimes Environments integration tests: No Datalayer API token configured',
    );
    console.log(
      '         Set DATALAYER_API_TOKEN env var or TEST_DATALAYER_API_KEY in .env.test',
    );
    return;
  }

  // Get token and base URL from test config
  DATALAYER_API_KEY = testConfig.getToken();
  BASE_URL = testConfig.getBaseUrl('RUNTIMES');

  debugLog('Test configuration loaded');
  debugLog('Base URL:', BASE_URL);
  debugLog('Token available:', !!DATALAYER_API_KEY);
});

describe.skipIf(skipTests || !runExternalIntegration)(
  'Runtimes Environments Integration Tests',
  () => {
    describe('list', () => {
      it('should successfully list available environments', async () => {
        console.log('Testing list environments endpoint...');

        const response = await environments.listEnvironments(
          DATALAYER_API_KEY,
          BASE_URL,
        );

        console.log(
          'Environments response:',
          JSON.stringify(response, null, 2),
        );

        // Verify the response structure
        expect(response).toBeDefined();
        expect(response).toHaveProperty('success');
        expect(response.success).toBe(true);
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('environments');
        expect(Array.isArray(response.environments)).toBe(true);

        // Check that we have at least some environments
        console.log(
          `Found ${response.environments.length} available environments`,
        );

        // If we have environments, check the structure of the first one
        if (response.environments.length > 0) {
          const firstEnv = response.environments[0];
          console.log('First environment:', firstEnv.title);

          // Verify environment structure
          expect(firstEnv).toHaveProperty('title');
          expect(firstEnv).toHaveProperty('description');
          expect(firstEnv).toHaveProperty('dockerImage');
          expect(firstEnv).toHaveProperty('language');
          expect(firstEnv).toHaveProperty('burning_rate');
          expect(typeof firstEnv.burning_rate).toBe('number');
        }
      });

      it('should work with default URL if not specified', async () => {
        console.log('Testing list environments with default URL...');

        // Call without specifying URL to use default
        const response = await environments.listEnvironments(DATALAYER_API_KEY);

        console.log(
          'Default URL environments response:',
          JSON.stringify(response, null, 2),
        );

        // Should still get valid response
        expect(response).toBeDefined();
        expect(response.success).toBe(true);
        expect(response).toHaveProperty('environments');
        expect(Array.isArray(response.environments)).toBe(true);
      });

      it('should include environment resource information', async () => {
        console.log('Testing environment resource information...');

        const response = await environments.listEnvironments(
          DATALAYER_API_KEY,
          BASE_URL,
        );

        // Check if any environment has resource information
        const envWithResources = response.environments.find(
          env => env.resources || env.resourcesRanges,
        );

        if (envWithResources) {
          console.log(
            'Found environment with resources:',
            envWithResources.title,
          );

          if (envWithResources.resources) {
            console.log('Resources:', envWithResources.resources);
            expect(envWithResources.resources).toHaveProperty('cpu');
            expect(envWithResources.resources).toHaveProperty('memory');
          }

          if (envWithResources.resourcesRanges) {
            console.log('Resource ranges:', envWithResources.resourcesRanges);
          }
        } else {
          console.log(
            'No environments with explicit resource information found',
          );
        }
      });

      it('should include environment snippets if available', async () => {
        console.log('Testing environment snippets...');

        const response = await environments.listEnvironments(
          DATALAYER_API_KEY,
          BASE_URL,
        );

        // Check if any environment has snippets
        const envWithSnippets = response.environments.find(
          env => env.snippets && env.snippets.length > 0,
        );

        if (envWithSnippets) {
          console.log(
            'Found environment with snippets:',
            envWithSnippets.title,
          );
          console.log('Number of snippets:', envWithSnippets.snippets?.length);

          const firstSnippet = envWithSnippets.snippets![0];
          expect(firstSnippet).toHaveProperty('title');
          // Description might be optional
          if (firstSnippet.description) {
            expect(firstSnippet).toHaveProperty('description');
          }
          expect(firstSnippet).toHaveProperty('code');
        } else {
          console.log('No environments with snippets found');
        }
      });
    });

    describe('error handling', () => {
      it('should handle invalid token gracefully', async () => {
        console.log('Testing with invalid token...');

        const invalidToken = 'invalid-token-123';

        try {
          await environments.listEnvironments(invalidToken, BASE_URL);
          // If we get here, the API accepted the invalid token (shouldn't happen)
          console.log('WARNING: API accepted invalid token');
        } catch (error: any) {
          console.log('Error with invalid token:', error.message);
          // We expect an error with invalid token
          expect(error).toBeDefined();
          expect(error.message).toBeDefined();
        }
      });
    });
  },
);
