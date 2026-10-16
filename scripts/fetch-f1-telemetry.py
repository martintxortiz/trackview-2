#!/usr/bin/env python3
"""
Pull FastF1 qualifying telemetry and write equal-distance JSON for the app.

Usage:
  python scripts/fetch-f1-telemetry.py

Needs: pip install fastf1
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import fastf1

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "track" / "data"
CACHE = Path.home() / ".cache" / "fastf1"

JOBS = [
    (2025, "Belgium", "Q", "spa"),
    (2025, "Italy", "Q", "monza"),
    (2025, "United States", "Q", "texas"),
]


def series_from_lap(lap, n: int = 500) -> dict:
    tel = lap.get_car_data().add_distance()
    brake = tel["Brake"].astype(float).to_numpy()
    if brake.max() <= 1.0:
        brake = brake * 100.0
    dist = tel["Distance"].to_numpy(dtype=float)
    t = dist / dist[-1]
    keep = np.concatenate([[True], np.diff(t) > 1e-9])
    t, speed, thr, brake = t[keep], tel["Speed"].to_numpy(dtype=float)[keep], tel[
        "Throttle"
    ].to_numpy(dtype=float)[keep], brake[keep]
    t[0], t[-1] = 0.0, 1.0
    grid = np.linspace(0, 1, n)
    return {
        "speed_kmh": np.interp(grid, t, speed).round(2).tolist(),
        "throttle": np.interp(grid, t, thr).round(2).tolist(),
        "brake": np.interp(grid, t, brake).round(2).tolist(),
        "lap_ms": int(lap["LapTime"].total_seconds() * 1000),
        "driver": str(lap["Driver"]),
        "team": str(lap["Team"]),
        "distance_m": float(dist[-1]),
    }


def pick_two_drivers(laps):
    picked, seen = [], set()
    ordered = laps.dropna(subset=["LapTime"]).sort_values("LapTime")
    for _, row in ordered.iterrows():
        if row["Driver"] in seen:
            continue
        try:
            tel = row.get_car_data()
            if tel is None or len(tel) < 100:
                continue
        except Exception:
            continue
        seen.add(row["Driver"])
        picked.append(row)
        if len(picked) >= 2:
            break
    if len(picked) < 2:
        raise RuntimeError("Could not find two laps with car data")
    return picked


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE))

    for year, event, session, tid in JOBS:
        print(f"=== {tid} {year} {event} {session}")
        s = fastf1.get_session(year, event, session)
        s.load(telemetry=True, weather=False, messages=False)
        a_lap, b_lap = pick_two_drivers(s.laps)
        print("picked", a_lap["Driver"], a_lap["LapTime"], b_lap["Driver"], b_lap["LapTime"])
        payload = {
            "trackId": tid,
            "source": f"FastF1 {year} {event} {session}",
            "a": series_from_lap(a_lap),
            "b": series_from_lap(b_lap),
        }
        path = OUT / f"{tid}-telemetry.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        print("wrote", path)


if __name__ == "__main__":
    main()
