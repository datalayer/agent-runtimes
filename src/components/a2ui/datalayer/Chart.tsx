/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chart (LOOP C-18): the points an application publishes, drawn as a bar, a
 * line, an area or a scatter — one field along the bottom, one measured, a
 * series apart for each value of a third. Drawn with ECharts, the chart
 * library agent-runtimes already draws its usage and context charts with,
 * in the page's colours (read from Primer's variables, so the chart follows
 * the theme and the colour mode). Its numbers are also a table under *The
 * numbers*, reached by keyboard and read by assistive technologies, which a
 * drawing is not.
 *
 * @module components/a2ui/datalayer/Chart
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { BlockFrame, Problem, Quiet, asWords, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type ChartKind = 'bar' | 'line' | 'scatter' | 'area';

export type ChartProps = OwnCommon & {
  title?: string;
  kind: ChartKind;
  x: string;
  y: string;
  series?: string;
  points?: unknown;
};

/** The page's colours, read from Primer's variables where the chart is drawn. */
export type ChartColours = {
  series: string[];
  text: string;
  muted: string;
  grid: string;
};

/** Primer's light colours, for a page that sets no variables. */
const FALLBACK: ChartColours = {
  series: ['#0969da', '#1a7f37', '#9a6700', '#8250df', '#cf222e', '#bc4c00'],
  text: '#1f2328',
  muted: '#59636e',
  grid: '#d1d9e0',
};

const SERIES_VARIABLES = [
  '--fgColor-accent',
  '--fgColor-success',
  '--fgColor-attention',
  '--fgColor-done',
  '--fgColor-danger',
  '--fgColor-severe',
];

function readColours(element: Element | null): ChartColours {
  if (!element) {
    return FALLBACK;
  }
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    series: SERIES_VARIABLES.map((name, index) =>
      read(name, FALLBACK.series[index]),
    ),
    text: read('--fgColor-default', FALLBACK.text),
    muted: read('--fgColor-muted', FALLBACK.muted),
    grid: read('--borderColor-muted', FALLBACK.grid),
  };
}

/** The points a chart can draw, or why it cannot. */
export function chartPoints(
  points: unknown,
): { points: Record<string, unknown>[] } | { problem: string } {
  if (points === undefined || points === null) {
    return { points: [] };
  }
  if (!Array.isArray(points) || points.some(point => !isRecord(point))) {
    return { problem: 'What it shows is not a list of points.' };
  }
  return { points: points as Record<string, unknown>[] };
}

/** The series a chart draws: one per value of `series`, or one. */
export function chartSeries(
  points: Record<string, unknown>[],
  props: Pick<ChartProps, 'x' | 'y' | 'series'>,
): { name: string; points: Record<string, unknown>[] }[] {
  if (!props.series) {
    return [{ name: props.y, points }];
  }
  const names: string[] = [];
  for (const point of points) {
    const name = asWords(point[props.series]);
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names.map(name => ({
    name,
    points: points.filter(point => asWords(point[props.series!]) === name),
  }));
}

/**
 * The ECharts option a chart draws: categories along the bottom for a bar,
 * a line or an area (in the order the points give them), numbers both ways
 * for a scatter.
 */
export function chartOption(
  points: Record<string, unknown>[],
  props: Pick<ChartProps, 'kind' | 'x' | 'y' | 'series'>,
  colours: ChartColours,
) {
  const series = chartSeries(points, props);
  const scatter = props.kind === 'scatter';
  const categories: string[] = [];
  for (const point of points) {
    const name = asWords(point[props.x]);
    if (!categories.includes(name)) {
      categories.push(name);
    }
  }
  const axis = {
    axisLine: { lineStyle: { color: colours.grid } },
    axisLabel: { color: colours.muted },
    splitLine: { lineStyle: { color: colours.grid } },
    nameTextStyle: { color: colours.muted },
  };
  return {
    aria: { enabled: true },
    animation: false,
    color: colours.series,
    textStyle: { color: colours.text },
    grid: { left: 48, right: 16, top: series.length > 1 ? 48 : 32, bottom: 40 },
    legend:
      series.length > 1
        ? { top: 0, textStyle: { color: colours.text } }
        : undefined,
    tooltip: { trigger: scatter ? 'item' : 'axis' },
    xAxis: scatter
      ? {
          type: 'value',
          name: props.x,
          nameLocation: 'middle',
          nameGap: 26,
          ...axis,
        }
      : {
          type: 'category',
          data: categories,
          name: props.x,
          nameLocation: 'middle',
          nameGap: 26,
          ...axis,
        },
    yAxis: { type: 'value', name: props.y, ...axis },
    series: series.map(one => ({
      name: one.name,
      type: props.kind === 'area' ? 'line' : props.kind,
      areaStyle: props.kind === 'area' ? {} : undefined,
      data: scatter
        ? one.points.map(point => [
            Number(point[props.x]),
            Number(point[props.y]),
          ])
        : categories.map(category => {
            const point = one.points.find(
              candidate => asWords(candidate[props.x]) === category,
            );
            return point ? Number(point[props.y]) : null;
          }),
    })),
  };
}

export function ChartView({ props }: { props: ChartProps }) {
  const { title, kind, x, y, series } = props;
  const read = useMemo(() => chartPoints(props.points), [props.points]);
  const frame = useRef<HTMLDivElement>(null);
  const [colours, setColours] = useState<ChartColours>(FALLBACK);
  useLayoutEffect(() => {
    setColours(readColours(frame.current));
  }, []);
  const points = 'points' in read ? read.points : [];
  const option = useMemo(
    () => chartOption(points, { kind, x, y, series }, colours),
    [points, kind, x, y, series, colours],
  );
  const columns = series ? [x, series, y] : [x, y];
  const label = `${title || 'Chart'}: ${y} by ${x}, as a ${kind}`;
  return (
    <BlockFrame
      title={title}
      label="Chart"
      weight={props.weight}
      testId="a2ui-chart"
    >
      <Box ref={frame}>
        {'problem' in read ? (
          <Problem>{read.problem}</Problem>
        ) : points.length === 0 ? (
          <Quiet>No points yet.</Quiet>
        ) : (
          <Box as="figure" aria-label={label} sx={{ m: 0 }}>
            <div aria-hidden="true">
              <ReactECharts
                option={option}
                style={{ height: 240, width: '100%' }}
                opts={{ renderer: 'svg' }}
                notMerge
                lazyUpdate
              />
            </div>
            <Box as="details" sx={{ fontSize: 1 }}>
              <Box
                as="summary"
                sx={{
                  cursor: 'pointer',
                  color: 'fg.muted',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'accent.fg',
                  },
                }}
              >
                <Text>The numbers</Text>
              </Box>
              <Box
                as="table"
                sx={{
                  mt: 1,
                  borderCollapse: 'collapse',
                  '& th, & td': {
                    textAlign: 'left',
                    pr: 3,
                    py: '2px',
                  },
                  '& th': { color: 'fg.muted', fontWeight: 'semibold' },
                }}
              >
                <thead>
                  <tr>
                    {columns.map(column => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr key={index}>
                      {columns.map(column => (
                        <td key={column}>{asWords(point[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </BlockFrame>
  );
}

export const Chart = ownImplementation<ChartProps>('Chart', ChartView);
