/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.1.
 *
 * @module identity/pkce
 */

/**
 * Generate a cryptographically random code verifier for PKCE.
 * @param length - Length of the verifier (default: 64, min: 43, max: 128)
 * @returns Base64URL-encoded code verifier
 */
export function generateCodeVerifier(length: number = 64): string {
  const validLength = Math.max(43, Math.min(128, length));
  const array = new Uint8Array(validLength);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate a code challenge from a code verifier using SHA-256.
 * @param codeVerifier - The code verifier string
 * @returns Base64URL-encoded SHA-256 hash of the verifier
 */
export async function generateCodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a random state parameter for CSRF protection.
 * @returns Random state string
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Base64URL encode a Uint8Array (no padding, URL-safe).
 * @param data - Data to encode
 * @returns Base64URL-encoded string
 */
function base64UrlEncode(data: Uint8Array): string {
  // Convert to base64
  let base64 = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) {
    base64 += String.fromCharCode(bytes[i]);
  }
  base64 = btoa(base64);

  // Convert to base64url (URL-safe, no padding)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a PKCE pair (code verifier and challenge).
 * @returns Object with codeVerifier and codeChallenge
 */
export async function generatePKCEPair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}
