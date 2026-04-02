"""Game server authentication - obtain JWT tokens."""

import httpx


async def login(server_url: str, username: str, password: str) -> str:
    """POST /api/auth/login to get a game JWT token.

    Returns the JWT token string.
    Raises RuntimeError on authentication failure.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{server_url}/api/auth/login",
            json={"username": username, "password": password},
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Login failed for {username}: {resp.status_code} {resp.text}"
            )
        data = resp.json()
        token = data.get("token")
        if not token:
            raise RuntimeError(f"Login response missing token: {data}")
        return token
