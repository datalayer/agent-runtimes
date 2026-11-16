/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A product's photo in a card: a grey placeholder while it loads, the photo
 * faded in once it has, the product's name in its place when it cannot be
 * drawn, and always its alternative text. `PhotoStrip` is a row of them
 * under a card that lists products (the comparison, the basket).
 *
 * @module apps/toolCards/productPhoto
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export const PRODUCT_PHOTO_WORDS = {
  loading: (alt: string) => `Loading the photo of ${alt}`,
  photos: 'Photos',
} as const;

type PhotoState = 'loading' | 'loaded' | 'failed';

/** One photo, `height` pixels high, as wide as its box unless said. */
export function ProductPhoto({
  url,
  alt,
  height = 140,
  width = '100%',
}: {
  url: string;
  alt: string;
  height?: number;
  width?: number | string;
}): JSX.Element {
  const [state, setState] = useState<PhotoState>(url ? 'loading' : 'failed');
  return (
    <Box
      position="relative"
      width={width}
      height={height}
      flexShrink={0}
      overflow="hidden"
      bg="neutral.muted"
      aria-busy={state === 'loading' ? 'true' : undefined}
      aria-label={
        state === 'loading' ? PRODUCT_PHOTO_WORDS.loading(alt) : undefined
      }
      data-photo-state={state}
    >
      {state === 'failed' ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          height="100%"
          px={2}
        >
          <Text sx={{ fontSize: 0, color: 'fg.muted', textAlign: 'center' }}>
            {alt}
          </Text>
        </Box>
      ) : (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: state === 'loaded' ? 1 : 0,
            transition: 'opacity 160ms ease-out',
          }}
        />
      )}
    </Box>
  );
}

/** The photos of the products a card lists, small, in a row that wraps. */
export function PhotoStrip({
  photos,
  maxWidth = 640,
}: {
  photos: { url: string; alt: string }[];
  maxWidth?: number;
}): JSX.Element | null {
  const shown = photos.filter(photo => photo.url);
  if (shown.length === 0) {
    return null;
  }
  return (
    <Box
      as="ul"
      aria-label={PRODUCT_PHOTO_WORDS.photos}
      display="flex"
      flexWrap="wrap"
      gap={2}
      m={0}
      mt={2}
      p={0}
      width="100%"
      maxWidth={maxWidth}
      sx={{ listStyle: 'none' }}
    >
      {shown.map((photo, index) => (
        <Box
          as="li"
          key={`${photo.url}-${index}`}
          width={72}
          borderRadius={2}
          overflow="hidden"
          title={photo.alt}
        >
          <ProductPhoto url={photo.url} alt={photo.alt} height={72} />
        </Box>
      ))}
    </Box>
  );
}
