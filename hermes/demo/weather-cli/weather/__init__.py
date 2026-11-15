"""weather-cli: print a short forecast. Offline: uses a small cached table."""

FORECASTS = {
    "amherst": "Amherst, MA: 41°F, light wind, clear tonight. Tomorrow 48°F, sunny.",
    "boston": "Boston, MA: 45°F, breezy, clouds clearing. Tomorrow 50°F, partly sunny.",
}


def forecast(city: str) -> str:
    return FORECASTS.get(city.lower(), f"{city}: no cached forecast. Try Amherst or Boston.")
