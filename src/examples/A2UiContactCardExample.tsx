/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text } from '@primer/react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { createSceneMessages, useA2uiProcessor } from './utils/a2ui';

const CONTACT_SURFACE_ID = 'contact-card-v09';

const CONTACT_CARD_MESSAGES = createSceneMessages({
  surfaceId: CONTACT_SURFACE_ID,
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
        'actions',
      ],
    },
    {
      id: 'avatar-image',
      component: 'Image',
      url: { path: '/avatar' },
      fit: 'cover',
      variant: 'avatar',
    },
    { id: 'name', component: 'Text', text: { path: '/name' }, variant: 'h2' },
    {
      id: 'title',
      component: 'Text',
      text: { path: '/title' },
      variant: 'body',
    },
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
    {
      id: 'actions',
      component: 'Row',
      justify: 'center',
      children: ['follow-button', 'message-button'],
    },
    { id: 'follow-button-label', component: 'Text', text: 'Follow' },
    {
      id: 'follow-button',
      component: 'Button',
      variant: 'primary',
      child: 'follow-button-label',
      action: {
        event: {
          name: 'follow_contact',
          context: {
            contactId: { path: '/contactId' },
            name: { path: '/name' },
          },
        },
      },
    },
    { id: 'message-button-label', component: 'Text', text: 'Message' },
    {
      id: 'message-button',
      component: 'Button',
      child: 'message-button-label',
      action: {
        event: {
          name: 'message_contact',
          context: {
            email: { path: '/email' },
            name: { path: '/name' },
          },
        },
      },
    },
  ],
  value: {
    contactId: 'contact_001',
    avatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    name: 'David Park',
    title: 'Engineering Manager',
    phone: '+1 (555) 234-5678',
    email: 'david.park@company.com',
    location: 'San Francisco, CA',
  },
});

function ContactCardContent({
  onAction,
}: {
  onAction: (action: A2uiClientAction) => void;
}) {
  const { surfaces, processMessages, resetSurfaces } =
    useA2uiProcessor(onAction);

  const loadCard = useCallback(() => {
    resetSurfaces();
    processMessages(CONTACT_CARD_MESSAGES);
  }, [processMessages, resetSurfaces]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 3, px: 3, pb: 3 }}
    >
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button size="small" variant="primary" onClick={loadCard}>
          Reload Card
        </Button>
        <Button size="small" variant="invisible" onClick={resetSurfaces}>
          Clear
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gap: 3 }}>
        {surfaces.map(surface => (
          <Box
            key={surface.id}
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              p: 3,
              backgroundColor: 'canvas.subtle',
            }}
          >
            <A2uiSurface surface={surface} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const A2UiContactCardExample: React.FC = () => {
  const [lastAction, setLastAction] = useState<A2uiClientAction | null>(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    console.log('A2UI Contact Card Action:', action);
    setLastAction(action);
  }, []);

  const actionPreview = useMemo(() => {
    if (!lastAction) {
      return 'Trigger an action from the card to inspect the event payload.';
    }
    return JSON.stringify(lastAction, null, 2);
  }, [lastAction]);

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
              👤 A2UI Contact Card
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              Uses MessageProcessor + A2uiSurface with native A2UI protocol
              messages.
            </Text>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: ['1fr', '2fr 1fr'],
              gap: 3,
              p: 3,
            }}
          >
            <ContactCardContent onAction={handleAction} />

            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                p: 3,
                backgroundColor: 'canvas.subtle',
                fontFamily: 'mono',
                fontSize: 0,
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
              }}
            >
              {actionPreview}
            </Box>
          </Box>
        </Box>
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiContactCardExample;
