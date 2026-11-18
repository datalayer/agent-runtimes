/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agents that present themselves: each one's name, emoji, description,
 * one-line tagline and presentation (a Markdown document), by its id —
 * without the catalogue of every agent, for a page that only names them.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 *
 * @module specs/agentPresentations
 */

/** How an agent presents itself. */
export type AgentPresentation = {
  /** Its id in the catalogue. */
  id: string;
  version: string;
  name: string;
  emoji: string;
  description: string;
  /** What it does on its own, in one line. */
  tagline: string;
  /** What it is, as one Markdown document. */
  presentation: string;
};

export const AGENT_PRESENTATIONS: Record<string, AgentPresentation> = {
  'worker-accountant': {
    id: 'worker-accountant',
    version: '0.0.1',
    name: 'Accountant',
    emoji: '🧮',
    description:
      'Work with Odoo accounting data to reconcile invoices and payments, analyze journal balances, and prepare close-ready summaries.',
    tagline: 'Matches payments, checks balances',
    presentation:
      'Work with Odoo accounting data to reconcile invoices and payments, analyze\njournal balances, and prepare close-ready summaries.\n\n- Reads your Odoo books: invoices, payments, journals and ledgers\n- Lists unpaid invoices and the customers behind them\n- Matches payments against open invoices and flags what does not reconcile\n- Prepares a close summary with the balances that moved\n- Changes nothing in the books without a person\n\n[Watch it in the Sales and Accounting Stage](/stages?stage=sales-and-accounting)',
  },
  'worker-marketer': {
    id: 'worker-marketer',
    version: '0.0.1',
    name: 'Marketer',
    emoji: '📣',
    description:
      "Plans and drafts social posts for X, Bluesky, LinkedIn and Discord in the brand's voice, reads what comes back (on LinkedIn once signed in there from the chat), remembers what worked, and publishes only with approval.",
    tagline: 'Plans, drafts, reads the replies',
    presentation:
      "Plans and drafts social posts for X, Bluesky, LinkedIn and Discord in the\nbrand's voice, reads what comes back (on LinkedIn once signed in there from\nthe chat), remembers what worked, and publishes only with approval.\n\n- Plans a campaign around the goal you give it\n- Drafts each post for its network, in your brand’s voice\n- Reads what the audience says back\n- Remembers the voice, what was posted and what worked\n- Publishes nothing until you approve the exact text\n\n[The seed agents, in slides](/visitors/decks/agents/seed-agents)",
  },
  'worker-shopper': {
    id: 'worker-shopper',
    version: '0.0.1',
    name: 'Shopper',
    emoji: '🛍️',
    description:
      'Finds products on Shopify stores, compares prices, variants and sellers, builds the basket, and buys for you through the Personal Agent Protocol only once you approve the exact purchase.',
    tagline: 'Searches, compares, builds the basket',
    presentation:
      'Finds products on Shopify stores, compares prices, variants and sellers,\nbuilds the basket, and buys for you through the Personal Agent Protocol only\nonce you approve the exact purchase.\n\n- Searches products across Shopify stores\n- Compares price, shipping, rating and seller, and says which it would pick\n- Builds the basket and shows its total\n- Remembers your sizes, budgets and the stores you like\n- Buys through the Personal Agent Protocol only once you approve the exact purchase\n\n[How a personal agent acts for you](/docs/applications/personal-agent-protocol)',
  },
  'worker-steward-aws': {
    id: 'worker-steward-aws',
    version: '0.0.1',
    name: 'Datalayer Steward for AWS',
    emoji: '☁️',
    description:
      "Reads your AWS account's cost recommendations, right-sizing findings and spend with a read-only role, and recommends savings, each with the evidence it read, the estimated monthly saving and the fix to review.",
    tagline: 'Reads costs and findings',
    presentation:
      "Reads your AWS account's cost recommendations, right-sizing findings and spend\nwith a read-only role, and recommends savings, each with the evidence it read,\nthe estimated monthly saving and the fix to review.\n\n- Runs in your own Amazon Bedrock AgentCore, launched from Datalayer\n- Reads Cost Optimization Hub, Compute Optimizer and Cost Explorer with a read-only role\n- Recommends each saving with the evidence it read\n- Estimates the monthly saving and says how\n- Hands you the fix to review: it changes nothing in the account\n\n[How the Steward works](/docs/integration-aws-agentcore)",
  },
  'worker-terra': {
    id: 'worker-terra',
    version: '0.0.1',
    name: 'Terra',
    emoji: '🌏',
    description:
      'Analyses satellite images and Earth observation data: finds the scenes in NASA Earthdata, computes indices such as NDVI and change between dates in a notebook, and reports what the pixels show with their dates and cloud cover.',
    tagline: 'Finds scenes, computes indices, reports',
    presentation:
      'Analyses satellite images and Earth observation data: finds the scenes in NASA\nEarthdata, computes indices such as NDVI and change between dates in a\nnotebook, and reports what the pixels show with their dates and cloud cover.\n\n- Finds satellite scenes in NASA Earthdata by place, date and cloud cover\n- Downloads the images and analyses them in a notebook\n- Computes indices such as NDVI and the change between two dates\n- Names each scene by its sensor, date and cloud cover\n- Says what the images cannot tell\n\n[The Earthdata connection it uses](/docs/mcp/toolsets)',
  },
  'worker-traveller': {
    id: 'worker-traveller',
    version: '0.0.1',
    name: 'Traveller',
    emoji: '🧭',
    description:
      "A travel companion: finds flights, stays, restaurants and things to do, and puts them together into three practical trip options, each with a map, a daily schedule, a budget with its total and the booking links. It books nothing: you book on the provider's site.",
    tagline: 'Finds flights, stays and places, plans three options',
    presentation:
      "A travel companion: finds flights, stays, restaurants and things to do, and\nputs them together into three practical trip options, each with a map, a daily\nschedule, a budget with its total and the booking links. It books nothing: you\nbook on the provider's site.\n\n- Asks your dates, places, travellers, preferences and budget\n- Compares flights on Kiwi.com by fare, baggage, connections and travel time\n- Finds stays, restaurants and sights with Google Maps, and Booking.com with your partner access\n- Plans three options, each with a map, a daily schedule and a budget with its total\n- Hands you the booking links: it books and pays nothing\n\n[The seed agents, in slides](/visitors/decks/agents/seed-agents)",
  },
};

/** An agent's presentation, by `id` or `id:version`; none for one that says none. */
export function getAgentPresentation(
  agentId: string,
): AgentPresentation | undefined {
  return AGENT_PRESENTATIONS[agentId.split(':')[0]];
}
