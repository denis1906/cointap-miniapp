from aiohttp import web
import storage


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(
            status=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        )
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


async def handle_player(request):
    try:
        user_id = int(request.rel_url.query.get("user_id", 0))
        name = request.rel_url.query.get("name", "Player")
        if not user_id:
            return web.json_response({"error": "user_id required"}, status=400)
        player = storage.get_player(user_id, name)
        return web.json_response(player)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_click(request):
    try:
        data = await request.json()
        user_id = int(data.get("user_id", 0))
        count = min(int(data.get("count", 1)), 50)
        if not user_id:
            return web.json_response({"error": "user_id required"}, status=400)
        player = storage.add_coins(user_id, count)
        return web.json_response(player)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_buy(request):
    try:
        data = await request.json()
        user_id = int(data.get("user_id", 0))
        upgrade_id = data.get("upgrade", "")
        if not user_id:
            return web.json_response({"error": "user_id required"}, status=400)
        result = storage.buy_upgrade(user_id, upgrade_id)
        if result is None:
            return web.json_response(
                {"error": "Недостаточно монет или улучшение уже куплено"}, status=400
            )
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_leaders(request):
    try:
        top = storage.get_leaders(10)
        return web.json_response({"top": top})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


app_web = web.Application(middlewares=[cors_middleware])
app_web.router.add_get("/api/player", handle_player)
app_web.router.add_post("/api/click", handle_click)
app_web.router.add_post("/api/buy", handle_buy)
app_web.router.add_get("/api/leaders", handle_leaders)
# OPTIONS preflight для всех роутов
for path in ["/api/player", "/api/click", "/api/buy", "/api/leaders"]:
    app_web.router.add_route("OPTIONS", path, lambda r: web.Response(status=200))
