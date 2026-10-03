import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing
from typing import Any

logger = logging.getLogger(__name__)

# Rows per network write: bounded buffer keeps memory flat and the first rows arrive quickly.
FLUSH_EVERY = 2_000


def encode_line(obj: dict[str, Any]) -> bytes:
    # Compact separators and raw UTF-8: smaller payload on 1M+ rows.
    return (json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


async def ndjson_stream(
    meta: dict[str, Any], rows: AsyncGenerator[dict[str, Any]],
) -> AsyncIterator[bytes]:
    """Frame a row iterator as NDJSON: meta line, row lines, then done/error.

    The final line lets the client tell a complete stream from a truncated one,
    which the HTTP status cannot do once streaming has started.
    """
    yield encode_line({"meta": meta})
    sent = 0
    buffer: list[bytes] = []
    try:
        # If the client disconnects, the row generator (and the Mongo cursor behind it) 
        # is closed immediately, not at garbage collection.
        async with aclosing(rows):
            async for row in rows:
                buffer.append(encode_line(row))
                sent += 1
                if len(buffer) >= FLUSH_EVERY:
                    yield b"".join(buffer)
                    buffer.clear()
        if buffer:
            yield b"".join(buffer)
    except Exception:
        logger.exception("Row stream interrupted after %d rows", sent)
        yield encode_line({"error": "stream interrupted"})
        return
    yield encode_line({"done": sent})
