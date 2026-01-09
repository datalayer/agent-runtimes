# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Backend Tool Rendering example.

Demonstrates an agent that uses backend tools to fetch data
which is then rendered by the frontend. Unlike frontend tools,
these tools execute on the backend and return data that the
frontend can use to render UI components.

Features:
- Backend tool execution
- Real API calls (weather data)
- Frontend rendering of tool results

This pattern is useful for:
- Weather applications
- Data dashboards
- Any scenario where backend APIs provide data for UI
"""

from textwrap import dedent

import httpx
from pydantic_ai import Agent

# Create the agent
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt=dedent("""
        You are a helpful weather assistant that provides accurate weather information.

        When users ask about weather:
        - If no location is provided, ask for one
        - Translate non-English location names to English
        - For multi-part locations (e.g., "New York, NY"), use the most specific part
        - Include temperature, humidity, wind, and conditions in your response
        - Keep responses concise but informative

        Use the `get_weather` tool to fetch current weather data.
    """),
)

# Create the AG-UI app
app = agent.to_ag_ui()


def _get_weather_condition(code: int) -> str:
    """Map WMO weather code to human-readable condition.

    Args:
        code: WMO weather code.

    Returns:
        Human-readable weather condition string.
    """
    conditions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snow fall",
        73: "Moderate snow fall",
        75: "Heavy snow fall",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }
    return conditions.get(code, "Unknown")


@agent.tool_plain
async def get_weather(location: str) -> dict[str, str | float]:
    """Get current weather for a location.

    This tool fetches real weather data from Open-Meteo API.
    The frontend can render this data as a weather card.

    Args:
        location: City name (e.g., "New York", "London", "Tokyo").

    Returns:
        Dictionary with weather information:
        - temperature: Current temperature in Celsius
        - feelsLike: Apparent temperature
        - humidity: Relative humidity percentage
        - windSpeed: Wind speed in km/h
        - windGust: Wind gust speed in km/h
        - conditions: Human-readable weather description
        - location: Resolved location name
    """
    async with httpx.AsyncClient() as client:
        # Geocode the location
        geocoding_url = (
            f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1"
        )
        geocoding_response = await client.get(geocoding_url)
        geocoding_data = geocoding_response.json()

        if not geocoding_data.get("results"):
            raise ValueError(f"Location '{location}' not found")

        result = geocoding_data["results"][0]
        latitude = result["latitude"]
        longitude = result["longitude"]
        name = result["name"]

        # Get weather data
        weather_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={latitude}&longitude={longitude}"
            f"&current=temperature_2m,apparent_temperature,relative_humidity_2m,"
            f"wind_speed_10m,wind_gusts_10m,weather_code"
        )
        weather_response = await client.get(weather_url)
        weather_data = weather_response.json()

        current = weather_data["current"]

        return {
            "temperature": current["temperature_2m"],
            "feelsLike": current["apparent_temperature"],
            "humidity": current["relative_humidity_2m"],
            "windSpeed": current["wind_speed_10m"],
            "windGust": current["wind_gusts_10m"],
            "conditions": _get_weather_condition(current["weather_code"]),
            "location": name,
        }
