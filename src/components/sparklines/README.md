# Sparklines

A modern, lightweight, TypeScript-first sparkline chart library for React.

## Features

- 🎯 **TypeScript First**: Full type safety and IntelliSense support
- ⚡ **Lightweight**: Pure SVG rendering, no heavy dependencies
- 🎨 **Customizable**: Easy styling with React props and CSS
- 🔧 **Composable**: Build complex charts with simple components
- ⚛️ **Modern React**: Built with hooks and functional components

## Installation

This library is internal to the agent-runtimes project. Import from:

```typescript
import { Sparklines, SparklinesLine } from '@/components/sparklines';
```

## Usage

### Basic Line Chart

```tsx
import { Sparklines, SparklinesLine } from '@/components/sparklines';

function MyComponent() {
  const data = [120, 200, 150, 180, 170, 210, 200, 220];

  return (
    <Sparklines data={data} width={200} height={40}>
      <SparklinesLine color="#0969da" />
    </Sparklines>
  );
}
```

### Custom Styling

```tsx
<Sparklines data={data} width={200} height={40} margin={4}>
  <SparklinesLine
    color="#0969da"
    style={{
      strokeWidth: '2',
      fillOpacity: '0.2',
    }}
  />
</Sparklines>
```

### With Data Limits

```tsx
<Sparklines
  data={longDataArray}
  width={200}
  height={40}
  limit={20} // Only show last 20 points
>
  <SparklinesLine color="#0969da" />
</Sparklines>
```

## API Reference

### `<Sparklines>`

Main container component that processes data and renders the SVG.

**Props:**

| Prop                  | Type            | Default  | Description                              |
| --------------------- | --------------- | -------- | ---------------------------------------- |
| `data`                | `number[]`      | `[]`     | Array of numeric values to plot          |
| `width`               | `number`        | `240`    | Width of the chart in pixels             |
| `height`              | `number`        | `60`     | Height of the chart in pixels            |
| `svgWidth`            | `number`        | -        | Override SVG width attribute             |
| `svgHeight`           | `number`        | -        | Override SVG height attribute            |
| `margin`              | `number`        | `2`      | Margin around the chart                  |
| `min`                 | `number`        | auto     | Minimum value for Y-axis                 |
| `max`                 | `number`        | auto     | Maximum value for Y-axis                 |
| `limit`               | `number`        | -        | Maximum number of data points to display |
| `preserveAspectRatio` | `string`        | `'none'` | SVG preserveAspectRatio attribute        |
| `style`               | `CSSProperties` | -        | Inline styles for the SVG element        |

### `<SparklinesLine>`

Renders a line chart within a Sparklines container.

**Props:**

| Prop    | Type            | Default     | Description                                    |
| ------- | --------------- | ----------- | ---------------------------------------------- |
| `color` | `string`        | `'#0969da'` | Color of the line and fill                     |
| `style` | `CSSProperties` | `{}`        | Custom styles (strokeWidth, fillOpacity, etc.) |

## Utilities

### Data Processing

```typescript
import { dataToPoints, min, max } from '@/components/sparklines';

const data = [1, 2, 3, 4, 5];
const points = dataToPoints({ data, width: 100, height: 30 });
const minValue = min(data); // 1
const maxValue = max(data); // 5
```

## Comparison to Original

This is a modernized version of [react-sparklines](https://github.com/borisyankov/react-sparklines) with:

- ✅ TypeScript support with full type definitions
- ✅ React hooks and functional components
- ✅ Improved performance with useMemo
- ✅ Better tree-shaking
- ✅ Modern ES modules
- ✅ Simplified API surface
- ❌ Removed: Bars, Spots, Reference Lines, Normal Band (can be added if needed)

## License

MIT License - Based on react-sparklines by Boris Yankov
Modified by Datalayer, Inc.
