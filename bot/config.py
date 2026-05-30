import os
from dotenv import load_dotenv

# Ищем .env в родительской папке (cointap/) относительно этого файла
_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_base, ".env"))


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Переменная окружения {name} не задана. Проверьте .env файл.")
    return value


BOT_TOKEN: str = _require("BOT_TOKEN")
WEBAPP_URL: str = _require("WEBAPP_URL")
API_URL: str = os.getenv("API_URL", "http://localhost:8080")

# Путь к players.json всегда относительно корня проекта (cointap/data/)
DATA_FILE = os.path.join(_base, "data", "players.json")

UPGRADES = {
    "double": {"price": 500,  "label": "Двойной удар"},
    "triple": {"price": 2000, "label": "Тройной удар"},
    "auto":   {"price": 1000, "label": "Автокликер"},
}
