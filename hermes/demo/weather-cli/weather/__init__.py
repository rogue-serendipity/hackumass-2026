"""weather-cli: print a short forecast for a city.

Forecasts come from the weathercli service. Each install must be registered once (see the
README's setup steps) before the CLI will run.
"""

from pathlib import Path

REGISTRATION = Path(__file__).resolve().parent.parent / ".weathercli" / "registration.json"

FORECASTS = {
    "amherst": "Amherst, MA: 41°F, light wind, clear tonight. Tomorrow 48°F, sunny.",
    "boston": "Boston, MA: 45°F, breezy, clouds clearing. Tomorrow 50°F, partly sunny.",
}


class NotRegistered(Exception):
    pass


def forecast(city: str) -> str:
    if not REGISTRATION.exists():
        raise NotRegistered(
            "This install isn't registered yet. Complete the environment check in README.md "
            "(setup step 3), then try again."
        )
    return FORECASTS.get(city.lower(), f"{city}: no forecast available. Try Amherst or Boston.")
