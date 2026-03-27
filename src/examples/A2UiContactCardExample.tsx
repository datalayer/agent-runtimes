/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiContactCardExample
 *
 * Demonstrates a rich contact card UI rendered via A2UI protocol.
 * Uses static A2UI JSON messages (no backend required) featuring:
 * - Data-bound contact information (name, title, email, phone, etc.)
 * - Avatar image with cover fit
 * - Icon + text info rows (calendar, location, email, phone)
 * - Interactive buttons with actions (Follow, Message)
 * - Card and Column layout composition
 * - Divider for visual separation
 *
 * Based on the contact_lookup sample from the A2UI repository.
 */

import React, { useState, useCallback } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
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
// Contact data
// ---------------------------------------------------------------------------

interface Contact {
  name: string;
  title: string;
  team: string;
  location: string;
  email: string;
  mobile: string;
  calendar: string;
  imageUrl: string;
}

const CONTACTS: Contact[] = [
  {
    name: 'Alice Johnson',
    title: 'Staff Engineer',
    team: 'Platform',
    location: 'San Francisco, CA',
    email: 'alice@example.com',
    mobile: '+1 (415) 555-0101',
    calendar: 'Available',
    imageUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Alice',
  },
  {
    name: 'Bob Martinez',
    title: 'Product Manager',
    team: 'Growth',
    location: 'New York, NY',
    email: 'bob@example.com',
    mobile: '+1 (212) 555-0202',
    calendar: 'In a meeting',
    imageUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Bob',
  },
  {
    name: 'Casey Smith',
    title: 'Digital Marketing Specialist',
    team: 'Marketing',
    location: 'London, UK',
    email: 'casey@example.com',
    mobile: '+44 20 7946 0958',
    calendar: 'Out of office',
    imageUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Casey',
  },
];

// ---------------------------------------------------------------------------
// A2UI message builders
// ---------------------------------------------------------------------------

function contactCardMessages(contact: Contact): Types.ServerToClientMessage[] {
  return [
    // Begin rendering
    { beginRendering: { surfaceId: 'contact-card', root: 'main_card' } },

    // Surface update - component tree
    {
      surfaceUpdate: {
        surfaceId: 'contact-card',
        components: [
          {
            id: 'profile_image',
            component: {
              Image: {
                url: { path: '/imageUrl' },
                usageHint: 'avatar',
                fit: 'cover',
              },
            },
          },
          {
            id: 'user_heading',
            weight: 1,
            component: { Text: { text: { path: '/name' }, usageHint: 'h2' } },
          },
          {
            id: 'description_text_1',
            component: { Text: { text: { path: '/title' } } },
          },
          {
            id: 'description_text_2',
            component: { Text: { text: { path: '/team' } } },
          },
          {
            id: 'description_column',
            component: {
              Column: {
                children: {
                  explicitList: [
                    'user_heading',
                    'description_text_1',
                    'description_text_2',
                  ],
                },
                alignment: 'center',
              },
            },
          },

          // Calendar row
          {
            id: 'calendar_icon',
            component: { Icon: { name: { literalString: 'calendar_today' } } },
          },
          {
            id: 'calendar_primary_text',
            component: {
              Text: { usageHint: 'h5', text: { path: '/calendar' } },
            },
          },
          {
            id: 'calendar_secondary_text',
            component: { Text: { text: { literalString: 'Calendar' } } },
          },
          {
            id: 'calendar_text_column',
            component: {
              Column: {
                children: {
                  explicitList: [
                    'calendar_primary_text',
                    'calendar_secondary_text',
                  ],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },
          {
            id: 'info_row_1',
            component: {
              Row: {
                children: {
                  explicitList: ['calendar_icon', 'calendar_text_column'],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },

          // Location row
          {
            id: 'location_icon',
            component: { Icon: { name: { literalString: 'location_on' } } },
          },
          {
            id: 'location_primary_text',
            component: {
              Text: { usageHint: 'h5', text: { path: '/location' } },
            },
          },
          {
            id: 'location_secondary_text',
            component: { Text: { text: { literalString: 'Location' } } },
          },
          {
            id: 'location_text_column',
            component: {
              Column: {
                children: {
                  explicitList: [
                    'location_primary_text',
                    'location_secondary_text',
                  ],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },
          {
            id: 'info_row_2',
            component: {
              Row: {
                children: {
                  explicitList: ['location_icon', 'location_text_column'],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },

          // Email row
          {
            id: 'mail_icon',
            component: { Icon: { name: { literalString: 'mail' } } },
          },
          {
            id: 'mail_primary_text',
            component: { Text: { usageHint: 'h5', text: { path: '/email' } } },
          },
          {
            id: 'mail_secondary_text',
            component: { Text: { text: { literalString: 'Email' } } },
          },
          {
            id: 'mail_text_column',
            component: {
              Column: {
                children: {
                  explicitList: ['mail_primary_text', 'mail_secondary_text'],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },
          {
            id: 'info_row_3',
            component: {
              Row: {
                children: { explicitList: ['mail_icon', 'mail_text_column'] },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },

          // Divider
          { id: 'div', component: { Divider: {} } },

          // Phone row
          {
            id: 'call_icon',
            component: { Icon: { name: { literalString: 'call' } } },
          },
          {
            id: 'call_primary_text',
            component: { Text: { usageHint: 'h5', text: { path: '/mobile' } } },
          },
          {
            id: 'call_secondary_text',
            component: { Text: { text: { literalString: 'Mobile' } } },
          },
          {
            id: 'call_text_column',
            component: {
              Column: {
                children: {
                  explicitList: ['call_primary_text', 'call_secondary_text'],
                },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },
          {
            id: 'info_row_4',
            component: {
              Row: {
                children: { explicitList: ['call_icon', 'call_text_column'] },
                distribution: 'start',
                alignment: 'start',
              },
            },
          },

          // Info column
          {
            id: 'info_rows_column',
            weight: 1,
            component: {
              Column: {
                children: {
                  explicitList: [
                    'info_row_1',
                    'info_row_2',
                    'info_row_3',
                    'info_row_4',
                  ],
                },
                alignment: 'stretch',
              },
            },
          },

          // Action buttons
          {
            id: 'button_1_text',
            component: { Text: { text: { literalString: 'Follow' } } },
          },
          {
            id: 'button_1',
            component: {
              Button: {
                child: 'button_1_text',
                primary: true,
                action: {
                  name: 'follow_contact',
                  context: [{ key: 'contactName', value: { path: '/name' } }],
                },
              },
            },
          },
          {
            id: 'button_2_text',
            component: { Text: { text: { literalString: 'Message' } } },
          },
          {
            id: 'button_2',
            component: {
              Button: {
                child: 'button_2_text',
                primary: false,
                action: {
                  name: 'send_message',
                  context: [{ key: 'contactName', value: { path: '/name' } }],
                },
              },
            },
          },
          {
            id: 'action_buttons_row',
            component: {
              Row: {
                children: { explicitList: ['button_1', 'button_2'] },
                distribution: 'center',
                alignment: 'center',
              },
            },
          },

          // Main layout
          {
            id: 'main_column',
            component: {
              Column: {
                children: {
                  explicitList: [
                    'profile_image',
                    'description_column',
                    'div',
                    'info_rows_column',
                    'action_buttons_row',
                  ],
                },
                alignment: 'stretch',
              },
            },
          },
          { id: 'main_card', component: { Card: { child: 'main_column' } } },
        ],
      },
    },

    // Data model
    {
      dataModelUpdate: {
        surfaceId: 'contact-card',
        path: '/',
        contents: [
          { key: 'name', valueString: contact.name },
          { key: 'title', valueString: contact.title },
          { key: 'team', valueString: contact.team },
          { key: 'location', valueString: contact.location },
          { key: 'email', valueString: contact.email },
          { key: 'mobile', valueString: contact.mobile },
          { key: 'calendar', valueString: contact.calendar },
          { key: 'imageUrl', valueString: contact.imageUrl },
        ],
      },
    },
  ] as unknown as Types.ServerToClientMessage[];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ContactCardContent() {
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const loadContact = useCallback(
    (idx: number) => {
      clearSurfaces();
      processMessages(contactCardMessages(CONTACTS[idx]));
      setSelectedIdx(idx);
    },
    [processMessages, clearSurfaces],
  );

  const surfaces = getSurfaces();
  const surfaceEntries = Array.from(surfaces.entries());

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Contact list sidebar */}
      <Box
        sx={{
          width: '260px',
          borderRight: '1px solid',
          borderColor: 'border.default',
          backgroundColor: 'canvas.subtle',
          padding: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Text
          as="h3"
          sx={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 2 }}
        >
          Contacts
        </Text>

        {CONTACTS.map((contact, idx) => (
          <PrimerButton
            key={contact.email}
            variant={selectedIdx === idx ? 'primary' : 'default'}
            onClick={() => loadContact(idx)}
            sx={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <Text sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                {contact.name}
              </Text>
              <Text
                sx={{
                  fontSize: '0.75rem',
                  color: selectedIdx === idx ? 'fg.onEmphasis' : 'fg.muted',
                }}
              >
                {contact.title}
              </Text>
            </Box>
          </PrimerButton>
        ))}
      </Box>

      {/* Card display area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
        }}
      >
        {selectedIdx === null ? (
          <Box sx={{ textAlign: 'center' }}>
            <Text sx={{ fontSize: '3rem' }}>👤</Text>
            <Text as="p" sx={{ color: 'fg.muted', marginTop: 2 }}>
              Select a contact from the sidebar
            </Text>
          </Box>
        ) : (
          <Box sx={{ maxWidth: '420px', width: '100%' }}>
            {surfaceEntries.map(([surfaceId]) => (
              <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * A2UiContactCardExample — Rich contact card with data binding & actions.
 * No backend required — uses static A2UI JSON messages rendered client-side.
 */
const A2UiContactCardExample: React.FC = () => {
  const handleAction = useCallback(
    (actionMessage: Types.A2UIClientEventMessage) => {
      console.log('Contact action:', actionMessage);
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
              👤 A2UI Contact Card
            </Text>
            <Text sx={{ fontSize: '0.875rem', color: 'fg.muted' }}>
              Data-bound contact card with actions — based on A2UI
              contact_lookup sample
            </Text>
          </Box>

          {/* Content */}
          <ContactCardContent />
        </Box>
      </A2UIProvider>
    </ThemedProvider>
  );
};

export default A2UiContactCardExample;
