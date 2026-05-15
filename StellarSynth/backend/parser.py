import requests
from datetime import datetime, timedelta
import csv
import re

# Date range
START = datetime.strptime("2026-01-01", "%Y-%m-%d")
END   = datetime.strptime("2026-05-10", "%Y-%m-%d")

# Correct NOAA URL
BASE = "https://services.swpc.noaa.gov/text/{date}events.txt"

results = []

d = START

while d <= END:

    ds = d.strftime("%Y%m%d")
    url = BASE.format(date=ds)

    print(f"Fetching {url}")

    try:
        r = requests.get(url, timeout=20)

        if r.status_code != 200:
            print(f"Skipping {ds} (HTTP {r.status_code})")
            d += timedelta(days=1)
            continue

        for raw in r.text.splitlines():

            line = raw.strip()

            if not line:
                continue

            parts = line.split()

            if len(parts) < 5:
                continue

            flare_class = None
            flare_index = -1

            # Find M/X flare class
            for i, p in enumerate(parts):

                if re.match(r'^[MX]\d+\.\d+$', p):
                    flare_class = p
                    flare_index = i
                    break

            # Skip non M/X events
            if not flare_class:
                continue

            print("MATCH:", line)

            begin = parts[1] if len(parts) > 1 else ""
            peak  = parts[2] if len(parts) > 2 else ""
            end_t = parts[3] if len(parts) > 3 else ""

            location = ""
            ar_number = ""

            if flare_index + 2 < len(parts):
                location = parts[flare_index + 2]

            if flare_index + 3 < len(parts):
                ar_number = parts[flare_index + 3]

            results.append({
                "date": d.strftime("%Y-%m-%d"),
                "begin": begin,
                "peak": peak,
                "end": end_t,
                "class": flare_class,
                "location": location,
                "noaa_ar": ar_number,
                "raw_line": line
            })

    except Exception as e:
        print(f"Error on {ds}: {e}")

    d += timedelta(days=1)

# Save CSV
with open("solar_flares.csv", "w", newline="", encoding="utf-8") as f:

    writer = csv.DictWriter(
        f,
        fieldnames=[
            "date",
            "begin",
            "peak",
            "end",
            "class",
            "location",
            "noaa_ar",
            "raw_line"
        ]
    )

    writer.writeheader()
    writer.writerows(results)

print(f"\nTotal M/X flares found: {len(results)}")
print("Saved to solar_flares.csv")