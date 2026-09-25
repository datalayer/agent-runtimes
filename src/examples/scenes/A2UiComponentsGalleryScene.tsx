/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Scene extracted from the A2UiComponentsGalleryExample page: the same canned A2UI
 * messages, rendered as a Loop workspace view. The page itself now mounts
 * a reactor application with this scene as a plugin.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, SegmentedControl, Text } from '@primer/react';
import {
  A2UI_RENDER_SCOPE_SX,
  A2uiSurfaceComposed,
} from '../../components/a2ui';
import { basicCatalog } from '@a2ui/react/v0_9';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2uiMarkdownProvider } from '../utils/a2uiMarkdownProvider';
import { createSceneMessages, useA2uiProcessor } from '../utils/a2ui';
import { useExampleAgentRuntimesUrl } from '../utils/useExampleAgentRuntimesUrl';

type A2APayloadPart = {
  kind?: 'text' | 'data';
  text?: string;
  data?: Record<string, unknown>;
  root?: {
    kind?: 'text' | 'data';
    text?: string;
    data?: Record<string, unknown>;
  };
};

const extractA2uiMessages = (parts: A2APayloadPart[]): A2uiMessage[] => {
  const messages: A2uiMessage[] = [];
  parts.forEach(part => {
    const node = part.root ?? part;
    if (node.kind !== 'data' || !node.data) {
      return;
    }
    const payload = node.data as Record<string, unknown>;
    if (payload.version !== 'v0.9') {
      return;
    }
    const createSurface = payload.createSurface as
      { catalogId?: string } | undefined;
    if (createSurface && createSurface.catalogId !== basicCatalog.id) {
      createSurface.catalogId = basicCatalog.id;
    }
    messages.push(payload as unknown as A2uiMessage);
  });
  return messages;
};

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
  {
    id: 'validation',
    label: 'Form Validation',
    description:
      'Live client-side validation via local function evaluation (email, regex, and/or/required) with two-way data binding.',
    messages: createSceneMessages({
      surfaceId: 'gallery-validation',
      components: [
        { id: 'root', component: 'Card', child: 'main-column' },
        {
          id: 'main-column',
          component: 'Column',
          align: 'stretch',
          children: [
            'welcome-text',
            'email-field',
            'phone-field',
            'zip-field',
            'terms-checkbox',
            'submit-btn',
          ],
        },
        {
          id: 'welcome-text',
          component: 'Text',
          variant: 'h3',
          text: {
            call: 'formatString',
            args: {
              value:
                "Hello! Today is ${formatDate(value: ${/now}, format: 'EEEE, MMMM d')}.",
            },
            returnType: 'string',
          },
        },
        {
          id: 'email-field',
          component: 'TextField',
          label: 'Email Address',
          value: { path: '/formData/email' },
          checks: [
            {
              condition: {
                call: 'email',
                args: { value: { path: '/formData/email' } },
              },
              message: 'Invalid email format',
            },
          ],
        },
        {
          id: 'phone-field',
          component: 'TextField',
          label: 'Phone Number',
          value: { path: '/formData/phone' },
          checks: [
            {
              condition: {
                call: 'regex',
                args: {
                  value: { path: '/formData/phone' },
                  pattern: '^\\+?[0-9]{10,15}$',
                },
              },
              message: 'Invalid phone format',
            },
          ],
        },
        {
          id: 'zip-field',
          component: 'TextField',
          label: 'Zip Code',
          value: { path: '/formData/zip' },
          checks: [
            {
              condition: {
                call: 'regex',
                args: {
                  value: { path: '/formData/zip' },
                  pattern: '^[0-9]{5}$',
                },
              },
              message: 'Must be exactly 5 digits',
            },
          ],
        },
        {
          id: 'terms-checkbox',
          component: 'CheckBox',
          label: 'I agree to the terms and conditions',
          value: { path: '/formData/agree' },
        },
        {
          id: 'submit-btn-text',
          component: 'Text',
          text: 'Submit Registration',
        },
        {
          id: 'submit-btn',
          component: 'Button',
          variant: 'primary',
          child: 'submit-btn-text',
          checks: [
            {
              condition: {
                call: 'and',
                args: {
                  values: [
                    { path: '/formData/agree' },
                    {
                      call: 'or',
                      args: {
                        values: [
                          {
                            call: 'required',
                            args: { value: { path: '/formData/email' } },
                          },
                          {
                            call: 'required',
                            args: { value: { path: '/formData/phone' } },
                          },
                        ],
                      },
                    },
                    {
                      call: 'required',
                      args: { value: { path: '/formData/zip' } },
                    },
                  ],
                },
              },
              message:
                'You must agree to terms AND provide either Email or Phone, plus a Zip code.',
            },
          ],
          action: {
            event: {
              name: 'gallery_register',
              context: { data: { path: '/formData' } },
            },
          },
        },
      ],
      value: {
        now: '2025-12-15T12:00:00Z',
        formData: {
          email: '',
          phone: '',
          zip: '',
          agree: false,
        },
      },
    }),
  },
];

function GalleryContent({
  onAction,
}: {
  onAction: (action: A2uiClientAction) => void;
}) {
  const baseUrl = useExampleAgentRuntimesUrl();
  const supportEndpoint = `${baseUrl}/api/v1/a2ui/support-assistant/`;
  const supportHealthEndpoint = `${baseUrl}/api/v1/a2ui/support-assistant/health`;
  const [selectedScene, setSelectedScene] = useState<string>(SCENES[0].id);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendSummary, setBackendSummary] = useState<string>('');
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<
    'unknown' | 'healthy' | 'unhealthy'
  >('unknown');
  const [backendMode, setBackendMode] = useState(false);
  const backendModeRef = useRef(false);
  const sendSupportPayloadRef = useRef<
    | ((payload: {
        query?: string;
        action?: string;
        context?: Record<string, unknown>;
      }) => Promise<void>)
    | null
  >(null);

  const handleAction = useCallback(
    (action: A2uiClientAction) => {
      onAction(action);
      if (!backendModeRef.current || !sendSupportPayloadRef.current) {
        return;
      }
      void sendSupportPayloadRef.current({
        action: action.name,
        context: action.context,
      });
    },
    [onAction],
  );

  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(handleAction);

  const sendSupportPayload = useCallback(
    async (payload: {
      query?: string;
      action?: string;
      context?: Record<string, unknown>;
    }) => {
      setBackendLoading(true);
      setBackendError(null);
      try {
        const response = await fetch(supportEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = (await response.json()) as { detail?: string };
          throw new Error(data.detail || 'Support endpoint request failed');
        }
        const parts = (await response.json()) as A2APayloadPart[];
        const messages = extractA2uiMessages(parts);
        if (messages.length === 0) {
          throw new Error('Python backend did not return A2UI messages');
        }
        resetSurfaces();
        processMessages(messages);
        setBackendMode(true);
        const serverText = parts
          .map(part => {
            const node = part.root ?? part;
            return node.kind === 'text' ? node.text : undefined;
          })
          .filter(Boolean)
          .join(' ');
        setBackendSummary(
          serverText ||
            'Python backend surface loaded from /api/v1/a2ui/support-assistant/.',
        );
      } catch (err) {
        setBackendError(
          err instanceof Error ? err.message : 'Unknown backend error',
        );
      } finally {
        setBackendLoading(false);
      }
    },
    [processMessages, resetSurfaces, supportEndpoint],
  );

  useEffect(() => {
    backendModeRef.current = backendMode;
  }, [backendMode]);

  useEffect(() => {
    sendSupportPayloadRef.current = sendSupportPayload;
  }, [sendSupportPayload]);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const response = await fetch(supportHealthEndpoint);
        if (!response.ok) {
          throw new Error('Health check failed');
        }
        const data = (await response.json()) as { status?: string };
        if (!cancelled) {
          setBackendHealth(data.status === 'healthy' ? 'healthy' : 'unhealthy');
        }
      } catch {
        if (!cancelled) {
          setBackendHealth('unhealthy');
        }
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [supportHealthEndpoint]);

  const currentScene = useMemo(
    () => SCENES.find(scene => scene.id === selectedScene) ?? SCENES[0],
    [selectedScene],
  );

  const showScene = useCallback(
    (scene: GalleryScene) => {
      resetSurfaces();
      processMessages(scene.messages);
      setBackendMode(false);
      setBackendSummary('');
      setBackendError(null);
    },
    [processMessages, resetSurfaces],
  );

  const showAllScenes = useCallback(() => {
    resetSurfaces();
    SCENES.forEach(scene => {
      processMessages(scene.messages);
    });
    setBackendMode(false);
    setBackendSummary('');
    setBackendError(null);
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
          backgroundColor: 'canvas.default',
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
          <Button
            size="small"
            variant="default"
            onClick={() =>
              void sendSupportPayload({
                query:
                  'Production deploy is failing with auth errors. Help me triage.',
              })
            }
            disabled={backendLoading}
          >
            {backendLoading
              ? 'Loading Python Backend…'
              : 'Load Python Backend Agent'}
          </Button>
        </Box>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Python endpoint status: {backendHealth}
        </Text>
        {backendSummary && (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{backendSummary}</Text>
        )}
        {backendError && (
          <Text sx={{ color: 'danger.fg', fontSize: 1 }}>{backendError}</Text>
        )}
      </Box>

      <Box
        style={themeStyle}
        sx={{
          ...A2UI_RENDER_SCOPE_SX,
          width: '100%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {surfaces.map(surface => (
          <Box key={surface.id} sx={{ width: '100%' }}>
            <A2uiSurfaceComposed surface={surface} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const A2UiComponentsGalleryScene: React.FC = () => {
  const [lastAction, setLastAction] = useState<A2uiClientAction | null>(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    console.warn('A2UI Gallery Action:', action);
    setLastAction(action);
  }, []);

  return (
    <>
      <A2uiMarkdownProvider>
        <Box
          sx={{
            height: '100%',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.default',
            }}
          >
            <Text as="h1" sx={{ fontSize: 3, fontWeight: 'bold' }}>
              🎨 A2UI Components Gallery
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
              backgroundColor: 'canvas.default',
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
    </>
  );
};

export default A2UiComponentsGalleryScene;
