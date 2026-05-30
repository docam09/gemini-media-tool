import re
from html import unescape

import httpx
from pydantic import HttpUrl


TITLE_PATTERN = re.compile(
    r'<meta\s+(?:property|name)=["\'](?:og:title|twitter:title|title)["\']\s+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
DESCRIPTION_PATTERN = re.compile(
    r'<meta\s+(?:property|name)=["\'](?:og:description|twitter:description|description)["\']\s+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def _extract(pattern: re.Pattern[str], html: str) -> str:
    match = pattern.search(html)
    return unescape(match.group(1)).strip() if match else ""


async def read_public_url(url: HttpUrl) -> str:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=10,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122 Safari/537.36"
            )
        },
    ) as client:
        response = await client.get(str(url))
        response.raise_for_status()

    title = _extract(TITLE_PATTERN, response.text)
    description = _extract(DESCRIPTION_PATTERN, response.text)
    chunks = [chunk for chunk in [title, description] if chunk]
    return "\n".join(chunks)
