/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-options` — the Voyager's three options, one
 * card each: the dates and nights, the price, what stands out, and a link to
 * the offer. *Choose this one* sends the choice back as the person's next
 * turn; nothing is booked from it. Draws `show_trip_options`.
 *
 * @module apps/plugins/trip-options
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Button, Heading, Link, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
  submitCard,
  useToolCardSend,
} from '../../toolCards/kit';
import { readTripOptions } from './read';

export const TRIP_OPTIONS_PLUGIN_NAME = '@datalayer/loop-plugin-trip-options';

export const TRIP_OPTIONS_WORDS = {
  label: 'Trip options',
  writing: 'Looking for trips…',
  nights: (nights: number) => (nights === 1 ? '1 night' : `${nights} nights`),
  choose: 'Choose this one',
  chosen: 'Chosen',
  offer: 'See the offer',
  nothingBooked: 'Nothing is booked until you say so.',
} as const;

export function TripOptionsCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const send = useToolCardSend();
  const [chosen, setChosen] = useState('');
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const options = readTripOptions(read.data);
  if (options.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={TRIP_OPTIONS_WORDS.writing} />
    );
  }
  return (
    <Box as="section" aria-label={TRIP_OPTIONS_WORDS.label} my={2} width="100%">
      <Box
        display="grid"
        gridTemplateColumns={['1fr', 'repeat(auto-fit, minmax(200px, 1fr))']}
        gridGap={2}
      >
        {options.map(option => (
          <Box
            as="article"
            key={option.id}
            aria-label={option.title}
            p={3}
            border="1px solid"
            borderColor={
              chosen === option.id ? 'accent.emphasis' : 'border.default'
            }
            borderRadius={2}
            bg="canvas.subtle"
            display="flex"
            flexDirection="column"
            gap={1}
          >
            {option.image ? (
              <Box
                as="img"
                src={option.image}
                alt=""
                width="100%"
                height={120}
                borderRadius={2}
                sx={{ objectFit: 'cover' }}
              />
            ) : null}
            <Heading as="h4" sx={{ fontSize: 2 }}>
              {option.title}
            </Heading>
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {[
                option.dates,
                option.nights !== undefined
                  ? TRIP_OPTIONS_WORDS.nights(option.nights)
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {option.price !== undefined ? (
              <Text sx={{ fontSize: 3, fontWeight: 'bold' }}>
                {money(option.price, option.currency)}
              </Text>
            ) : null}
            {option.summary ? (
              <Text sx={{ fontSize: 1 }}>{option.summary}</Text>
            ) : null}
            {option.highlights.length > 0 ? (
              <Box as="ul" pl={3} my={1} sx={{ fontSize: 1 }}>
                {option.highlights.map(highlight => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </Box>
            ) : null}
            <Box
              mt="auto"
              display="flex"
              gap={2}
              alignItems="center"
              flexWrap="wrap"
            >
              {send && read.done ? (
                <Button
                  size="small"
                  variant={chosen === option.id ? 'primary' : 'default'}
                  disabled={Boolean(chosen)}
                  onClick={() => {
                    if (
                      submitCard(send, {
                        title: TRIP_OPTIONS_WORDS.label,
                        values: { chosen: option.title, id: option.id },
                      })
                    ) {
                      setChosen(option.id);
                    }
                  }}
                >
                  {chosen === option.id
                    ? TRIP_OPTIONS_WORDS.chosen
                    : TRIP_OPTIONS_WORDS.choose}
                </Button>
              ) : null}
              {option.url ? (
                <Link
                  href={option.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ fontSize: 1 }}
                >
                  {TRIP_OPTIONS_WORDS.offer}
                </Link>
              ) : null}
            </Box>
          </Box>
        ))}
      </Box>
      <Text as="p" sx={{ mt: 1, mb: 0, fontSize: 0, color: 'fg.muted' }}>
        {TRIP_OPTIONS_WORDS.nothingBooked}
      </Text>
    </Box>
  );
}

export const TripOptionsPlugin = defineToolCardPlugin({
  id: 'trip-options',
  displayName: 'Trip options',
  description:
    'Up to three trips side by side, each with its dates, price and highlights; the person chooses one.',
  octicon: 'briefcase',
  emoji: '\u{1F9F3}',
  tools: ['show_trip_options'],
  Card: TripOptionsCard,
});

export { readTripOptions, MOST_TRIP_OPTIONS, type TripOption } from './read';
export default TripOptionsPlugin;
