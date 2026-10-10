/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useEffect, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Heading, Label, Text } from '@primer/react';
import {
  buildDirectSignInRequest,
  buildSessionAssertionClaims,
  parseDiscoveryDocument,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage } from './PapExamplePage';

type Speaker = 'user' | 'atlas' | 'company';

type Message = {
  speaker: Speaker;
  text: string;
};

type JourneyStep = {
  title: string;
  summary: string;
  channel: string;
  phoneMode?: 'signin';
  messages: readonly Message[];
  facts: readonly { label: string; value: string }[];
  method: 'GET' | 'POST';
  target: string;
  detailLabel: string;
  request: string;
  response: string;
};

const conversationStart: readonly Message[] = [
  {
    speaker: 'user',
    text: "My Trailhead jacket keeps the rain out, but it isn't warm enough. Can I return it?",
  },
  {
    speaker: 'atlas',
    text: "I'll ask Northstar Outfitters about a return and whether they have something warmer.",
  },
];

const STEPS: readonly JourneyStep[] = [
  {
    title: 'Finding Northstar',
    summary:
      "Atlas reads Northstar's public PAP document to learn how returns, authorization, and the company agent are exposed.",
    channel: 'Discovery',
    messages: conversationStart,
    facts: [
      { label: 'Publishes', value: 'poppy.json · draft 0.1' },
      { label: 'Returns', value: 'Company conversation agent' },
      { label: 'Sign-in', value: "Northstar's own page" },
    ],
    method: 'GET',
    target: 'https://northstar.example/.well-known/poppy.json',
    detailLabel: 'Atlas → northstar.example',
    request: 'Accept: application/json',
    response: `200 OK
{
  "protocol_version": "0.1",
  "organization": { "name": "Northstar Outfitters" },
  "auth": { "issuer": "https://auth.northstar.example" },
  "agent": { "protocols": [{ "type": "poppy" }] }
}`,
  },
  {
    title: 'Starting signed out',
    summary:
      'Atlas opens a pairwise Session and can ask about the return before knowing who the user is. Northstar replies that order access needs sign-in.',
    channel: 'Session + conversation',
    messages: [
      ...conversationStart,
      {
        speaker: 'company',
        text: 'I can help with that. Please sign in so I can find the order.',
      },
    ],
    facts: [
      { label: 'Personal agent', value: 'Atlas' },
      { label: 'Session', value: 'Signed out · pairwise' },
      { label: 'Conversation', value: 'Waiting for sign-in' },
    ],
    method: 'POST',
    target: 'https://auth.northstar.example/oauth/token',
    detailLabel: 'Atlas → authorization server',
    request: `Content-Type: application/x-www-form-urlencoded
DPoP: [fresh host-only proof]

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
assertion=[host-only session assertion]
client_assertion=[host-only client assertion]`,
    response: `200 OK
{
  "access_token": "[stored by host]",
  "token_type": "DPoP",
  "session_id": "[opaque reference]",
  "signed_in": false
}`,
  },
  {
    title: 'The user signs in',
    summary:
      "Atlas opens Northstar's authorization page. The user signs in there and grants order access. Atlas never sees the password.",
    channel: 'Direct Sign-In',
    phoneMode: 'signin',
    messages: conversationStart,
    facts: [
      { label: 'User presence', value: 'Required' },
      { label: 'Requested access', value: 'Orders: read and return' },
      { label: 'Credentials', value: 'Visible only to Northstar' },
    ],
    method: 'GET',
    target: 'https://auth.northstar.example/oauth/authorize',
    detailLabel: 'Trusted browser handoff',
    request: `response_type=code
client_id=https://atlas.example/agent.json
redirect_uri=https://atlas.example/oauth/callback
scope=orders:read orders:return
state=[single-use, host-only]
code_challenge=[S256, host-only verifier]`,
    response: `302 Found
Location: https://atlas.example/oauth/callback
  ?code=[single-use authorization code]
  &state=[returned unchanged]`,
  },
  {
    title: 'An offer comes back',
    summary:
      'The signed-in Session continues the same conversation. Northstar finds the order and offers an even exchange or a refund.',
    channel: 'Conversation',
    messages: [
      ...conversationStart,
      { speaker: 'company', text: 'Please sign in so I can find the order.' },
      { speaker: 'user', text: "I'm signed in." },
      { speaker: 'atlas', text: "Thanks. I'll continue the same request." },
      {
        speaker: 'company',
        text: 'I can exchange it for the warmer Summit jacket at no extra cost, or issue a full refund.',
      },
    ],
    facts: [
      { label: 'Order', value: 'NS-48213' },
      { label: 'Options', value: 'Even exchange · Full refund' },
      { label: 'Status', value: "Waiting for the user's choice" },
    ],
    method: 'POST',
    target:
      'https://api.northstar.example/poppy/conversations/cnv_return/messages',
    detailLabel: 'Atlas ↔ company agent',
    request: `Authorization: DPoP [host-only Session Token]
DPoP: [fresh proof]
Content-Type: application/json

{ "message_id": "msg_offer", "text": "The user has signed in." }`,
    response: `200 OK
{
  "text": "Choose an even exchange or refund.",
  "data": { "options": ["exchange", "refund"] },
  "responder": { "type": "ai", "name": "Northstar" }
}`,
  },
  {
    title: 'The exchange is set',
    summary:
      "Atlas passes on the user's exact choice. Northstar confirms the exchange and the conversation closes with a durable result.",
    channel: 'Operation + result',
    messages: [
      ...conversationStart,
      { speaker: 'company', text: 'Please sign in so I can find the order.' },
      { speaker: 'user', text: "I'm signed in." },
      {
        speaker: 'company',
        text: 'I can offer the warmer Summit jacket or a full refund.',
      },
      { speaker: 'user', text: "Let's do the exchange." },
      {
        speaker: 'atlas',
        text: 'Done. The Summit jacket ships tomorrow. A prepaid return label is in your email.',
      },
    ],
    facts: [
      { label: 'Result', value: 'Exchange arranged' },
      { label: 'Return code', value: 'NRT-7K4Q' },
      { label: 'Conversation', value: 'Closed' },
    ],
    method: 'POST',
    target:
      'https://api.northstar.example/poppy/operations/op_exchange/confirm',
    detailLabel: 'Exact user-authorized action',
    request: `Authorization: DPoP [host-only Session Token]
DPoP: [fresh proof]
Idempotency-Key: msg_exchange_choice

{ "revision": 1, "choice": "exchange" }`,
    response: `200 OK
{
  "status": "succeeded",
  "result": { "return_code": "NRT-7K4Q" },
  "conversation_status": "closed"
}`,
  },
];

const speakerName: Record<Speaker, string> = {
  user: 'You',
  atlas: 'Atlas',
  company: 'Northstar',
};

const validateJourneyFixtures = async (): Promise<void> => {
  parseDiscoveryDocument({
    protocol_version: '0.1',
    organization: { name: 'Northstar Outfitters', domain: 'northstar.example' },
    auth: {
      issuer: 'https://auth.northstar.example',
      direct: { scopes: ['orders:read', 'orders:return'] },
      custom_scopes: {},
    },
    agent: {
      protocols: [
        {
          type: 'poppy',
          endpoint: 'https://api.northstar.example/poppy/conversations',
        },
      ],
    },
  });
  buildSessionAssertionClaims({
    clientId: 'https://atlas.example/agent.json',
    pairwiseUserId: 'usr_host_only_journey',
    tokenEndpoint: 'https://auth.northstar.example/oauth/token',
  });
  await buildDirectSignInRequest({
    authorizationEndpoint: 'https://auth.northstar.example/oauth/authorize',
    issuer: 'https://auth.northstar.example',
    clientId: 'https://atlas.example/agent.json',
    redirectUri: 'https://atlas.example/oauth/callback',
    scopes: ['orders:read', 'orders:return'],
  });
};

const ChatPhone: React.FC<{
  step: JourneyStep;
  onAuthorized: () => void;
}> = ({ step, onAuthorized }) => (
  <Box
    width="100%"
    maxWidth={340}
    height={560}
    mx="auto"
    border="10px solid"
    borderColor="fg.default"
    borderRadius={36}
    bg="canvas.default"
    overflow="hidden"
    boxShadow="shadow.large"
    display="flex"
    flexDirection="column"
  >
    <Box
      px={3}
      py={2}
      display="flex"
      justifyContent="space-between"
      borderBottom="1px solid"
      borderColor="border.default"
    >
      <Text sx={{ fontSize: 0, fontWeight: 600 }}>9:41</Text>
      <Text sx={{ fontSize: 0, fontWeight: 600 }}>5G · 92%</Text>
    </Box>
    {step.phoneMode === 'signin' ? (
      <Box flex={1} display="flex" flexDirection="column">
        <Box bg="success.emphasis" color="fg.onEmphasis" p={3}>
          <Text sx={{ fontWeight: 700 }}>N · Northstar Outfitters</Text>
        </Box>
        <Box p={3} display="flex" flexDirection="column" gap={3}>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            auth.northstar.example
          </Text>
          <Heading as="h2" sx={{ fontSize: 3 }}>
            Let Atlas access your order?
          </Heading>
          <Text>
            Atlas can read order NS-48213 and arrange the return you requested.
          </Text>
          <Box p={3} bg="canvas.subtle" borderRadius={2}>
            <Text sx={{ fontWeight: 600 }}>Requested access</Text>
            <Text as="p" sx={{ mt: 1, color: 'fg.muted' }}>
              Read this order · Arrange one return
            </Text>
          </Box>
          <Button variant="primary" block onClick={onAuthorized}>
            Authorize Atlas
          </Button>
          <Text textAlign="center" sx={{ fontSize: 0, color: 'fg.muted' }}>
            Passwords and account credentials stay with Northstar.
          </Text>
        </Box>
      </Box>
    ) : (
      <>
        <Box px={3} py={2} display="flex" gap={2} alignItems="center">
          <Box
            width={30}
            height={30}
            borderRadius="50%"
            bg="accent.emphasis"
            color="fg.onEmphasis"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontWeight={700}
          >
            A
          </Box>
          <Box>
            <Text as="div" sx={{ fontWeight: 700 }}>
              Atlas
            </Text>
            <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
              Your personal agent
            </Text>
          </Box>
        </Box>
        <Box
          flex={1}
          overflow="auto"
          bg="canvas.subtle"
          p={2}
          display="flex"
          flexDirection="column"
          gap={2}
        >
          {step.messages.map((message, index) => {
            const fromUser = message.speaker === 'user';
            return (
              <Box
                key={`${message.speaker}-${index}`}
                alignSelf={fromUser ? 'flex-end' : 'flex-start'}
                maxWidth="88%"
                px={2}
                py={2}
                borderRadius={3}
                color={fromUser ? 'fg.onEmphasis' : 'fg.default'}
                bg={fromUser ? 'accent.emphasis' : 'canvas.default'}
                border={fromUser ? 'none' : '1px solid'}
                borderColor="border.default"
              >
                {!fromUser ? (
                  <Text
                    as="div"
                    sx={{
                      mb: 1,
                      fontSize: 0,
                      fontWeight: 700,
                      color:
                        message.speaker === 'company'
                          ? 'success.fg'
                          : 'accent.fg',
                    }}
                  >
                    {speakerName[message.speaker]}
                  </Text>
                ) : null}
                <Text sx={{ fontSize: 1 }}>{message.text}</Text>
              </Box>
            );
          })}
        </Box>
      </>
    )}
  </Box>
);

/** A five-step user, company, and wire-level PAP walkthrough. */
const PapGuidedJourneyView: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [fixtureState, setFixtureState] = useState<
    'checking' | 'valid' | 'invalid'
  >('checking');
  const step = STEPS[stepIndex] ?? STEPS[0];

  useEffect(() => {
    void validateJourneyFixtures()
      .then(() => setFixtureState('valid'))
      .catch(() => setFixtureState('invalid'));
  }, []);

  const go = (next: number) => {
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Guided interaction"
      title="A return, from first request to confirmed exchange"
      description="Follow what the user experiences, what the company is allowed to see, and which PAP exchange moves the work forward. The story uses SDK-validated discovery, Session, and Direct Sign-In fixtures; protocol credentials are always represented as host-only placeholders."
      maxWidth={1180}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
        p={3}
        bg="canvas.default"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
      >
        <Box>
          <Label variant="accent">Company agent · Direct Sign-In</Label>
          <Heading as="h2" sx={{ mt: 1, fontSize: 2 }}>
            The jacket is not warm enough
          </Heading>
          <Text sx={{ color: 'fg.muted' }}>
            Atlas finds Northstar, keeps one Session, and asks before acting.
          </Text>
        </Box>
        <Label variant={fixtureState === 'valid' ? 'success' : 'secondary'}>
          {fixtureState === 'valid'
            ? 'SDK fixtures validated'
            : fixtureState === 'invalid'
              ? 'Fixture validation failed'
              : 'Validating SDK fixtures…'}
        </Label>
      </Box>

      <Box display="flex" gap={2} flexWrap="wrap" aria-label="Journey steps">
        {STEPS.map((candidate, index) => (
          <Button
            key={candidate.title}
            variant={index === stepIndex ? 'primary' : 'default'}
            onClick={() => go(index)}
          >
            {index + 1}. {candidate.channel}
          </Button>
        ))}
      </Box>

      <Box
        display="grid"
        sx={{
          gridTemplateColumns: [
            '1fr',
            'minmax(300px, 0.78fr) minmax(460px, 1.4fr)',
          ],
        }}
        gap={4}
        alignItems="start"
      >
        <ChatPhone step={step} onAuthorized={() => go(stepIndex + 1)} />

        <Box
          minHeight={560}
          bg="canvas.default"
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
          overflow="hidden"
          display="flex"
          flexDirection="column"
        >
          <Box p={3} borderBottom="1px solid" borderColor="border.default">
            <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
              Step {stepIndex + 1} of {STEPS.length} · {step.channel}
            </Text>
            <Heading as="h2" sx={{ mt: 1, fontSize: 3 }}>
              {step.title}
            </Heading>
            <Text as="p" sx={{ mt: 2, color: 'fg.muted' }}>
              {step.summary}
            </Text>
          </Box>

          <Box p={3} display="flex" flexDirection="column" gap={3}>
            <Box display="flex" gap={2} alignItems="center">
              <Box
                width={24}
                height={24}
                borderRadius={1}
                bg="success.emphasis"
                color="fg.onEmphasis"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontWeight={700}
              >
                N
              </Box>
              <Text sx={{ fontWeight: 700 }}>What Northstar sees</Text>
            </Box>
            <Box
              border="1px solid"
              borderColor="border.default"
              borderRadius={2}
              bg="canvas.subtle"
              px={3}
            >
              {step.facts.map(fact => (
                <Box
                  key={fact.label}
                  display="flex"
                  justifyContent="space-between"
                  gap={3}
                  py={2}
                  borderBottom="1px solid"
                  borderColor="border.muted"
                  sx={{ '&:last-child': { borderBottom: 0 } }}
                >
                  <Text sx={{ color: 'fg.muted' }}>{fact.label}</Text>
                  <Text textAlign="right" sx={{ fontWeight: 600 }}>
                    {fact.value}
                  </Text>
                </Box>
              ))}
            </Box>

            <Button
              variant="invisible"
              sx={{ alignSelf: 'flex-start', px: 0 }}
              onClick={() => setDetailsOpen(open => !open)}
            >
              {'{ }'} {detailsOpen ? 'Hide' : 'Show'} protocol details
            </Button>

            {detailsOpen ? (
              <Box
                bg="#0d1117"
                color="#c9d1d9"
                borderRadius={2}
                overflow="hidden"
              >
                <Box
                  px={3}
                  py={2}
                  display="flex"
                  justifyContent="space-between"
                  gap={2}
                  borderBottom="1px solid"
                  borderColor="#30363d"
                >
                  <Text sx={{ fontFamily: 'mono', fontSize: 0 }}>
                    {step.detailLabel}
                  </Text>
                  <Label variant="secondary">{step.channel}</Label>
                </Box>
                <Box p={3} maxHeight={270} overflow="auto">
                  <Text
                    as="div"
                    sx={{
                      fontFamily: 'mono',
                      fontWeight: 700,
                      color: '#ff7b72',
                    }}
                  >
                    {step.method} {step.target}
                  </Text>
                  <Box
                    as="pre"
                    mt={2}
                    mb={3}
                    sx={{
                      fontFamily: 'mono',
                      fontSize: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {step.request}
                  </Box>
                  <Text
                    as="div"
                    sx={{
                      fontFamily: 'mono',
                      fontWeight: 700,
                      color: '#7ee787',
                    }}
                  >
                    Response
                  </Text>
                  <Box
                    as="pre"
                    mt={2}
                    mb={0}
                    sx={{
                      fontFamily: 'mono',
                      fontSize: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {step.response}
                  </Box>
                </Box>
              </Box>
            ) : null}
          </Box>
        </Box>
      </Box>

      <Box display="flex" alignItems="center" justifyContent="center" gap={3}>
        <Button disabled={stepIndex === 0} onClick={() => go(stepIndex - 1)}>
          Previous
        </Button>
        <Box display="flex" gap={2} aria-label="Current step">
          {STEPS.map((candidate, index) => (
            <Box
              key={candidate.title}
              as="button"
              aria-label={`Go to step ${index + 1}: ${candidate.title}`}
              width={10}
              height={10}
              p={0}
              border={0}
              borderRadius="50%"
              bg={index === stepIndex ? 'fg.default' : 'border.default'}
              sx={{ cursor: 'pointer' }}
              onClick={() => go(index)}
            />
          ))}
        </Box>
        <Button
          variant={stepIndex === STEPS.length - 1 ? 'default' : 'primary'}
          disabled={stepIndex === STEPS.length - 1}
          onClick={() => go(stepIndex + 1)}
        >
          Next step
        </Button>
      </Box>
    </PapExamplePage>
  );
};

export default PapGuidedJourneyView;
