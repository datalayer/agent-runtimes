/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InlineHaikuCard - A beautiful haiku card component for inline rendering.
 *
 * Inspired by the AG-UI Dojo implementation, this component renders haiku
 * poetry with gradient backgrounds and Japanese/English text.
 *
 * @module examples/ag-ui/haiku/InlineHaikuCard
 */

import { Spinner } from '@primer/react';

/**
 * Haiku data structure returned by the backend tool
 */
export interface HaikuResult {
  japanese: string[];
  english: string[];
  gradient: string;
}

/**
 * Props for InlineHaikuCard
 * Status aligned with tool rendering patterns
 */
export interface InlineHaikuCardProps {
  /** Haiku data */
  haiku?: HaikuResult;
  /**
   * Current status:
   * - 'inProgress': Arguments are being streamed
   * - 'executing': Tool is executing on backend
   * - 'complete': Tool completed successfully
   * - 'error': Tool execution failed
   */
  status: 'inProgress' | 'executing' | 'complete' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Optional size variant */
  size?: 'normal' | 'large';
}

/**
 * Default gradient if none specified
 */
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

/**
 * InlineHaikuCard Component
 *
 * Renders a beautiful haiku card inline in the chat or in a display area with:
 * - Custom gradient background
 * - Japanese text (decorative, larger)
 * - English translation (below)
 * - Decorative corner accents
 */
export function InlineHaikuCard({
  haiku,
  status,
  error,
  size = 'normal',
}: InlineHaikuCardProps) {
  const isLarge = size === 'large';
  const cardWidth = isLarge ? 400 : 300;
  const japaneseSize = isLarge ? 24 : 18;
  const englishSize = isLarge ? 14 : 12;
  const padding = isLarge ? 24 : 16;

  // Show loading state for inProgress or executing
  if (status === 'inProgress' || status === 'executing' || !haiku) {
    return (
      <div
        style={{
          background: DEFAULT_GRADIENT,
          borderRadius: 12,
          padding: padding,
          marginTop: 12,
          marginBottom: 8,
          maxWidth: cardWidth,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Spinner size="small" />
        <span style={{ color: 'white', fontSize: 14 }}>
          {status === 'inProgress'
            ? 'Composing haiku...'
            : 'Generating haiku...'}
        </span>
      </div>
    );
  }

  // Show error state
  if (status === 'error') {
    return (
      <div
        style={{
          backgroundColor: '#E53E3E',
          borderRadius: 12,
          padding: padding,
          marginTop: 12,
          marginBottom: 8,
          maxWidth: cardWidth,
          width: '100%',
        }}
      >
        <span style={{ color: 'white', fontSize: 14 }}>
          Error: {error || 'Failed to generate haiku'}
        </span>
      </div>
    );
  }

  const gradient = haiku.gradient || DEFAULT_GRADIENT;

  return (
    <div
      data-testid="haiku-card"
      style={{
        background: gradient,
        borderRadius: 12,
        marginTop: 12,
        marginBottom: 8,
        maxWidth: cardWidth,
        width: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Decorative corner accent - top right */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 60,
          height: 60,
          background: 'rgba(255, 255, 255, 0.1)',
          borderBottomLeftRadius: '100%',
        }}
      />

      {/* Decorative corner accent - bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 40,
          height: 40,
          background: 'rgba(255, 255, 255, 0.08)',
          borderTopRightRadius: '100%',
        }}
      />

      {/* Card content */}
      <div
        style={{
          padding: padding,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Japanese text */}
        <div
          data-testid="haiku-japanese"
          style={{
            marginBottom: isLarge ? 20 : 16,
          }}
        >
          {haiku.japanese.map((line, index) => (
            <p
              key={`jp-${index}`}
              style={{
                color: 'white',
                fontSize: japaneseSize,
                fontWeight: 500,
                margin: 0,
                marginBottom: index < haiku.japanese.length - 1 ? 4 : 0,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                lineHeight: 1.4,
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            width: 40,
            height: 2,
            background: 'rgba(255, 255, 255, 0.4)',
            marginBottom: isLarge ? 16 : 12,
          }}
        />

        {/* English translation */}
        <div data-testid="haiku-english">
          {haiku.english.map((line, index) => (
            <p
              key={`en-${index}`}
              style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: englishSize,
                fontStyle: 'italic',
                margin: 0,
                marginBottom: index < haiku.english.length - 1 ? 2 : 0,
                lineHeight: 1.5,
              }}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default InlineHaikuCard;
