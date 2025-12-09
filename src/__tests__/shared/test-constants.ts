/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Test constants for API unit tests
 */

/**
 * A valid mock JWT token for testing
 * This token has the correct JWT structure (header.payload.signature) but is not cryptographically valid
 *
 * Decoded header: {"alg":"HS256","typ":"JWT"}
 * Decoded payload: {"sub":"test-user","iss":"test-issuer","iat":1700000000,"exp":9999999999,"aud":"test-audience"}
 *
 * The token is constructed to:
 * - Have three parts separated by dots
 * - Have valid base64url encoded parts
 * - Have proper JWT header with alg and typ
 * - Have common JWT claims in payload
 * - Have an expiration far in the future to avoid expiration errors
 * - Be long enough to pass length validation (>100 chars)
 */
export const MOCK_JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpc3MiOiJ0ZXN0LWlzc3VlciIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5LCJhdWQiOiJ0ZXN0LWF1ZGllbmNlIn0.abcdefghijklmnopqrstuvwxyz012345678901234567890';

/**
 * An invalid token (not JWT format) for negative testing
 */
export const INVALID_TOKEN = 'invalid-token';

/**
 * A malformed JWT token (only two parts instead of three)
 */
export const MALFORMED_JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ';

/**
 * A JWT token with an expired timestamp
 * Decoded payload: {"sub":"test-user","exp":1000000000}
 */
export const EXPIRED_JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjEwMDAwMDAwMDB9.abcdefghijklmnopqrstuvwxyz012345678901234567890';

/**
 * Mock API responses
 */
export const MOCK_ENVIRONMENTS_RESPONSE = {
  success: true,
  message: 'Environments retrieved successfully',
  environments: [
    {
      title: 'Python Base',
      description: 'Basic Python environment',
      dockerImage: 'python:3.9',
      language: 'python',
      burning_rate: 1,
    },
    {
      title: 'R Statistical',
      description: 'R environment for statistical computing',
      dockerImage: 'r-base:4.3',
      language: 'r',
      burning_rate: 2,
    },
  ],
};

export const MOCK_RUNTIME_RESPONSE = {
  success: true,
  message: 'Runtime retrieved successfully',
  runtime: {
    pod_name: 'test-runtime-pod',
    status: 'running',
    environment: 'python-base',
    created_at: '2024-01-01T00:00:00Z',
  },
};

export const MOCK_SNAPSHOT_RESPONSE = {
  success: true,
  message: 'Snapshot retrieved successfully',
  snapshot: {
    id: 'test-snapshot-123',
    name: 'Test Snapshot',
    created_at: '2024-01-01T00:00:00Z',
    size: 1024000,
  },
};
