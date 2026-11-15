/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-trip-options` — the Voyager's three options, as a
 * message drawn by the A2UI renderer, one card each: the dates and nights,
 * the price, what stands out, a link to the offer, and **Choose this one**,
 * which sends the choice back as the person's next turn. Nothing is booked.
 * Draws `show_trip_options`.
 *
 * @module apps/plugins/trip-options
 */

import type { JSX } from 'react';
import { useState } from 'react';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
  submitCard,
  useToolCardSend,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readTripOptions, type TripOption } from './read';

export const TRIP_OPTIONS_PLUGIN_NAME = '@datalayer/loop-plugin-trip-options';

export const TRIP_OPTIONS_WORDS = {
  label: 'Trip options',
  writing: 'Looking for trips…',
  nights: (nights: number) => (nights === 1 ? '1 night' : `${nights} nights`),
  choose: 'Choose this one',
  chosen: (title: string) => `Chosen: ${title}`,
  offer: 'See the offer',
  nothingBooked: 'Nothing is booked until you say so.',
} as const;

/** The action **Choose this one** sends. */
export const CHOOSE_TRIP_ACTION = 'choose_trip';

/** The options as an A2UI card: a section each, with its choice. */
export function tripOptionsCard(
  options: TripOption[],
  id: string,
  state: { choose?: boolean; chosen?: string } = {},
): CardSpec {
  const chosen = options.find(option => option.id === state.chosen);
  return {
    id: `trips-${id}`,
    title: TRIP_OPTIONS_WORDS.label,
    captions: [
      chosen
        ? TRIP_OPTIONS_WORDS.chosen(chosen.title)
        : TRIP_OPTIONS_WORDS.nothingBooked,
    ],
    sections: options.map(option => ({
      id: option.id,
      title: option.title,
      ...(option.image
        ? { image: { url: option.image, alt: option.title } }
        : {}),
      lines: [
        [
          option.dates,
          option.nights !== undefined
            ? TRIP_OPTIONS_WORDS.nights(option.nights)
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        ...(option.price !== undefined
          ? [`**${money(option.price, option.currency)}**`]
          : []),
        ...(option.summary ? [option.summary] : []),
        ...option.highlights.map(highlight => `- ${highlight}`),
        ...(option.url ? [`[${TRIP_OPTIONS_WORDS.offer}](${option.url})`] : []),
      ].filter(Boolean),
      actions:
        state.choose && !chosen
          ? [
              {
                name: CHOOSE_TRIP_ACTION,
                label: TRIP_OPTIONS_WORDS.choose,
                context: { id: option.id },
                primary: true,
              },
            ]
          : [],
    })),
  };
}

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
  const onAction = (action: A2uiClientAction) => {
    const option = options.find(
      each => each.id === String((action.context ?? {}).id ?? ''),
    );
    if (action.name !== CHOOSE_TRIP_ACTION || !option || !send) {
      return;
    }
    if (
      submitCard(send, {
        title: TRIP_OPTIONS_WORDS.label,
        values: { chosen: option.title, id: option.id },
      })
    ) {
      setChosen(option.id);
    }
  };
  return (
    <A2uiCard
      spec={tripOptionsCard(options, context.toolCallId, {
        choose: Boolean(send) && read.done,
        chosen,
      })}
      onAction={onAction}
      maxWidth={720}
    />
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
