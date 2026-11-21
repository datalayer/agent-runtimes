/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the Composer's button and its dialog say (`apps/plugins/composer-portal`).
 *
 * @module apps/plugins/composer-portal/words
 */

/** What the button and the dialog say. */
export const COMPOSER_PORTAL_WORDS = {
  open: 'Open the Composer',
  title: (name: string) => `${name}: Composer`,
  subtitle:
    'How this application is built: its Canvas, its spec and its Python, read only.',
  loading: 'Loading the Composer',
  views: 'How to read the application',
  canvas: 'Canvas',
  spec: 'YAML',
  python: 'Python',
  canvasSays:
    'Its parts: who does the work, how its page is laid out, the UI it brings and how it starts.',
  specSays: 'The whole application written out, every part of it.',
  pythonBuilt: 'Built in Python: its own app.py.',
  pythonEjected:
    'Written as a spec: this is the app.py `loop apps eject` writes from it, its spec ready for code.',
  pythonNone:
    'Written as a spec, and not one of the catalogue’s: its app.py is written when it is ejected in the Studio.',
} as const;
