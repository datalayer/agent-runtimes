/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiViewerExample
 *
 * Demonstrates the standalone A2UIViewer component from @a2ui/react.
 * Unlike A2UIProvider + A2UIRenderer (which require context), A2UIViewer
 * is a self-contained component that takes component definitions directly.
 *
 * Features:
 * - Standalone rendering — no A2UIProvider needed
 * - Multiple pre-built A2UI scenes (recipe card, booking form, dashboard)
 * - Shows how to use A2UIViewer for embedding A2UI in any React context
 *
 * No backend required — uses static ComponentInstance[] arrays.
 */

import React, { useState, useCallback } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { Text, Button as PrimerButton, SegmentedControl } from '@primer/react';
import { A2UIViewer, initializeDefaultCatalog } from '@a2ui/react';
import type { ComponentInstance, A2UIActionEvent } from '@a2ui/react';

initializeDefaultCatalog();

// ---------------------------------------------------------------------------
// Scene definitions — each is a standalone ComponentInstance[] + data
// ---------------------------------------------------------------------------

interface A2UIScene {
  label: string;
  emoji: string;
  description: string;
  root: string;
  components: ComponentInstance[];
  data?: Record<string, unknown>;
}

const SCENES: A2UIScene[] = [
  // --- Recipe Card ---
  {
    label: 'Recipe Card',
    emoji: '🍲',
    description:
      'A rich recipe card with image, rating, and timing info (from A2UI MCP sample).',
    root: 'root-column',
    components: [
      { id: 'root-column', component: { Card: { child: 'main-column' } } },
      {
        id: 'main-column',
        component: {
          Column: {
            children: { explicitList: ['recipe-image', 'content'] },
            gap: 'small',
          },
        },
      },
      {
        id: 'recipe-image',
        component: {
          Image: {
            url: { path: '/image' },
            altText: { path: '/title' },
            fit: 'cover',
          },
        },
      },
      {
        id: 'content',
        component: {
          Column: {
            children: {
              explicitList: ['title', 'rating-row', 'times-row', 'servings'],
            },
            gap: 'small',
          },
        },
      },
      {
        id: 'title',
        component: { Text: { text: { path: '/title' }, usageHint: 'h3' } },
      },
      {
        id: 'rating-row',
        component: {
          Row: {
            children: { explicitList: ['star-icon', 'rating', 'review-count'] },
            gap: 'small',
            alignment: 'center',
          },
        },
      },
      {
        id: 'star-icon',
        component: { Icon: { name: { literalString: 'star' } } },
      },
      {
        id: 'rating',
        component: { Text: { text: { path: '/rating' }, usageHint: 'body' } },
      },
      {
        id: 'review-count',
        component: {
          Text: { text: { path: '/reviewCount' }, usageHint: 'caption' },
        },
      },
      {
        id: 'times-row',
        component: {
          Row: {
            children: { explicitList: ['prep-time', 'cook-time'] },
            gap: 'medium',
          },
        },
      },
      {
        id: 'prep-time',
        component: {
          Row: {
            children: { explicitList: ['prep-icon', 'prep-text'] },
            gap: 'small',
            alignment: 'center',
          },
        },
      },
      {
        id: 'prep-icon',
        component: { Icon: { name: { literalString: 'timer' } } },
      },
      {
        id: 'prep-text',
        component: {
          Text: { text: { path: '/prepTime' }, usageHint: 'caption' },
        },
      },
      {
        id: 'cook-time',
        component: {
          Row: {
            children: { explicitList: ['cook-icon', 'cook-text'] },
            gap: 'small',
            alignment: 'center',
          },
        },
      },
      {
        id: 'cook-icon',
        component: { Icon: { name: { literalString: 'shoppingCart' } } },
      },
      {
        id: 'cook-text',
        component: {
          Text: { text: { path: '/cookTime' }, usageHint: 'caption' },
        },
      },
      {
        id: 'servings',
        component: {
          Text: { text: { path: '/servings' }, usageHint: 'caption' },
        },
      },
    ],
    data: {
      image:
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=180&fit=crop',
      title: 'Mediterranean Quinoa Bowl',
      rating: 4.9,
      reviewCount: '(1,247 reviews)',
      prepTime: '15 min prep',
      cookTime: '20 min cook',
      servings: 'Serves 4',
    },
  },

  // --- Booking Form ---
  {
    label: 'Booking Form',
    emoji: '📅',
    description:
      'A restaurant booking form with text fields, date picker, and submit button.',
    root: 'booking-form-column',
    components: [
      {
        id: 'booking-form-column',
        component: {
          Column: {
            children: {
              explicitList: [
                'booking-title',
                'party-size-field',
                'datetime-field',
                'dietary-field',
                'submit-button',
              ],
            },
          },
        },
      },
      {
        id: 'booking-title',
        component: { Text: { usageHint: 'h2', text: { path: '/title' } } },
      },
      {
        id: 'party-size-field',
        component: {
          TextField: {
            label: { literalString: 'Party Size' },
            text: { path: '/partySize' },
          },
        },
      },
      {
        id: 'datetime-field',
        component: {
          DateTimeInput: {
            label: { literalString: 'Date & Time' },
            value: { path: '/reservationTime' },
            enableDate: true,
            enableTime: true,
          },
        },
      },
      {
        id: 'dietary-field',
        component: {
          TextField: {
            label: { literalString: 'Dietary Requirements' },
            text: { path: '/dietary' },
          },
        },
      },
      {
        id: 'submit-button',
        component: {
          Button: {
            child: 'submit-text',
            action: {
              name: 'submit_booking',
              context: [
                { key: 'partySize', value: { path: '/partySize' } },
                { key: 'reservationTime', value: { path: '/reservationTime' } },
                { key: 'dietary', value: { path: '/dietary' } },
              ],
            },
          },
        },
      },
      {
        id: 'submit-text',
        component: { Text: { text: { literalString: 'Submit Reservation' } } },
      },
    ],
    data: {
      title: 'Book a Table at The Fancy Place',
      partySize: '2',
      reservationTime: '',
      dietary: '',
    },
  },

  // --- Sales Dashboard ---
  {
    label: 'Sales Dashboard',
    emoji: '📊',
    description:
      'A simple data dashboard with cards showing sales by category.',
    root: 'root-column',
    components: [
      {
        id: 'root-column',
        component: {
          Column: {
            children: {
              explicitList: ['dash-title', 'dash-row-1', 'dash-row-2'],
            },
          },
        },
      },
      {
        id: 'dash-title',
        component: {
          Text: {
            text: { literalString: 'Sales by Category' },
            usageHint: 'h2',
          },
        },
      },
      // Row 1
      {
        id: 'dash-row-1',
        component: {
          Row: {
            children: { explicitList: ['card-apparel', 'card-electronics'] },
            distribution: 'spaceEvenly',
          },
        },
      },
      { id: 'card-apparel', component: { Card: { child: 'apparel-col' } } },
      {
        id: 'apparel-col',
        component: {
          Column: {
            children: { explicitList: ['apparel-label', 'apparel-value'] },
          },
        },
      },
      {
        id: 'apparel-label',
        component: {
          Text: { text: { literalString: 'Apparel' }, usageHint: 'caption' },
        },
      },
      {
        id: 'apparel-value',
        component: {
          Text: { text: { literalString: '$41,200' }, usageHint: 'h3' },
        },
      },
      {
        id: 'card-electronics',
        component: { Card: { child: 'electronics-col' } },
      },
      {
        id: 'electronics-col',
        component: {
          Column: {
            children: {
              explicitList: ['electronics-label', 'electronics-value'],
            },
          },
        },
      },
      {
        id: 'electronics-label',
        component: {
          Text: {
            text: { literalString: 'Electronics' },
            usageHint: 'caption',
          },
        },
      },
      {
        id: 'electronics-value',
        component: {
          Text: { text: { literalString: '$28,900' }, usageHint: 'h3' },
        },
      },
      // Row 2
      {
        id: 'dash-row-2',
        component: {
          Row: {
            children: { explicitList: ['card-home', 'card-health'] },
            distribution: 'spaceEvenly',
          },
        },
      },
      { id: 'card-home', component: { Card: { child: 'home-col' } } },
      {
        id: 'home-col',
        component: {
          Column: { children: { explicitList: ['home-label', 'home-value'] } },
        },
      },
      {
        id: 'home-label',
        component: {
          Text: { text: { literalString: 'Home Goods' }, usageHint: 'caption' },
        },
      },
      {
        id: 'home-value',
        component: {
          Text: { text: { literalString: '$15,600' }, usageHint: 'h3' },
        },
      },
      { id: 'card-health', component: { Card: { child: 'health-col' } } },
      {
        id: 'health-col',
        component: {
          Column: {
            children: { explicitList: ['health-label', 'health-value'] },
          },
        },
      },
      {
        id: 'health-label',
        component: {
          Text: {
            text: { literalString: 'Health & Beauty' },
            usageHint: 'caption',
          },
        },
      },
      {
        id: 'health-value',
        component: {
          Text: { text: { literalString: '$10,300' }, usageHint: 'h3' },
        },
      },
    ],
  },

  // --- Confirmation ---
  {
    label: 'Confirmation',
    emoji: '✅',
    description: 'A booking confirmation card with details and action buttons.',
    root: 'confirmation-card',
    components: [
      {
        id: 'confirmation-card',
        component: { Card: { child: 'confirmation-column' } },
      },
      {
        id: 'confirmation-column',
        component: {
          Column: {
            children: {
              explicitList: [
                'confirm-title',
                'divider1',
                'confirm-details',
                'confirm-dietary',
                'divider2',
                'confirm-text',
                'divider3',
                'confirm-buttons',
              ],
            },
            alignment: 'stretch',
          },
        },
      },
      {
        id: 'confirm-title',
        component: { Text: { usageHint: 'h2', text: { path: '/title' } } },
      },
      { id: 'divider1', component: { Divider: {} } },
      {
        id: 'confirm-details',
        component: { Text: { text: { path: '/bookingDetails' } } },
      },
      {
        id: 'confirm-dietary',
        component: { Text: { text: { path: '/dietaryRequirements' } } },
      },
      { id: 'divider2', component: { Divider: {} } },
      {
        id: 'confirm-text',
        component: {
          Text: {
            usageHint: 'h5',
            text: { literalString: 'We look forward to seeing you!' },
          },
        },
      },
      { id: 'divider3', component: { Divider: {} } },
      {
        id: 'confirm-buttons',
        component: {
          Row: {
            children: { explicitList: ['modify-btn', 'cancel-btn'] },
            distribution: 'center',
          },
        },
      },
      {
        id: 'modify-btn',
        component: {
          Button: {
            child: 'modify-text',
            primary: true,
            action: { name: 'modify_booking' },
          },
        },
      },
      {
        id: 'modify-text',
        component: { Text: { text: { literalString: 'Modify Booking' } } },
      },
      {
        id: 'cancel-btn',
        component: {
          Button: {
            child: 'cancel-text',
            primary: false,
            action: { name: 'cancel_booking' },
          },
        },
      },
      {
        id: 'cancel-text',
        component: { Text: { text: { literalString: 'Cancel' } } },
      },
    ],
    data: {
      title: 'Booking Confirmed — The Fancy Place',
      bookingDetails: '4 people at 7:30 PM, Friday March 14',
      dietaryRequirements: 'Dietary: Vegetarian option requested',
    },
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * A2UiViewerExample — Standalone A2UIViewer with multiple scenes.
 * Demonstrates embedding A2UI components without a Provider context.
 */
const A2UiViewerExample: React.FC = () => {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [lastAction, setLastAction] = useState<A2UIActionEvent | null>(null);

  const scene = SCENES[sceneIdx];

  const handleAction = useCallback((action: A2UIActionEvent) => {
    console.log('Viewer action:', action);
    setLastAction(action);
  }, []);

  return (
    <ThemedProvider>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            padding: 3,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            backgroundColor: 'canvas.subtle',
          }}
        >
          <Text
            as="h1"
            sx={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            🔍 A2UI Viewer Example
          </Text>
          <Text sx={{ fontSize: '0.875rem', color: 'fg.muted' }}>
            Standalone A2UIViewer — no Provider needed, just pass components
            directly
          </Text>
        </Box>

        {/* Scene selector */}
        <Box
          sx={{
            padding: 3,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Text sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Scene:</Text>
          <SegmentedControl aria-label="Scene selector" onChange={setSceneIdx}>
            {SCENES.map((s, idx) => (
              <SegmentedControl.Button
                key={s.label}
                selected={idx === sceneIdx}
              >
                {`${s.emoji} ${s.label}`}
              </SegmentedControl.Button>
            ))}
          </SegmentedControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: 4, gap: 4 }}>
          {/* Viewer */}
          <Box
            sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <Text sx={{ color: 'fg.muted', fontSize: '0.875rem' }}>
              {scene.description}
            </Text>

            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                padding: 3,
                backgroundColor: 'canvas.default',
                maxWidth: '500px',
              }}
            >
              <A2UIViewer
                root={scene.root}
                components={scene.components}
                data={scene.data}
                onAction={handleAction}
              />
            </Box>
          </Box>

          {/* Action log */}
          <Box
            sx={{
              width: '300px',
              borderLeft: '1px solid',
              borderColor: 'border.default',
              paddingLeft: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Text as="h4" sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
              Last Action
            </Text>
            {lastAction ? (
              <Box
                as="pre"
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: 'canvas.subtle',
                  padding: 2,
                  borderRadius: 2,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(lastAction, null, 2)}
              </Box>
            ) : (
              <Text sx={{ color: 'fg.muted', fontSize: '0.8rem' }}>
                Interact with a button to see actions here.
              </Text>
            )}

            <Box sx={{ marginTop: 3 }}>
              <Text
                as="h4"
                sx={{
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                  marginBottom: 2,
                }}
              >
                Component Tree
              </Text>
              <Text sx={{ color: 'fg.muted', fontSize: '0.75rem' }}>
                {scene.components.length} components, root: "{scene.root}"
              </Text>
              <Box
                as="ul"
                sx={{
                  fontSize: '0.7rem',
                  color: 'fg.muted',
                  paddingLeft: 3,
                  marginTop: 1,
                }}
              >
                {scene.components.slice(0, 10).map(c => (
                  <li key={c.id}>
                    <Text sx={{ fontFamily: 'mono', fontSize: '0.7rem' }}>
                      {c.id}: {Object.keys(c.component)[0]}
                    </Text>
                  </li>
                ))}
                {scene.components.length > 10 && (
                  <li>
                    <Text sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                      ...and {scene.components.length - 10} more
                    </Text>
                  </li>
                )}
              </Box>
            </Box>

            <PrimerButton
              variant="invisible"
              onClick={() => {
                console.log(
                  'Scene JSON:',
                  JSON.stringify(
                    {
                      root: scene.root,
                      components: scene.components,
                      data: scene.data,
                    },
                    null,
                    2,
                  ),
                );
                alert('Scene JSON logged to console');
              }}
              sx={{ marginTop: 2, fontSize: '0.8rem' }}
            >
              Log Scene JSON
            </PrimerButton>
          </Box>
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default A2UiViewerExample;
