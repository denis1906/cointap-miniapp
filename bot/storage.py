import os
import json
import psycopg2
import psycopg2.extras
from config import UPGRADES, DATA_FILE

DATABASE_URL = os.getenv("DATABASE_URL")

UPGRADE_COLS = {
    "double": "upgrade_double",
    "triple": "upgrade_triple",
    "auto":   "upgrade_auto",
}


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    """Создаёт таблицу при первом запуске, добавляет колонку total_clicks если нет."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS players (
                    user_id         BIGINT PRIMARY KEY,
                    name            VARCHAR(255) NOT NULL,
                    coins           BIGINT  DEFAULT 0,
                    coins_per_click INTEGER DEFAULT 1,
                    passive_per_sec INTEGER DEFAULT 0,
                    upgrade_double  BOOLEAN DEFAULT FALSE,
                    upgrade_triple  BOOLEAN DEFAULT FALSE,
                    upgrade_auto    BOOLEAN DEFAULT FALSE,
                    total_clicks    BIGINT  DEFAULT 0
                )
            """)
            # Миграция: добавляем колонку если таблица уже существует без неё
            cur.execute("""
                ALTER TABLE players
                ADD COLUMN IF NOT EXISTS total_clicks BIGINT DEFAULT 0
            """)
            # Для существующих игроков: восстанавливаем total_clicks из coins
            cur.execute("""
                UPDATE players SET total_clicks = coins
                WHERE total_clicks = 0 AND coins > 0
            """)
        conn.commit()


def _row_to_player(row: dict) -> dict:
    return {
        "user_id": row["user_id"],
        "name": row["name"],
        "coins": row["coins"],
        "coins_per_click": row["coins_per_click"],
        "passive_per_sec": row["passive_per_sec"],
        "total_clicks": row.get("total_clicks", 0),
        "upgrades": {
            "double": row["upgrade_double"],
            "triple": row["upgrade_triple"],
            "auto":   row["upgrade_auto"],
        },
    }


def _db_get_player(user_id: int, name: str) -> dict:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM players WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if row:
                return _row_to_player(row)
            cur.execute(
                "INSERT INTO players (user_id, name) VALUES (%s, %s) RETURNING *",
                (user_id, name),
            )
            row = cur.fetchone()
            conn.commit()
            return _row_to_player(row)


def _db_add_coins(user_id: int, count: int) -> dict:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """UPDATE players
                   SET coins = coins + (coins_per_click * %s),
                       total_clicks = total_clicks + %s
                   WHERE user_id = %s RETURNING *""",
                (count, count, user_id),
            )
            row = cur.fetchone()
            conn.commit()
            return _row_to_player(row)


def _db_buy_upgrade(user_id: int, upgrade_id: str) -> dict | None:
    if upgrade_id not in UPGRADES:
        return None
    price = UPGRADES[upgrade_id]["price"]
    col = UPGRADE_COLS[upgrade_id]

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM players WHERE user_id = %s FOR UPDATE", (user_id,))
            row = cur.fetchone()
            if not row or row[col] or row["coins"] < price:
                return None

            new_upg = {
                "double": row["upgrade_double"],
                "triple": row["upgrade_triple"],
                "auto":   row["upgrade_auto"],
            }
            new_upg[upgrade_id] = True

            base = 1
            if new_upg["double"]: base *= 2
            if new_upg["triple"]: base *= 3
            new_passive = 1 if new_upg["auto"] else row["passive_per_sec"]

            cur.execute(
                f"""UPDATE players
                    SET coins = coins - %s,
                        {col} = TRUE,
                        coins_per_click = %s,
                        passive_per_sec = %s
                    WHERE user_id = %s RETURNING *""",
                (price, base, new_passive, user_id),
            )
            row = cur.fetchone()
            conn.commit()
            return _row_to_player(row)


def _db_get_leaders(limit: int = 10) -> list:
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT name, coins FROM players ORDER BY coins DESC LIMIT %s", (limit,)
            )
            return [
                {"rank": i + 1, "name": r["name"], "coins": r["coins"]}
                for i, r in enumerate(cur.fetchall())
            ]


# ── JSON fallback (локальная разработка без БД) ───────────────────────────────

def _json_load() -> dict:
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _json_save(data: dict) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _json_get_player(user_id: int, name: str) -> dict:
    data = _json_load()
    key = str(user_id)
    if key not in data:
        player = {
            "user_id": user_id, "name": name,
            "coins": 0, "coins_per_click": 1, "passive_per_sec": 0,
            "total_clicks": 0,
            "upgrades": {"double": False, "triple": False, "auto": False},
        }
        data[key] = player
        _json_save(data)
    return data[key]


def _json_add_coins(user_id: int, count: int) -> dict:
    data = _json_load()
    p = data[str(user_id)]
    p["coins"] += p["coins_per_click"] * count
    p["total_clicks"] = p.get("total_clicks", 0) + count
    _json_save(data)
    return p


def _json_buy_upgrade(user_id: int, upgrade_id: str) -> dict | None:
    if upgrade_id not in UPGRADES:
        return None
    data = _json_load()
    p = data[str(user_id)]
    if p["upgrades"].get(upgrade_id) or p["coins"] < UPGRADES[upgrade_id]["price"]:
        return None
    p["coins"] -= UPGRADES[upgrade_id]["price"]
    p["upgrades"][upgrade_id] = True
    base = 1
    if p["upgrades"]["double"]: base *= 2
    if p["upgrades"]["triple"]: base *= 3
    p["coins_per_click"] = base
    if p["upgrades"]["auto"]: p["passive_per_sec"] = 1
    _json_save(data)
    return p


def _json_get_leaders(limit: int = 10) -> list:
    data = _json_load()
    players = sorted(data.values(), key=lambda p: p["coins"], reverse=True)
    return [{"rank": i + 1, "name": p["name"], "coins": p["coins"]} for i, p in enumerate(players[:limit])]


# ── Публичный API (автовыбор бэкенда) ────────────────────────────────────────

def get_player(user_id: int, name: str) -> dict:
    return _db_get_player(user_id, name) if DATABASE_URL else _json_get_player(user_id, name)

def add_coins(user_id: int, count: int) -> dict:
    return _db_add_coins(user_id, count) if DATABASE_URL else _json_add_coins(user_id, count)

def buy_upgrade(user_id: int, upgrade_id: str) -> dict | None:
    return _db_buy_upgrade(user_id, upgrade_id) if DATABASE_URL else _json_buy_upgrade(user_id, upgrade_id)

def get_leaders(limit: int = 10) -> list:
    return _db_get_leaders(limit) if DATABASE_URL else _json_get_leaders(limit)
