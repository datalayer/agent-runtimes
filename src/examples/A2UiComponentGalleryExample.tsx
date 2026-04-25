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
];

function GalleryContent({
  onAction,
}: {
  onAction: (action: A2uiClientAction) => void;
}) {
  const { surfaces, processMessages, resetSurfaces } =
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
