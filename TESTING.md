# Testing Setup for @datalayer/agent-runtimes

This package includes comprehensive testing setup using Vitest.

## Test Structure

- **Unit Tests**: Located in `src/__tests__/`
  - Test TypeScript functionality
  - Test React components (basic structure)
  - Test utility functions

## Available Test Scripts

```bash
# Run all unit tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI interface
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run Storybook tests
npm run test:storybook
```

## Test Configuration

The project uses two test environments:

1. **Unit Tests**: Uses `jsdom` environment for DOM testing
2. **Storybook Tests**: Uses browser environment with Playwright

## Test Files

- `src/__tests__/index.test.ts` - Tests main exports
- `src/__tests__/App.test.tsx` - Tests React App component
- `src/__tests__/hooks.test.ts` - Tests custom hooks
- `src/__tests__/utils.test.ts` - Tests utility functions

## Coverage

Run `npm run test:coverage` to generate coverage reports.

## Writing Tests

Tests should follow the existing patterns:

```typescript
import { describe, it, expect } from 'vitest';

describe('Component/Function Name', () => {
  it('should describe what it tests', () => {
    expect(actual).toBe(expected);
  });
});
```

## Pictures as tests

The `loop` theme's four reference screens — a conversation, a conversation
beside its work, the activity of a worker, an approval — and the floating
assistant's states are pictures kept in `pictures/baselines/` (LOOP T-01,
T-16, T-27). A run takes them again in Chrome and compares them; a changed
token, radius or colour shows as a failed picture, to fix or to accept.

```bash
# Compare every picture with its baseline (about five minutes, one Chrome)
npm run test:pictures

# Only some themes, for a quicker run
PICTURES_THEMES=loop,datalayer npm run test:pictures

# Accept what changed as the new baselines, then commit pictures/baselines/
npm run test:pictures:accept
```

- **What is pictured.** The four screens in each of the nine themes of the
  registry (`themeConfigs` of `@datalayer/primer-addons`), light and dark, at
  960×640; and the paper clip — idle, thinking, working, waiting, speaking,
  stepped aside for a dialog — in the `loop` theme, light and dark, at
  480×360. 84 pictures, some 3 MB.
- **Where they come from.** `html/pictures.html?screen=approval&theme=loop&mode=dark`
  (or `?assistant=thinking&mode=light`) renders one of them: the real chat
  components — `ChatBaseHeader` with the presence, `ChatMessageList`,
  `InputPrompt`, `ToolCallDisplay`'s approval card, `AssistantStage` — with
  fixed data (`src/stories/loop/ReferenceScreens.tsx`). The same screens are
  stories (`src/stories/loop/LoopReference.stories.tsx`).
- **How they are taken.** Playwright (`pictures/playwright.config.ts`) starts
  Vite on port 3107 with a dependency cache of its own
  (`vite.pictures.config.ts`), opens each page in the system Chrome
  (`/usr/bin/google-chrome`, or `PICTURES_CHROME`) with motion reduced, waits
  until the page's fonts are in and it says `data-pictures-ready`, stops the
  animations and takes the picture; one worker, one browser; the server is
  stopped when the run ends. The first page of a cold cache waits for Vite to
  optimise its dependencies.
- **What fails.** A picture fails past 64 pixels that differ by more than
  0.01 in colour (about 3 levels of 255); Chrome draws the same pixels on the
  same machine, so this only lets a stray edge through. Measured: the
  bubbles' radius from 22 to 16px fails (110 to 220 pixels), the frame's from
  28 to 20px (some 370), a 2px hairline or another accent (some 20,000 each).
  A change drawn only in anti-aliased pixels — a pale bubble 2px less round —
  is ignored by the comparison and passes. A failure leaves the baseline, the
  new picture and a `-diff.png` in `pictures/test-results/<test>/`.
- **Trying a token before changing it.** `PICTURES_CSS` adds a stylesheet to
  every page before it is pictured:
  `PICTURES_THEMES=loop PICTURES_CSS='[data-datalayer-theme-scope] { --theme-radius-frame: 20px !important }' npm run test:pictures`
  shows what that change would do, as differences.
- **Fonts.** The pictures use whatever face the theme resolves on the machine
  that takes them. The `loop` theme asks for Inter and falls back to the
  system sans-serif; until Inter is served (LOOP T-04) they are drawn in the
  fallback, and once it is, they change and are accepted again. Baselines are
  taken on Linux: another system draws text differently and accepts its own.

## The Cloudflare model specs against Cloudflare's listing

`agentspecs/agentspecs/models/cloudflare-wrk-*.yaml` name models Cloudflare Workers AI
serves, and the catalogue moves (a model the specs could have named in September
2026 had been deprecated in May). Before a release of the specs:

```bash
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… python scripts/check-cloudflare-models.py
```

It says which spec names a model no longer served (and exits 1), which served model
with tool calling has no spec, and each model's context window. The
`DATALAYER_CLOUDFLARE_*` names of the services' rc files are read too.
