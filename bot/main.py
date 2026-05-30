import asyncio
import logging
import os
from aiogram import Bot, Dispatcher
from aiohttp import web
from config import BOT_TOKEN, API_URL
from handlers import router
import server as api_server


async def main():
    logging.basicConfig(level=logging.INFO)

    # Запуск HTTP API сервера
    runner = web.AppRunner(api_server.app_web)
    await runner.setup()
    host, port = "0.0.0.0", int(os.getenv("PORT", 8080))
    site = web.TCPSite(runner, host, port)
    await site.start()
    logging.info("API сервер запущен: http://%s:%s  (публичный: %s)", host, port, API_URL)

    # Запуск бота
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
