import sys

from weather import forecast

if __name__ == "__main__":
    print(forecast(" ".join(sys.argv[1:]) or "Amherst"))
