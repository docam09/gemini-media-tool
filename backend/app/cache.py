"""Tiny in-process LRU + TTL cache for completed translations.

Real conversations repeat themselves constantly ("네, 알겠습니다", "cảm ơn anh",
a term read back for confirmation). Serving those from memory turns a ~600ms
round trip into ~0ms and saves API quota, which matters on the free tier.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock


class TranslationCache:
    def __init__(self, *, maxsize: int = 512, ttl_seconds: float = 3600.0) -> None:
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._entries: OrderedDict[tuple[str, ...], tuple[float, str]] = OrderedDict()
        self._lock = Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: tuple[str, ...]) -> str | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self.misses += 1
                return None
            stored_at, value = entry
            if now - stored_at > self._ttl:
                del self._entries[key]
                self.misses += 1
                return None
            self._entries.move_to_end(key)
            self.hits += 1
            return value

    def put(self, key: tuple[str, ...], value: str) -> None:
        with self._lock:
            self._entries[key] = (time.monotonic(), value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._maxsize:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"size": len(self._entries), "hits": self.hits, "misses": self.misses}
