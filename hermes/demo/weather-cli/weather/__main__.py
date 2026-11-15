import sys

from weather import NotRegistered, forecast

if __name__ == "__main__":
    try:
        print(forecast(" ".join(sys.argv[1:]) or "Amherst"))
    except NotRegistered as e:
        print(f"weather-cli: {e}", file=sys.stderr)
        sys.exit(1)
