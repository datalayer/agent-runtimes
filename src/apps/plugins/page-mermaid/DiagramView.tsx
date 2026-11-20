/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The diagrams, drawn by Mermaid: the one written last first, each under its
 * title, its source a click away. Rendered in the page's colour scheme.
 *
 * @module apps/plugins/page-mermaid/DiagramView
 */

import { useEffect, useState, type JSX } from 'react';
import { Heading, Text, useTheme } from '@primer/react';
import { Box, Card } from '@datalayer/primer-addons';
import type { MermaidDiagram } from '@datalayer/reactor-mermaid';
import { loadMermaid, type PageDiagrams } from './store';

type Drawn = MermaidDiagram & { svg?: string; error?: string };

let rendered = 0;

export function DiagramView({
  diagrams,
  revision,
}: {
  diagrams: PageDiagrams;
  revision: number;
}): JSX.Element {
  const { resolvedColorScheme } = useTheme();
  const dark = resolvedColorScheme?.startsWith('dark') ?? false;
  const [drawn, setDrawn] = useState<Drawn[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const all = await diagrams.host.listDiagrams();
      const ordered = [
        ...all.filter(each => each.id === diagrams.current),
        ...all.filter(each => each.id !== diagrams.current).reverse(),
      ];
      const mermaid = (await import('mermaid')).default;
      await loadMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
      });
      const out: Drawn[] = [];
      for (const diagram of ordered) {
        try {
          const { svg } = await mermaid.render(
            `page-mermaid-${(rendered += 1)}`,
            diagram.source,
          );
          out.push({ ...diagram, svg });
        } catch (error) {
          out.push({
            ...diagram,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (live) {
        setDrawn(out);
      }
    })();
    return () => {
      live = false;
    };
  }, [diagrams, revision, dark]);

  return (
    <Box
      data-page-mermaid-view=""
      display="flex"
      flexDirection="column"
      sx={{ gap: 3 }}
    >
      {drawn.map(diagram => (
        <Card key={diagram.id} data-page-mermaid-diagram={diagram.id} p={3}>
          {diagram.title && (
            <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
              {diagram.title}
            </Heading>
          )}
          {diagram.svg ? (
            <Box
              sx={{
                overflowX: 'auto',
                '& svg': { maxWidth: '100%', height: 'auto' },
              }}
              // Mermaid's own SVG, rendered with its strict security level.
              dangerouslySetInnerHTML={{ __html: diagram.svg }}
            />
          ) : (
            <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
              {diagram.error}
            </Text>
          )}
          <Box as="details" mt={2}>
            <Box
              as="summary"
              sx={{ cursor: 'pointer', color: 'fg.muted', fontSize: 0 }}
            >
              Source
            </Box>
            <Box
              as="pre"
              mt={2}
              p={2}
              sx={{
                fontSize: 0,
                bg: 'canvas.subtle',
                borderRadius: 2,
                overflowX: 'auto',
                whiteSpace: 'pre',
              }}
            >
              {diagram.source}
            </Box>
          </Box>
        </Card>
      ))}
    </Box>
  );
}

export default DiagramView;
