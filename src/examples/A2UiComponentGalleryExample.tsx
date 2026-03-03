/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiComponentGalleryExample
 *
 * Showcases the full catalog of A2UI components rendered via @a2ui/react.
 * Uses static A2UI JSON messages (no backend required) to demonstrate:
 * - Text, Button, CheckBox, Slider, TextField, DateTimeInput
 * - MultipleChoice (default, chips, filterable)
 * - Row, Column, Card, List, Tabs, Divider, Modal
 * - Icon, Image, Video, AudioPlayer
 *
 * All messages follow the A2UI three-step pattern:
 *   beginRendering → surfaceUpdate → dataModelUpdate
 */

import React, { useState, useCallback } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { Text, Button as PrimerButton } from '@primer/react';
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
  initializeDefaultCatalog,
} from '@a2ui/react';
import type { Types } from '@a2ui/react';

initializeDefaultCatalog();

// ---------------------------------------------------------------------------
// Static A2UI messages for each gallery section
// ---------------------------------------------------------------------------

/** Helper: single-component surface (begin + update + data) */
function singleComponentSurface(
  surfaceId: string,
  rootId: string,
  componentDef: Record<string, unknown>,
  data?: Types.ServerToClientMessage,
): Types.ServerToClientMessage[] {
  const msgs: Types.ServerToClientMessage[] = [
    {
      beginRendering: { surfaceId, root: rootId },
    } as unknown as Types.ServerToClientMessage,
    {
      surfaceUpdate: {
        surfaceId,
        components: [{ id: rootId, component: componentDef }],
      },
    } as unknown as Types.ServerToClientMessage,
  ];
  if (data) msgs.push(data);
  return msgs;
}

/** Helper: multi-component surface */
function multiComponentSurface(
  surfaceId: string,
  rootId: string,
  components: Array<{
    id: string;
    component?: Record<string, unknown>;
    weight?: number;
  }>,
  data?: Types.ServerToClientMessage,
): Types.ServerToClientMessage[] {
  const msgs: Types.ServerToClientMessage[] = [
    {
      beginRendering: { surfaceId, root: rootId },
    } as unknown as Types.ServerToClientMessage,
    {
      surfaceUpdate: { surfaceId, components },
    } as unknown as Types.ServerToClientMessage,
  ];
  if (data) msgs.push(data);
  return msgs;
}

function dataModelMsg(
  surfaceId: string,
  contents: Array<{
    key: string;
    valueString?: string;
    valueBoolean?: boolean;
    valueNumber?: number;
    valueMap?: unknown[];
  }>,
): Types.ServerToClientMessage {
  return {
    dataModelUpdate: { surfaceId, path: '/', contents },
  } as unknown as Types.ServerToClientMessage;
}

// --- Gallery sections ---

function textFieldMessages(): Types.ServerToClientMessage[] {
  return singleComponentSurface(
    'gallery-text',
    'gallery-text-root',
    {
      TextField: {
        label: { literalString: 'Enter some text' },
        text: { path: 'galleryData/textField' },
      },
    },
    dataModelMsg('gallery-text', [
      {
        key: 'galleryData',
        valueMap: [{ key: 'textField', valueString: 'Hello World' }],
      },
    ]),
  );
}

function checkboxMessages(): Types.ServerToClientMessage[] {
  return singleComponentSurface(
    'gallery-checkbox',
    'gallery-checkbox-root',
    {
      CheckBox: {
        label: { literalString: 'Toggle me' },
        value: { path: 'galleryData/checkbox' },
      },
    },
    dataModelMsg('gallery-checkbox', [
      {
        key: 'galleryData',
        valueMap: [{ key: 'checkbox', valueBoolean: false }],
      },
    ]),
  );
}

function sliderMessages(): Types.ServerToClientMessage[] {
  return singleComponentSurface(
    'gallery-slider',
    'gallery-slider-root',
    {
      Slider: {
        value: { path: 'galleryData/slider' },
        minValue: 0,
        maxValue: 100,
      },
    },
    dataModelMsg('gallery-slider', [
      { key: 'galleryData', valueMap: [{ key: 'slider', valueNumber: 30 }] },
    ]),
  );
}

function dateTimeMessages(): Types.ServerToClientMessage[] {
  return singleComponentSurface(
    'gallery-date',
    'gallery-date-root',
    {
      DateTimeInput: {
        value: { path: 'galleryData/date' },
        enableDate: true,
      },
    },
    dataModelMsg('gallery-date', [
      {
        key: 'galleryData',
        valueMap: [{ key: 'date', valueString: '2025-10-26' }],
      },
    ]),
  );
}

function multipleChoiceMessages(): Types.ServerToClientMessage[] {
  return singleComponentSurface(
    'gallery-mc',
    'gallery-mc-root',
    {
      MultipleChoice: {
        selections: { path: 'galleryData/favorites' },
        options: [
          { label: { literalString: 'Apple' }, value: 'A' },
          { label: { literalString: 'Banana' }, value: 'B' },
          { label: { literalString: 'Cherry' }, value: 'C' },
        ],
      },
    },
    dataModelMsg('gallery-mc', [
      {
        key: 'galleryData',
        valueMap: [
          { key: 'favorites', valueMap: [{ key: '0', valueString: 'A' }] },
        ],
      },
    ]),
  );
}

function buttonMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-button', 'gallery-button-root', [
    {
      id: 'gallery-button-text',
      component: { Text: { text: { literalString: 'Trigger Action' } } },
    },
    {
      id: 'gallery-button-root',
      component: {
        Button: {
          child: 'gallery-button-text',
          primary: true,
          action: {
            name: 'custom_action',
            context: [
              { key: 'info', value: { literalString: 'Button Clicked!' } },
            ],
          },
        },
      },
    },
  ]);
}

function tabsMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-tabs', 'gallery-tabs-root', [
    {
      id: 'tab-1-content',
      component: {
        Text: {
          text: {
            literalString:
              'First Tab Content — TextField, CheckBox, and Slider are in other sections.',
          },
        },
      },
    },
    {
      id: 'tab-2-content',
      component: {
        Text: {
          text: {
            literalString: 'Second Tab Content — Cards, Lists, and Modals too!',
          },
        },
      },
    },
    {
      id: 'gallery-tabs-root',
      component: {
        Tabs: {
          tabItems: [
            { title: { literalString: 'View One' }, child: 'tab-1-content' },
            { title: { literalString: 'View Two' }, child: 'tab-2-content' },
          ],
        },
      },
    },
  ]);
}

function iconRowMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-icons', 'gallery-icons-root', [
    {
      id: 'gallery-icons-root',
      component: {
        Row: {
          children: { explicitList: ['icon-1', 'icon-2', 'icon-3', 'icon-4'] },
          distribution: 'spaceEvenly',
          alignment: 'center',
        },
      },
    },
    { id: 'icon-1', component: { Icon: { name: { literalString: 'star' } } } },
    { id: 'icon-2', component: { Icon: { name: { literalString: 'home' } } } },
    {
      id: 'icon-3',
      component: { Icon: { name: { literalString: 'settings' } } },
    },
    {
      id: 'icon-4',
      component: { Icon: { name: { literalString: 'search' } } },
    },
  ]);
}

function cardMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-card', 'gallery-card-root', [
    { id: 'gallery-card-root', component: { Card: { child: 'card-inner' } } },
    {
      id: 'card-inner',
      component: {
        Column: {
          children: {
            explicitList: ['card-title', 'card-divider', 'card-body'],
          },
          alignment: 'stretch',
        },
      },
    },
    {
      id: 'card-title',
      component: {
        Text: { text: { literalString: 'Card Title' }, usageHint: 'h3' },
      },
    },
    { id: 'card-divider', component: { Divider: { axis: 'horizontal' } } },
    {
      id: 'card-body',
      component: {
        Text: {
          text: {
            literalString:
              'This is the card body content. Cards wrap any child component.',
          },
        },
      },
    },
  ]);
}

function listMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-list', 'gallery-list-root', [
    {
      id: 'gallery-list-root',
      component: {
        List: {
          children: {
            explicitList: ['list-item-1', 'list-item-2', 'list-item-3'],
          },
          direction: 'vertical',
          alignment: 'stretch',
        },
      },
    },
    {
      id: 'list-item-1',
      component: { Text: { text: { literalString: '📄 Item 1 — Documents' } } },
    },
    {
      id: 'list-item-2',
      component: { Text: { text: { literalString: '📊 Item 2 — Analytics' } } },
    },
    {
      id: 'list-item-3',
      component: { Text: { text: { literalString: '⚙️ Item 3 — Settings' } } },
    },
  ]);
}

function modalMessages(): Types.ServerToClientMessage[] {
  return multiComponentSurface('gallery-modal', 'gallery-modal-root', [
    {
      id: 'gallery-modal-root',
      component: {
        Modal: {
          entryPointChild: 'modal-trigger-btn',
          contentChild: 'modal-body',
        },
      },
    },
    {
      id: 'modal-trigger-btn',
      component: {
        Button: {
          child: 'modal-btn-text',
          primary: false,
          action: { name: 'noop' },
        },
      },
    },
    {
      id: 'modal-btn-text',
      component: { Text: { text: { literalString: 'Open Modal' } } },
    },
    {
      id: 'modal-body',
      component: {
        Text: {
          text: {
            literalString: 'This is modal content! Click outside to close.',
          },
        },
      },
    },
  ]);
}

/** Collect all gallery messages */
function getAllGalleryMessages(): Types.ServerToClientMessage[] {
  return [
    ...textFieldMessages(),
    ...checkboxMessages(),
    ...sliderMessages(),
    ...dateTimeMessages(),
    ...multipleChoiceMessages(),
    ...buttonMessages(),
    ...tabsMessages(),
    ...iconRowMessages(),
    ...cardMessages(),
    ...listMessages(),
    ...modalMessages(),
  ];
}

// ---------------------------------------------------------------------------
// Gallery section metadata
// ---------------------------------------------------------------------------

interface GallerySection {
  label: string;
  surfaceId: string;
  messages: () => Types.ServerToClientMessage[];
}

const SECTIONS: GallerySection[] = [
  {
    label: 'TextField',
    surfaceId: 'gallery-text',
    messages: textFieldMessages,
  },
  {
    label: 'CheckBox',
    surfaceId: 'gallery-checkbox',
    messages: checkboxMessages,
  },
  { label: 'Slider', surfaceId: 'gallery-slider', messages: sliderMessages },
  {
    label: 'DateTimeInput',
    surfaceId: 'gallery-date',
    messages: dateTimeMessages,
  },
  {
    label: 'MultipleChoice',
    surfaceId: 'gallery-mc',
    messages: multipleChoiceMessages,
  },
  { label: 'Button', surfaceId: 'gallery-button', messages: buttonMessages },
  { label: 'Tabs', surfaceId: 'gallery-tabs', messages: tabsMessages },
  { label: 'Icons', surfaceId: 'gallery-icons', messages: iconRowMessages },
  {
    label: 'Card + Divider',
    surfaceId: 'gallery-card',
    messages: cardMessages,
  },
  { label: 'List', surfaceId: 'gallery-list', messages: listMessages },
  { label: 'Modal', surfaceId: 'gallery-modal', messages: modalMessages },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function GalleryContent() {
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();
  const [loaded, setLoaded] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    clearSurfaces();
    processMessages(getAllGalleryMessages());
    setLoaded(true);
    setSelectedSection(null);
  }, [processMessages, clearSurfaces]);

  const loadSection = useCallback(
    (section: GallerySection) => {
      clearSurfaces();
      processMessages(section.messages());
      setLoaded(true);
      setSelectedSection(section.surfaceId);
    },
    [processMessages, clearSurfaces],
  );

  const surfaces = getSurfaces();
  const surfaceEntries = Array.from(surfaces.entries());

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <Box
        sx={{
          width: '240px',
          borderRight: '1px solid',
          borderColor: 'border.default',
          backgroundColor: 'canvas.subtle',
          padding: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          overflowY: 'auto',
        }}
      >
        <Text
          as="h3"
          sx={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 2 }}
        >
          Components
        </Text>

        <PrimerButton
          variant={selectedSection === null && loaded ? 'primary' : 'default'}
          onClick={loadAll}
          sx={{ width: '100%', justifyContent: 'flex-start', marginBottom: 2 }}
        >
          Show All
        </PrimerButton>

        {SECTIONS.map(section => (
          <PrimerButton
            key={section.surfaceId}
            variant={
              selectedSection === section.surfaceId ? 'primary' : 'invisible'
            }
            onClick={() => loadSection(section)}
            sx={{ width: '100%', justifyContent: 'flex-start' }}
          >
            {section.label}
          </PrimerButton>
        ))}
      </Box>

      {/* Content area */}
      <Box sx={{ flex: 1, padding: 4, overflowY: 'auto' }}>
        {!loaded ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 3,
            }}
          >
            <Text sx={{ fontSize: '3rem' }}>🎨</Text>
            <Text as="h2" sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              A2UI Component Gallery
            </Text>
            <Text
              sx={{ color: 'fg.muted', textAlign: 'center', maxWidth: '400px' }}
            >
              Browse the full catalog of A2UI components rendered via
              @a2ui/react. Click "Show All" or pick a component from the
              sidebar.
            </Text>
            <PrimerButton variant="primary" onClick={loadAll}>
              Show All Components
            </PrimerButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {surfaceEntries.map(([surfaceId]) => (
              <Box key={surfaceId}>
                <Text
                  as="h4"
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: 'fg.muted',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 2,
                  }}
                >
                  {surfaceId}
                </Text>
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    padding: 3,
                    backgroundColor: 'canvas.default',
                  }}
                >
                  <A2UIRenderer surfaceId={surfaceId} />
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * A2UiComponentGalleryExample — Kitchen sink of all A2UI components.
 * No backend required — uses static A2UI JSON messages rendered client-side.
 */
const A2UiComponentGalleryExample: React.FC = () => {
  const handleAction = useCallback(
    (actionMessage: Types.A2UIClientEventMessage) => {
      console.log('Gallery action:', actionMessage);
      // In a real app this would be sent back to the agent
      alert(`Action: ${JSON.stringify(actionMessage, null, 2)}`);
    },
    [],
  );

  return (
    <ThemedProvider>
      <A2UIProvider onAction={handleAction}>
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
              🎨 A2UI Component Gallery
            </Text>
            <Text sx={{ fontSize: '0.875rem', color: 'fg.muted' }}>
              Static A2UI messages rendered via @a2ui/react — no backend needed
            </Text>
          </Box>

          {/* Gallery */}
          <GalleryContent />
        </Box>
      </A2UIProvider>
    </ThemedProvider>
  );
};

export default A2UiComponentGalleryExample;
