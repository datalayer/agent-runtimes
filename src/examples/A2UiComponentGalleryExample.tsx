/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, SegmentedControl, Text } from '@primer/react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { createSceneMessages, useA2uiProcessor } from './utils/a2ui';

type GalleryScene = {
  id: string;
  label: string;
  description: string;
  messages: ReturnType<typeof createSceneMessages>;
};

const SCENES: GalleryScene[] = [
  {
    id: 'typography',
    label: 'Typography',
    description:
      'Text, Icon, Row, and Button components bound to data-model values.',
    messages: createSceneMessages({
      surfaceId: 'gallery-typography',
      components: [
        { id: 'root', component: 'Card', child: 'main' },
        {
          id: 'main',
          component: 'Column',
          children: ['title', 'subtitle', 'meta-row', 'cta-label', 'cta'],
        },
        {
          id: 'title',
          component: 'Text',
          variant: 'h2',
          text: { path: '/title' },
        },
        { id: 'subtitle', component: 'Text', text: { path: '/subtitle' } },
        {
          id: 'meta-row',
          component: 'Row',
          align: 'center',
          children: ['meta-icon', 'meta-text'],
        },
        { id: 'meta-icon', component: 'Icon', name: 'star' },
        {
          id: 'meta-text',
          component: 'Text',
          variant: 'caption',
          text: { path: '/meta' },
        },
        { id: 'cta-label', component: 'Text', text: 'Trigger Action' },
        {
          id: 'cta',
          component: 'Button',
          child: 'cta-label',
          variant: 'primary',
          action: {
            event: {
              name: 'gallery_typography_cta',
              context: { section: 'typography', title: { path: '/title' } },
            },
          },
        },
      ],
      value: {
        title: 'A2UI Gallery',
        subtitle:
          'Protocol-native renderer with typed schemas and dynamic bindings.',
        meta: 'createSurface · updateComponents · updateDataModel',
      },
    }),
  },
  {
    id: 'contact-card',
    label: 'Contact',
    description: 'Card layout with icons and data-bound profile information.',
    messages: createSceneMessages({
      surfaceId: 'gallery-contact-card',
      components: [
        { id: 'root', component: 'Card', child: 'main-column' },
        {
          id: 'main-column',
          component: 'Column',
          align: 'center',
          children: [
            'avatar-image',
            'name',
            'title',
            'divider',
            'contact-info',
          ],
        },
        {
          id: 'avatar-image',
          component: 'Image',
          url: { path: '/avatar' },
          fit: 'cover',
          variant: 'avatar',
        },
        {
          id: 'name',
          component: 'Text',
          variant: 'h2',
          text: { path: '/name' },
        },
        { id: 'title', component: 'Text', text: { path: '/title' } },
        { id: 'divider', component: 'Divider' },
        {
          id: 'contact-info',
          component: 'Column',
          children: ['phone-row', 'email-row', 'location-row'],
        },
        {
          id: 'phone-row',
          component: 'Row',
          align: 'center',
          children: ['phone-icon', 'phone-text'],
        },
        { id: 'phone-icon', component: 'Icon', name: 'phone' },
        { id: 'phone-text', component: 'Text', text: { path: '/phone' } },
        {
          id: 'email-row',
          component: 'Row',
          align: 'center',
          children: ['email-icon', 'email-text'],
        },
        { id: 'email-icon', component: 'Icon', name: 'mail' },
        { id: 'email-text', component: 'Text', text: { path: '/email' } },
        {
          id: 'location-row',
          component: 'Row',
          align: 'center',
          children: ['location-icon', 'location-text'],
        },
        { id: 'location-icon', component: 'Icon', name: 'locationOn' },
        { id: 'location-text', component: 'Text', text: { path: '/location' } },
      ],
      value: {
        avatar:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
        name: 'David Park',
        title: 'Engineering Manager',
        phone: '+1 (555) 234-5678',
        email: 'david.park@company.com',
        location: 'San Francisco, CA',
      },
    }),
  },
  {
    id: 'controls',
    label: 'Controls',
    description:
      'Interactive inputs: TextField, ChoicePicker, CheckBox, Slider, DateTimeInput.',
    messages: createSceneMessages({
      surfaceId: 'gallery-controls',
      components: [
        { id: 'root', component: 'Card', child: 'controls-column' },
        {
          id: 'controls-column',
          component: 'Column',
          children: [
            'title',
            'name-field',
            'plan-picker',
            'alerts-checkbox',
            'volume-slider',
            'when-field',
            'submit-label',
            'submit',
          ],
        },
        {
          id: 'title',
          component: 'Text',
          variant: 'h3',
          text: 'Interactive Inputs',
        },
        {
          id: 'name-field',
          component: 'TextField',
          label: 'Name',
          value: { path: '/name' },
        },
        {
          id: 'plan-picker',
          component: 'ChoicePicker',
          label: 'Plan',
          value: { path: '/plan' },
          options: [
            { label: 'Starter', value: 'starter' },
            { label: 'Pro', value: 'pro' },
            { label: 'Enterprise', value: 'enterprise' },
          ],
        },
        {
          id: 'alerts-checkbox',
          component: 'CheckBox',
          label: 'Enable alerts',
          value: { path: '/alerts' },
        },
        {
          id: 'volume-slider',
          component: 'Slider',
          label: 'Volume',
          value: { path: '/volume' },
          min: 0,
          max: 100,
        },
        {
          id: 'when-field',
          component: 'DateTimeInput',
          label: 'Reminder time',
          value: { path: '/when' },
        },
        { id: 'submit-label', component: 'Text', text: 'Submit' },
        {
          id: 'submit',
          component: 'Button',
          variant: 'primary',
          child: 'submit-label',
          action: {
            event: {
              name: 'submit_controls',
              context: {
                name: { path: '/name' },
                plan: { path: '/plan' },
                alerts: { path: '/alerts' },
                volume: { path: '/volume' },
                when: { path: '/when' },
              },
            },
          },
        },
      ],
      value: {
        name: 'Morgan',
        plan: 'pro',
        alerts: true,
        volume: 64,
        when: '2026-05-01T18:30:00Z',
      },
    }),
  },
  {
    id: 'tabs-modal',
    label: 'Tabs + Modal',
    description:
      'Tabs with nested content and a modal trigger using event actions.',
    messages: createSceneMessages({
      surfaceId: 'gallery-tabs-modal',
      components: [
        { id: 'root', component: 'Column', children: ['tabs', 'modal'] },
        {
          id: 'tabs',
          component: 'Tabs',
          tabs: [
            { title: 'Overview', child: 'tab-overview' },
            { title: 'Details', child: 'tab-details' },
          ],
        },
        {
          id: 'tab-overview',
          component: 'Card',
          child: 'tab-overview-text',
        },
        {
          id: 'tab-overview-text',
          component: 'Text',
          text: 'Overview tab uses static component composition.',
        },
        {
          id: 'tab-details',
          component: 'Card',
          child: 'tab-details-text',
        },
        {
          id: 'tab-details-text',
          component: 'Text',
          text: 'Details tab includes modal interaction below.',
        },
        { id: 'modal-trigger-label', component: 'Text', text: 'Open Modal' },
        {
          id: 'modal-content-text',
          component: 'Text',
          text: 'This content is rendered inside a modal.',
        },
        {
          id: 'modal-content',
          component: 'Card',
          child: 'modal-content-text',
        },
        {
          id: 'modal-trigger',
          component: 'Button',
          child: 'modal-trigger-label',
          action: { event: { name: 'open_modal' } },
        },
        {
          id: 'modal',
          component: 'Modal',
          trigger: 'modal-trigger',
          content: 'modal-content',
        },
      ],
    }),
  },
  {
    id: 'restaurant-card',
    label: 'Restaurant',
    description: 'Restaurant card layout with image, rating, ETA, and action.',
    messages: createSceneMessages({
      surfaceId: 'gallery-restaurant-card',
      components: [
        { id: 'root', component: 'Card', child: 'main' },
        {
          id: 'main',
          component: 'Column',
          children: [
            'hero',
            'title-row',
            'meta',
            'stats-row',
            'cta-label',
            'cta',
          ],
        },
        {
          id: 'hero',
          component: 'Image',
          url: { path: '/image' },
          fit: 'cover',
          variant: 'largeFeature',
        },
        {
          id: 'title-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['title', 'price'],
        },
        {
          id: 'title',
          component: 'Text',
          variant: 'h3',
          text: { path: '/title' },
        },
        { id: 'price', component: 'Text', text: { path: '/price' } },
        {
          id: 'meta',
          component: 'Text',
          variant: 'caption',
          text: { path: '/meta' },
        },
        {
          id: 'stats-row',
          component: 'Row',
          justify: 'spaceBetween',
          children: ['rating', 'eta', 'distance'],
        },
        {
          id: 'rating',
          component: 'Text',
          variant: 'caption',
          text: { path: '/rating' },
        },
        {
          id: 'eta',
          component: 'Text',
          variant: 'caption',
          text: { path: '/eta' },
        },
        {
          id: 'distance',
          component: 'Text',
          variant: 'caption',
          text: { path: '/distance' },
        },
        { id: 'cta-label', component: 'Text', text: 'Reserve Table' },
        {
          id: 'cta',
          component: 'Button',
          variant: 'primary',
          child: 'cta-label',
          action: {
            event: {
              name: 'reserve_restaurant',
              context: {
                restaurantId: { path: '/id' },
                restaurantName: { path: '/title' },
              },
            },
          },
        },
      ],
      value: {
        id: 'rest_italian_001',
        image:
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=640&h=360&fit=crop',
        title: 'The Italian Kitchen',
        price: '$$$',
        meta: 'Italian • Pasta • Wine Bar',
        rating: '⭐ 4.8 (2,847 reviews)',
        eta: '25-35 min',
        distance: '0.8 mi',
      },
    }),
  },
  {
    id: 'list',
    label: 'Data List',
    description:
      'List component rendering a data-bound template with per-item actions.',
    messages: createSceneMessages({
      surfaceId: 'gallery-list',
      components: [
        { id: 'root', component: 'Column', children: ['heading', 'items'] },
        {
          id: 'heading',
          component: 'Text',
          variant: 'h2',
          text: { path: '/title' },
        },
        {
          id: 'items',
          component: 'List',
          direction: 'vertical',
          children: { componentId: 'item-template', path: '/items' },
        },
        { id: 'item-template', component: 'Card', child: 'item-row' },
        {
          id: 'item-row',
          component: 'Row',
          align: 'center',
          children: ['item-image', 'item-details', 'item-cta'],
        },
        {
          id: 'item-image',
          component: 'Image',
          url: { path: 'image' },
          fit: 'cover',
          variant: 'smallFeature',
          weight: 1,
        },
        {
          id: 'item-details',
          component: 'Column',
          weight: 3,
          children: ['item-name', 'item-meta'],
        },
        {
          id: 'item-name',
          component: 'Text',
          variant: 'h3',
          text: { path: 'name' },
        },
        {
          id: 'item-meta',
          component: 'Text',
          variant: 'caption',
          text: { path: 'meta' },
        },
        {
          id: 'item-cta',
          component: 'Button',
          variant: 'primary',
          child: 'item-cta-label',
          action: {
            event: {
              name: 'select_item',
              context: { id: { path: 'id' }, name: { path: 'name' } },
            },
          },
        },
        { id: 'item-cta-label', component: 'Text', text: 'Select' },
      ],
      value: {
        title: 'Featured Restaurants',
        items: [
          {
            id: 'rest_001',
            name: "Xi'an Famous Foods",
            meta: '★★★★☆ · Hand-pulled noodles',
            image:
              'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=200&h=200&fit=crop',
          },
          {
            id: 'rest_002',
            name: 'Han Dynasty',
            meta: '★★★★☆ · Authentic Szechuan',
            image:
              'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=200&h=200&fit=crop',
          },
          {
            id: 'rest_003',
            name: 'RedFarm',
            meta: '★★★★☆ · Farm-to-table Chinese',
            image:
              'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=200&h=200&fit=crop',
          },
        ],
      },
    }),
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Video and AudioPlayer components from the basic catalog.',
    messages: createSceneMessages({
      surfaceId: 'gallery-media',
      components: [
        { id: 'root', component: 'Card', child: 'media-column' },
        {
          id: 'media-column',
          component: 'Column',
          children: ['media-title', 'video', 'audio-title', 'audio'],
        },
        {
          id: 'media-title',
          component: 'Text',
          variant: 'h3',
          text: 'Media Components',
        },
        { id: 'video', component: 'Video', url: { path: '/videoUrl' } },
        {
          id: 'audio-title',
          component: 'Text',
          variant: 'caption',
          text: { path: '/audioLabel' },
        },
        {
          id: 'audio',
          component: 'AudioPlayer',
          url: { path: '/audioUrl' },
          description: { path: '/audioLabel' },
        },
      ],
      value: {
        videoUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        audioLabel: 'Sample audio track',
        audioUrl:
          'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
      },
    }),
  },
];

function GalleryContent({
  onAction,
}: {
  onAction: (action: A2uiClientAction) => void;
}) {
  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(onAction);
  const [selectedScene, setSelectedScene] = useState<string>(SCENES[0].id);

  const currentScene = useMemo(
    () => SCENES.find(scene => scene.id === selectedScene) ?? SCENES[0],
    [selectedScene],
  );

  const showScene = useCallback(
    (scene: GalleryScene) => {
      resetSurfaces();
      processMessages(scene.messages);
    },
    [processMessages, resetSurfaces],
  );

  const showAllScenes = useCallback(() => {
    resetSurfaces();
    SCENES.forEach(scene => {
      processMessages(scene.messages);
    });
  }, [processMessages, resetSurfaces]);

  useEffect(() => {
    showScene(currentScene);
  }, [currentScene, showScene]);

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
        <Text sx={{ fontSize: 2, fontWeight: 'bold' }}>Scenes</Text>
        <SegmentedControl aria-label="A2UI gallery scene picker" fullWidth>
          {SCENES.map(scene => (
            <SegmentedControl.Button
              key={scene.id}
              selected={scene.id === selectedScene}
              onClick={() => setSelectedScene(scene.id)}
            >
              {scene.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          {currentScene.description}
        </Text>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="primary"
            onClick={() => showScene(currentScene)}
          >
            Reload
          </Button>
          <Button size="small" variant="default" onClick={showAllScenes}>
            Show All
          </Button>
          <Button size="small" variant="invisible" onClick={resetSurfaces}>
            Clear
          </Button>
        </Box>
      </Box>

      <Box
        style={themeStyle}
        sx={{
          width: '100%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
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

const A2UiComponentGalleryExample: React.FC = () => {
  const [lastAction, setLastAction] = useState<A2uiClientAction | null>(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    console.log('A2UI Gallery Action:', action);
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
              🎨 A2UI Component Gallery
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              Showcases the A2UI basic catalog rendered live via
              MessageProcessor and A2uiSurface.
            </Text>
          </Box>

          <GalleryContent onAction={handleAction} />

          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'border.default',
              p: 3,
              fontFamily: 'mono',
              fontSize: 0,
              backgroundColor: 'canvas.subtle',
              whiteSpace: 'pre-wrap',
              maxHeight: 220,
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

export default A2UiComponentGalleryExample;
