/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A Personal Agent at a Business, as a deck in YAML. */
export const yaml = `deck:
  title: A Personal Agent at a Business
  subtitle: Personal Agent Consent & Trust, by example
  template: datalayer
slides:
  - id: pact-a-personal-agent-at-a-business
    type: title
    title: A Personal Agent at a Business
    subtitle: Ada’s Travel Desk asks an airline about her flight, and she allows it to read her bookings, not to change them.
    meta: PACT 1.0 · a case · not the Personal Agent Protocol
    notes: >-
      This case is over PACT, Personal Agent Consent and Trust. It is a different
      protocol from the Personal Agent Protocol, built on A2A and OAuth, with the
      same aim: a person’s own agent working with a business. It is played with a
      demo airline, so nothing here signs in anywhere.
  - id: who
    type: three-columns
    title: Who is in this case
    columns:
      - heading: Ada
        type: text
        content: The person. She chooses what is allowed.
      - heading: Travel Desk
        type: text
        content: An application that works for Ada.
      - heading: Example Air Support
        type: text
        content: A business, at air.examples.datalayer.run, answered for by Example Provider.
    notes: >-
      Three parties. Ada wants to know when she flies. Travel Desk is an
      application working for her. Example Air Support is the airline’s agent, and
      a Provider answers for it, which is how PACT describes a business that
      reaches agents through a platform.
  - id: what-happens
    type: mermaid
    title: What happens
    diagram: |-
      sequenceDiagram
        actor Ada
        participant Desk as Travel Desk
        participant Air as Example Air Support
        Ada->>Desk: When is my flight?
        Desk->>Air: Reads its card
        Desk->>Air: Asks, as Travel Desk
        Air-->>Desk: Please sign in
        Desk->>Ada: Sign in at Example Air
        Ada->>Air: Allows See your bookings, only
        Air-->>Desk: AB123 flies on 2026-11-02
        Desk->>Ada: Your flight is on 2 November 2026
    notes: >-
      Ada asks. The application reads the card the business publishes, and asks
      the airline’s agent, saying which application it is. The airline asks for a
      sign-in. Ada signs in on the airline’s page and allows one thing of the two
      asked. The airline answers, and signs a receipt.
  - id: identity
    type: flow
    title: Who is asking
    items:
      - label: "1"
        title: Card
        detail: Published at the business’s own domain
      - label: "2"
        title: Identity
        detail: Each request is signed, naming which application asks
      - label: "3"
        title: Ask
        detail: Over A2A, with nobody signed in yet
        current: true
    notes: >-
      PACT has two profiles. In the Identity profile every request but the card
      carries a signed personal-agent token that says which agent is asking and
      for what stable, opaque person. It lives two minutes. That is enough to
      talk. Acting on the person’s account is the second profile.
  - id: scopes
    type: comparison
    title: Ada allows one of the two
    columns:
      - Asked
      - Allowed
    rows:
      - label: See your bookings and their status
        values:
          - true
          - true
      - label: Change the date of a booking
        values:
          - true
          - false
    notes: >-
      The application asks for the two permissions on the card, one to read and
      one to change. Ada signs in on the airline’s own page with a link and a code,
      and allows reading only. The airline gives Travel Desk a permission for Ada
      and for this application alone.
  - id: step-up
    type: statement
    title: Allowing less is an answer
    statement: >-
      If Travel Desk later needs more, the business **says what is missing**, and
      Ada is asked again.
    notes: >-
      The application reads back what was granted. If a later request needs more,
      the business answers that it needs authorization, naming the missing
      permission, and Ada is asked. Nothing widens silently. What she allowed
      stays what she allowed.
  - id: receipt
    type: two-columns
    title: A receipt, signed by the airline
    left:
      heading: Each answer comes with
      type: bullets
      items:
        - A receipt of what was done with the permission
        - The airline’s signature, verified before it is kept
    right:
      heading: The record shows
      type: bullets
      items:
        - Signed in at Example Air, for Ada
        - Allowed, See your bookings and their status
        - Looked up booking AB123
    notes: >-
      The airline signs a receipt of what it did with the permission. The
      application verifies it before it keeps it, with its record. Ada can see the
      permission and end it with Disconnect.
  - id: why
    type: statement
    title: Why it matters
    statement: >-
      The business knows **which agent is asking**, the person chooses **what it
      may do**, and a signed receipt says **what it did**.
    notes: >-
      Three questions a business has about somebody’s agent, each with an answer
      that can be checked, without a password ever passing through the agent.
  - id: run-it
    type: closing
    title: Run it yourself
    cta: The PACT page of the Agent Runtimes docs, and the demo Provider that plays this case.
    notes: >-
      This case is written from the Agent Runtimes demo Provider, Example Air, with
      its card, permissions and answers as they are. Read the PACT page for the
      personal agent and its contribution points, and PAP and PACT side by side
      for how the two protocols compare.
`;
