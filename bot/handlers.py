import json
import logging
from aiogram import Router, F
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import Command
import storage
from config import WEBAPP_URL, API_URL

router = Router()
logger = logging.getLogger(__name__)


def player_to_response(player: dict) -> dict:
    return {
        "type": "player",
        "coins": player["coins"],
        "coins_per_click": player["coins_per_click"],
        "passive_per_sec": player["passive_per_sec"],
        "upgrades": player["upgrades"],
    }


@router.message(Command("start"))
async def cmd_start(message: Message):
    user_id = message.from_user.id
    name = message.from_user.first_name
    storage.get_player(user_id, name)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🪙 Играть",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}?api={API_URL}"),
        )
    ]])
    await message.answer(
        f"👋 Привет, {name}!\n"
        "Нажимай монету и зарабатывай монеты 🪙\n"
        "Трать их в магазине на улучшения!",
        reply_markup=keyboard,
    )


@router.message(F.web_app_data)
async def handle_webapp_data(message: Message):
    user_id = message.from_user.id
    name = message.from_user.first_name

    try:
        data = json.loads(message.web_app_data.data)
    except json.JSONDecodeError:
        logger.warning("Невалидный JSON от user_id=%s", user_id)
        return

    action = data.get("action")

    if action == "init":
        player = storage.get_player(user_id, name)
        await message.answer(json.dumps(player_to_response(player), ensure_ascii=False))

    elif action == "click":
        count = int(data.get("count", 1))
        if count > 50:
            count = 50
        player = storage.add_coins(user_id, count)
        await message.answer(json.dumps(player_to_response(player), ensure_ascii=False))

    elif action == "buy":
        upgrade_id = data.get("upgrade", "")
        result = storage.buy_upgrade(user_id, upgrade_id)
        if result is None:
            await message.answer(json.dumps(
                {"type": "error", "msg": "Недостаточно монет или улучшение уже куплено"},
                ensure_ascii=False,
            ))
        else:
            await message.answer(json.dumps(player_to_response(result), ensure_ascii=False))

    elif action == "leaders":
        top = storage.get_leaders(10)
        await message.answer(json.dumps(
            {"type": "leaders", "top": top},
            ensure_ascii=False,
        ))
