import json
import os
from config import DATA_FILE, UPGRADES


def load() -> dict:
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save(data: dict) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _default_player(user_id: int, name: str) -> dict:
    return {
        "user_id": user_id,
        "name": name,
        "coins": 0,
        "coins_per_click": 1,
        "passive_per_sec": 0,
        "upgrades": {"double": False, "triple": False, "auto": False},
    }


def get_player(user_id: int, name: str) -> dict:
    data = load()
    key = str(user_id)
    if key not in data:
        player = _default_player(user_id, name)
        data[key] = player
        save(data)
    return data[key]


def add_coins(user_id: int, count: int) -> dict:
    data = load()
    key = str(user_id)
    player = data[key]
    player["coins"] += player["coins_per_click"] * count
    save(data)
    return player


def buy_upgrade(user_id: int, upgrade_id: str) -> dict | None:
    if upgrade_id not in UPGRADES:
        return None
    data = load()
    key = str(user_id)
    player = data[key]
    if player["upgrades"].get(upgrade_id):
        return None
    price = UPGRADES[upgrade_id]["price"]
    if player["coins"] < price:
        return None

    player["coins"] -= price
    player["upgrades"][upgrade_id] = True

    base = 1
    if player["upgrades"]["double"]:
        base *= 2
    if player["upgrades"]["triple"]:
        base *= 3
    player["coins_per_click"] = base

    if player["upgrades"]["auto"]:
        player["passive_per_sec"] = 1

    save(data)
    return player


def get_leaders(limit: int = 10) -> list:
    data = load()
    players = sorted(data.values(), key=lambda p: p["coins"], reverse=True)
    return [
        {"rank": i + 1, "name": p["name"], "coins": p["coins"]}
        for i, p in enumerate(players[:limit])
    ]
