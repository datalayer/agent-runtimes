/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InlineWeatherCard - A beautiful weather card component for inline rendering.
 *
 * Inspired by the AG-UI Dojo implementation, this component renders weather
 * data with dynamic theming based on weather conditions.
 *
 * @module components/chat/components/InlineWeatherCard
 */

import { Spinner } from '@primer/react';

/**
 * Weather data structure returned by the backend tool
 */
export interface WeatherResult {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust?: number;
  conditions: string;
  location: string;
}

/**
 * Props for InlineWeatherCard
 * Status aligned with CopilotKit's useRenderToolCall pattern
 */
export interface InlineWeatherCardProps {
  /** Location being queried */
  location?: string;
  /** Weather result data */
  result?: WeatherResult;
  /**
   * Current status:
   * - 'inProgress': Arguments are being streamed
   * - 'executing': Tool is executing on backend
   * - 'complete': Tool completed successfully
   * - 'error': Tool execution failed
   */
  status: 'inProgress' | 'executing' | 'complete' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Get theme color based on weather conditions
 */
function getThemeColor(conditions: string): string {
  const conditionLower = conditions.toLowerCase();
  if (conditionLower.includes('clear') || conditionLower.includes('sunny')) {
    return '#667eea'; // Purple-blue for clear
  }
  if (
    conditionLower.includes('rain') ||
    conditionLower.includes('storm') ||
    conditionLower.includes('drizzle')
  ) {
    return '#4A5568'; // Gray for rain
  }
  if (conditionLower.includes('cloud') || conditionLower.includes('overcast')) {
    return '#718096'; // Slate for clouds
  }
  if (conditionLower.includes('snow') || conditionLower.includes('frost')) {
    return '#63B3ED'; // Light blue for snow
  }
  if (conditionLower.includes('fog') || conditionLower.includes('mist')) {
    return '#A0AEC0'; // Light gray for fog
  }
  return '#764ba2'; // Default purple
}

/**
 * Sun icon SVG
 */
function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: 56, height: 56, color: '#FED7AA' }}
    >
      <circle cx="12" cy="12" r="5" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeWidth="2"
        stroke="currentColor"
      />
    </svg>
  );
}

/**
 * Rain icon SVG
 */
function RainIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: 56, height: 56, color: '#90CDF4' }}
    >
      <path d="M12 4C8.68629 4 6 6.68629 6 10C6 10.5523 5.55228 11 5 11C4.44772 11 4 10.5523 4 10C4 5.58172 7.58172 2 12 2C16.4183 2 20 5.58172 20 10C20 10.5523 19.5523 11 19 11C18.4477 11 18 10.5523 18 10C18 6.68629 15.3137 4 12 4Z" />
      <path
        d="M8 14L6 22M12 14L10 22M16 14L14 22"
        strokeWidth="2"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Cloud icon SVG
 */
function CloudIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: 56, height: 56, color: '#E2E8F0' }}
    >
      <path d="M6.5 19C3.46243 19 1 16.5376 1 13.5C1 10.4624 3.46243 8 6.5 8C6.66896 8 6.83618 8.00748 7.00129 8.02216C8.04619 5.61876 10.3459 4 13 4C16.3137 4 19 6.68629 19 10C19 10.0736 18.9983 10.1469 18.9948 10.2198C21.2505 10.6646 23 12.6392 23 15C23 17.7614 20.7614 20 18 20H6.5C6.5 20 6.5 19 6.5 19Z" />
    </svg>
  );
}

/**
 * Get weather icon based on conditions
 */
function WeatherIcon({ conditions }: { conditions: string }) {
  if (!conditions) return <CloudIcon />;

  const conditionLower = conditions.toLowerCase();

  if (conditionLower.includes('clear') || conditionLower.includes('sunny')) {
    return <SunIcon />;
  }

  if (
    conditionLower.includes('rain') ||
    conditionLower.includes('drizzle') ||
    conditionLower.includes('snow') ||
    conditionLower.includes('thunderstorm')
  ) {
    return <RainIcon />;
  }

  return <CloudIcon />;
}

/**
 * InlineWeatherCard Component
 *
 * Renders a beautiful weather card inline in the chat with:
 * - Dynamic background color based on weather conditions
 * - Weather icon (sun, rain, cloud)
 * - Temperature in both Celsius and Fahrenheit
 * - Humidity, wind speed, and feels like temperature
 */
export function InlineWeatherCard({
  location,
  result,
  status,
  error,
}: InlineWeatherCardProps) {
  // Show loading state for inProgress or executing (or when result not yet available)
  if (status === 'inProgress' || status === 'executing' || !result) {
    const themeColor = '#667eea';
    const message =
      status === 'inProgress'
        ? `Preparing to fetch weather${location ? ` for ${location}` : ''}...`
        : `Fetching weather for ${location || 'location'}...`;
    return (
      <div
        style={{
          backgroundColor: themeColor,
          borderRadius: 12,
          padding: 16,
          marginTop: 12,
          marginBottom: 8,
          maxWidth: 320,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Spinner size="small" />
        <span style={{ color: 'white', fontSize: 14 }}>{message}</span>
      </div>
    );
  }

  // Show error state
  if (status === 'error') {
    return (
      <div
        style={{
          backgroundColor: '#E53E3E',
          borderRadius: 12,
          padding: 16,
          marginTop: 12,
          marginBottom: 8,
          maxWidth: 320,
          width: '100%',
        }}
      >
        <span style={{ color: 'white', fontSize: 14 }}>
          Error: {error || 'Failed to fetch weather'}
        </span>
      </div>
    );
  }

  const themeColor = getThemeColor(result.conditions);
  const celsiusTemp = result.temperature;
  const fahrenheitTemp = ((celsiusTemp * 9) / 5 + 32).toFixed(1);

  return (
    <div
      data-testid="weather-card"
      style={{
        backgroundColor: themeColor,
        borderRadius: 12,
        marginTop: 12,
        marginBottom: 8,
        maxWidth: 320,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Card content with semi-transparent overlay */}
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          padding: 16,
          width: '100%',
        }}
      >
        {/* Header: Location and icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3
              data-testid="weather-city"
              style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: 'white',
                margin: 0,
                textTransform: 'capitalize',
              }}
            >
              {result.location || location}
            </h3>
            <p
              style={{ color: 'white', margin: 0, fontSize: 14, marginTop: 4 }}
            >
              Current Weather
            </p>
          </div>
          <WeatherIcon conditions={result.conditions} />
        </div>

        {/* Temperature display */}
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 'bold', color: 'white' }}>
            <span>{celsiusTemp}° C</span>
            <span
              style={{
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.6)',
                marginLeft: 8,
              }}
            >
              / {fahrenheitTemp}° F
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'white',
              textTransform: 'capitalize',
            }}
          >
            {result.conditions}
          </div>
        </div>

        {/* Stats grid */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              textAlign: 'center',
            }}
          >
            <div data-testid="weather-humidity">
              <p style={{ color: 'white', fontSize: 12, margin: 0 }}>
                Humidity
              </p>
              <p
                style={{
                  color: 'white',
                  fontWeight: 500,
                  margin: 0,
                  marginTop: 4,
                }}
              >
                {result.humidity}%
              </p>
            </div>
            <div data-testid="weather-wind">
              <p style={{ color: 'white', fontSize: 12, margin: 0 }}>Wind</p>
              <p
                style={{
                  color: 'white',
                  fontWeight: 500,
                  margin: 0,
                  marginTop: 4,
                }}
              >
                {result.windSpeed} km/h
              </p>
            </div>
            <div data-testid="weather-feels-like">
              <p style={{ color: 'white', fontSize: 12, margin: 0 }}>
                Feels Like
              </p>
              <p
                style={{
                  color: 'white',
                  fontWeight: 500,
                  margin: 0,
                  marginTop: 4,
                }}
              >
                {result.feelsLike}°
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InlineWeatherCard;
