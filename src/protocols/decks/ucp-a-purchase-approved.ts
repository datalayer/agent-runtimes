/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A Purchase, Approved, as a deck in YAML. */
export const yaml = `deck:
  title: A Purchase, Approved
  subtitle: Universal Commerce Protocol, by example
  template: datalayer
slides:
  - id: ucp-a-purchase-approved
    type: title
    title: A Purchase, Approved
    subtitle: Ada’s Shopping Desk fills a basket at a test shop, and buys only once she approves the exact purchase.
    meta: UCP 2026-08-25 · a case · not the Personal Agent Protocol
    notes: >-
      This case is about shopping, over the Universal Commerce Protocol, UCP. It
      is a different protocol from the Personal Agent Protocol, and it is played
      at a test shop with a test payment, so nothing real is bought.
  - id: who
    type: three-columns
    title: Who is in this case
    columns:
      - heading: Ada
        type: text
        content: The person. Every purchase is hers to approve.
      - heading: Shopping Desk
        type: text
        content: An application that shops for Ada.
      - heading: Example Store
        type: text
        content: A test shop, at store.examples.datalayer.run.
    notes: >-
      Three parties. Ada wants a mug. Shopping Desk is an application that shops
      for her. Example Store is a test shop that speaks UCP.
  - id: what-happens
    type: mermaid
    title: What happens
    diagram: |-
      sequenceDiagram
        actor Ada
        participant Desk as Shopping Desk
        participant Store as Example Store
        Ada->>Desk: Buy me a stoneware mug
        Desk->>Store: Reads its profile, searches its catalogue
        Store-->>Desk: Stoneware mug, USD 24.00
        Desk->>Store: Fills a checkout
        Store-->>Desk: Ready to complete
        Desk->>Ada: The exact purchase
        Ada->>Desk: Approve
        Desk->>Store: Completes it, with a test payment
        Store-->>Desk: Your order is placed
        Desk->>Ada: Bought, once
    notes: >-
      Ada asks. The application reads the shop’s profile and its catalogue, which
      changes nothing. It fills a checkout, which the shop could still cancel, so
      nothing is bought yet. It shows Ada the exact purchase, and only when she
      approves does it complete the checkout.
  - id: steps
    type: flow
    title: Reading, then a checkout, then a purchase
    items:
      - label: "1"
        title: Read
        detail: The profile at /.well-known/ucp, and the catalogue
      - label: "2"
        title: Fill
        detail: A checkout the shop can cancel
      - label: "3"
        title: Propose
        detail: The checkout read again, its lines and totals exact
      - label: "4"
        title: Buy
        detail: Only with Ada’s yes, and only once
        current: true
    notes: >-
      UCP gives a shop one published profile and a checkout that moves toward
      being ready to complete. Agent Runtimes adds a step on top of it: nothing
      is bought in one call. A ready checkout becomes an exact proposal, read
      again from the shop, and completing it is a separate step.
  - id: proposal
    type: comparison
    title: What Ada approves
    columns:
      - The purchase
    rows:
      - label: What
        values:
          - Stoneware mug × 1
      - label: Tax
        values:
          - USD 1.92
      - label: Total
        values:
          - USD 25.92
      - label: The most one purchase may cost
        values:
          - USD 50.00
    notes: >-
      Ada reads the shop’s own checkout. Buy 1 Stoneware mug at Example Store for
      USD 25.92. There is a limit on what one purchase may cost, and the mug is
      within it. The proposal has a revision, a hash of what is bought, so
      approving this basket never approves a changed one.
  - id: asked
    type: statement
    title: Every purchase is asked first
    statement: >-
      Whatever the application’s rules say, **buying waits for Ada**. If she
      declines, the checkout is cancelled and nothing is bought.
    notes: >-
      Reading can go ahead on its own, and a checkout can be filled. Buying is a
      different class of action, and it is always asked. If Ada says no, the
      checkout is cancelled.
  - id: once
    type: two-columns
    title: Bought once, and no card in the conversation
    left:
      heading: Once
      type: bullets
      items:
        - The proposal is spent before Ada is asked
        - Its id is the Idempotency-Key, so a retry is the same request
        - Asked again, it reads the order back instead of paying twice
    right:
      heading: No card
      type: bullets
      items:
        - The payment instrument comes from custody
        - The model never sees it
        - The record shows the amount and who approved
    notes: >-
      The proposal is used up before the person is asked, so a declined proposal
      is proposed again, never retried. Its id is the idempotency key, so a retry
      after a lost answer buys nothing twice. The payment instrument comes from
      custody, and the conversation never holds a card.
  - id: why
    type: statement
    title: Why it matters
    statement: >-
      An agent can do the shopping, and **the money moves only on the person’s
      yes**, for exactly what she saw.
    notes: >-
      UCP lets any agent shop at any shop that speaks it. What keeps that safe is
      that the purchase is exact, approved, bought once, and recorded with its
      amount and who approved it.
  - id: run-it
    type: closing
    title: Run it yourself
    cta: The UCP page of the Agent Runtimes docs, and the test merchant that plays this case.
    notes: >-
      This case is written from the Agent Runtimes test merchant, Example Store,
      with its product, price and tax as they are. Test merchants only, with no
      real payment. Read the UCP page for the client and its contribution points.
`;
