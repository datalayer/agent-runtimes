/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * HaikuDisplay - A carousel display for haiku collections.
 *
 * This component displays a collection of haikus in a carousel format
 * for the main view area. Inspired by the AG-UI Dojo implementation.
 *
 * @module examples/ag-ui/haiku/HaikuDisplay
 */

import { useState } from 'react';
import { IconButton, Text } from '@primer/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@primer/octicons-react';
import { InlineHaikuCard, type HaikuResult } from './InlineHaikuCard';

/**
 * Props for HaikuDisplay
 */
export interface HaikuDisplayProps {
  /** Array of haikus to display */
  haikus: HaikuResult[];
  /** Title for the display section */
  title?: string;
}

/**
 * HaikuDisplay Component
 *
 * Displays a carousel of haiku cards with navigation controls.
 * Shows the most recent haiku first with ability to browse older ones.
 */
export function HaikuDisplay({
  haikus,
  title = 'Generated Haikus',
}: HaikuDisplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // No haikus to display
  if (haikus.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          border: '2px dashed',
          borderColor: 'var(--borderColor-muted, #d0d7de)',
          borderRadius: 12,
          backgroundColor: 'var(--bgColor-subtle, #f6f8fa)',
          minHeight: 200,
        }}
      >
        <Text
          sx={{
            fontSize: 1,
            color: 'fg.muted',
            textAlign: 'center',
          }}
        >
          No haikus yet. Ask the assistant to generate one!
        </Text>
        <Text
          sx={{
            fontSize: 0,
            color: 'fg.subtle',
            marginTop: 2,
            textAlign: 'center',
          }}
        >
          Try: &quot;Write me a haiku about cherry blossoms&quot;
        </Text>
      </div>
    );
  }

  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < haikus.length - 1;

  const goLeft = () => {
    if (canGoLeft) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goRight = () => {
    if (canGoRight) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      }}
    >
      {/* Title */}
      <Text
        as="h3"
        sx={{
          fontSize: 2,
          fontWeight: 'semibold',
          marginBottom: 3,
          color: 'fg.default',
        }}
      >
        {title}
      </Text>

      {/* Carousel container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        {/* Left arrow */}
        <IconButton
          icon={ChevronLeftIcon}
          aria-label="Previous haiku"
          onClick={goLeft}
          disabled={!canGoLeft}
          variant="invisible"
          sx={{
            opacity: canGoLeft ? 1 : 0.3,
            cursor: canGoLeft ? 'pointer' : 'not-allowed',
          }}
        />

        {/* Haiku card */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            minWidth: 320,
          }}
        >
          <InlineHaikuCard
            haiku={haikus[currentIndex]}
            status="complete"
            size="large"
          />
        </div>

        {/* Right arrow */}
        <IconButton
          icon={ChevronRightIcon}
          aria-label="Next haiku"
          onClick={goRight}
          disabled={!canGoRight}
          variant="invisible"
          sx={{
            opacity: canGoRight ? 1 : 0.3,
            cursor: canGoRight ? 'pointer' : 'not-allowed',
          }}
        />
      </div>

      {/* Pagination indicator */}
      {haikus.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            alignItems: 'center',
          }}
        >
          {haikus.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              style={{
                width: index === currentIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                backgroundColor:
                  index === currentIndex
                    ? 'var(--fgColor-accent, #0969da)'
                    : 'var(--borderColor-muted, #d0d7de)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0,
              }}
              aria-label={`Go to haiku ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Counter */}
      <Text
        sx={{
          fontSize: 0,
          color: 'fg.muted',
          marginTop: 2,
        }}
      >
        {currentIndex + 1} of {haikus.length}
      </Text>
    </div>
  );
}

export default HaikuDisplay;
