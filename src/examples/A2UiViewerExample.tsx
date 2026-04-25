/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { SegmentedControl, Text } from '@primer/react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { createSceneMessages, useA2uiProcessor } from './utils/a2ui';

interface ViewerScene {
  id: string;
  label: string;
  emoji: string;
  description: string;
  messages: ReturnType<typeof createSceneMessages>;
}

const SCENES: ViewerScene[] = [
  {
    id: 'recipe',
    label: 'Recipe Card',
    emoji: '🍲',
    description: 'Rich recipe card with image and metadata.',
    messages: createSceneMessages({
      surfaceId: 'viewer-recipe',
      components: [
        { id: 'root', component: 'Card', child: 'main' },
        {
          id: 'main',
          component: 'Column',
          children: [
            'recipe-image',
            'title',
            'rating-row',
            'timing-row',
            'servings',
          ],
        },
        {
          id: 'recipe-image',
          component: 'Image',
          url: { path: '/image' },
          fit: 'cover',
          variant: 'largeFeature',
        },
        {
          id: 'title',
          component: 'Text',
          variant: 'h3',
          text: { path: '/title' },
        },
        {
          id: 'rating-row',
          component: 'Row',
          align: 'center',
          children: ['star', 'rating', 'reviews'],
        },
        { id: 'star', component: 'Icon', name: 'star' },
        { id: 'rating', component: 'Text', text: { path: '/rating' } },
        {
          id: 'reviews',
          component: 'Text',
          variant: 'caption',
          text: { path: '/reviewCount' },
        },
        { id: 'timing-row', component: 'Row', children: ['prep', 'cook'] },
        {
          id: 'prep',
          component: 'Text',
          variant: 'caption',
          text: { path: '/prepTime' },
        },
        {
          id: 'cook',
          component: 'Text',
          variant: 'caption',
          text: { path: '/cookTime' },
        },
        {
          id: 'servings',
          component: 'Text',
          variant: 'caption',
          text: { path: '/servings' },
        },
      ],
      value: {
        image:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=180&fit=crop',
        title: 'Mediterranean Quinoa Bowl',
        rating: '4.9',
        reviewCount: '(1,247 reviews)',
        prepTime: '15 min prep',
        cookTime: '20 min cook',
        servings: 'Serves 4',
      },
    }),
  },
  {
    id: 'booking',
    label: 'Booking Form',
    emoji: '📅',
    description: 'Form controls and a submit action payload.',
    messages: createSceneMessages({
      surfaceId: 'viewer-booking',
      components: [
        {
          id: 'root',
          component: 'Column',
          children: [
            'title',
            'party-size',
            'date-time',
            'dietary',
            'submit-label',
            'submit-button',
          ],
        },
        {
          id: 'title',
          component: 'Text',
          variant: 'h2',
          text: { path: '/title' },
        },
        {
          id: 'party-size',
          component: 'TextField',
          label: 'Party Size',
          value: { path: '/partySize' },
        },
        {
          id: 'date-time',
          component: 'DateTimeInput',
          label: 'Date & Time',
          value: { path: '/dateTime' },
        },
        {
          id: 'dietary',
          component: 'TextField',
          label: 'Dietary Requirements',
          value: { path: '/dietary' },
          variant: 'longText',
        },
        { id: 'submit-label', component: 'Text', text: 'Submit Reservation' },
        {
          id: 'submit-button',
          component: 'Button',
          variant: 'primary',
          child: 'submit-label',
          action: {
            event: {
              name: 'submit_booking',
              context: {
                partySize: { path: '/partySize' },
                dateTime: { path: '/dateTime' },
                dietary: { path: '/dietary' },
              },
            },
          },
        },
      ],
      value: {
        title: 'Book Your Table',
        partySize: '4',
        dateTime: '2026-05-15T19:30:00Z',
        dietary: 'No peanuts',
      },
    }),
  },
  {
    id: 'dashboard',
    label: 'Sales Snapshot',
    emoji: '📈',
    description: 'Nested cards and list-like KPI tiles.',
    messages: createSceneMessages({
      surfaceId: 'viewer-dashboard',
      components: [
        {
          id: 'root',
          component: 'Column',
          children: ['headline', 'subtitle', 'tiles'],
        },
        {
          id: 'headline',
          component: 'Text',
          variant: 'h2',
          text: 'Sales by Category',
        },
        { id: 'subtitle', component: 'Text', text: 'Q2 performance snapshot' },
        {
          id: 'tiles',
          component: 'Column',
          children: ['tile-1', 'tile-2', 'tile-3', 'tile-4'],
        },
        { id: 'tile-1', component: 'Card', child: 'tile-1-row' },
        {
          id: 'tile-1-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['tile-1-label', 'tile-1-value'],
        },
        {
          id: 'tile-1-label',
          component: 'Text',
          variant: 'caption',
          text: 'Apparel',
        },
        {
          id: 'tile-1-value',
          component: 'Text',
          variant: 'h3',
          text: '$41,200',
        },
        { id: 'tile-2', component: 'Card', child: 'tile-2-row' },
        {
          id: 'tile-2-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['tile-2-label', 'tile-2-value'],
        },
        {
          id: 'tile-2-label',
          component: 'Text',
          variant: 'caption',
          text: 'Electronics',
        },
        {
          id: 'tile-2-value',
          component: 'Text',
          variant: 'h3',
          text: '$28,900',
        },
        { id: 'tile-3', component: 'Card', child: 'tile-3-row' },
        {
          id: 'tile-3-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['tile-3-label', 'tile-3-value'],
        },
        {
          id: 'tile-3-label',
          component: 'Text',
          variant: 'caption',
          text: 'Home Goods',
        },
        {
          id: 'tile-3-value',
          component: 'Text',
          variant: 'h3',
          text: '$15,600',
        },
        { id: 'tile-4', component: 'Card', child: 'tile-4-row' },
        {
          id: 'tile-4-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['tile-4-label', 'tile-4-value'],
        },
        {
          id: 'tile-4-label',
          component: 'Text',
          variant: 'caption',
          text: 'Health & Beauty',
        },
        {
          id: 'tile-4-value',
          component: 'Text',
          variant: 'h3',
          text: '$10,300',
        },
      ],
    }),
  },
];

function ViewerContent({
  onAction,
}: {
  onAction: (action: A2uiClientAction) => void;
}) {
  const { surfaces, processMessages, resetSurfaces } =
    useA2uiProcessor(onAction);
  const [selectedSceneId, setSelectedSceneId] = useState(SCENES[0].id);

  const selectedScene = useMemo(
    () => SCENES.find(scene => scene.id === selectedSceneId) ?? SCENES[0],
    [selectedSceneId],
  );

  useEffect(() => {
    resetSurfaces();
    processMessages(selectedScene.messages);
  }, [selectedScene, processMessages, resetSurfaces]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
      <Box
        sx={{
          width: '100%',
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          p: 3,
          backgroundColor: 'canvas.subtle',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <Text sx={{ fontSize: 2, fontWeight: 'bold' }}>Select Scene</Text>
        <SegmentedControl aria-label="A2UI viewer scene picker" fullWidth>
          {SCENES.map(scene => (
            <SegmentedControl.Button
              key={scene.id}
              selected={scene.id === selectedSceneId}
              onClick={() => setSelectedSceneId(scene.id)}
            >
              {`${scene.emoji} ${scene.label}`}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          {selectedScene.description}
        </Text>
      </Box>

      <Box
        sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {surfaces.map(surface => (
          <Box key={surface.id} sx={{ width: '100%' }}>
            <A2uiSurface surface={surface} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const A2UiViewerExample: React.FC = () => {
  const [lastAction, setLastAction] = useState<A2uiClientAction | null>(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    console.log('A2UI Viewer Action:', action);
    setLastAction(action);
  }, []);

  return (
    <ThemedProvider>
      <A2uiMarkdownProvider>
        <Box
          sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
        >
          <Box
            sx={{
              px: 3,
              py: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.subtle',
            }}
          >
            <Text as="h1" sx={{ fontSize: 3, fontWeight: 'bold' }}>
              🔍 A2UI Viewer
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              Standalone viewer scenes powered by MessageProcessor and
              A2uiSurface.
            </Text>
          </Box>

          <ViewerContent onAction={handleAction} />

          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'border.default',
              p: 3,
              fontFamily: 'mono',
              fontSize: 0,
              backgroundColor: 'canvas.subtle',
              whiteSpace: 'pre-wrap',
              maxHeight: 180,
              overflow: 'auto',
            }}
          >
            {lastAction
              ? JSON.stringify(lastAction, null, 2)
              : 'No action triggered yet.'}
          </Box>
        </Box>
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiViewerExample;
