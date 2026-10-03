FROM python:3.13-slim AS base

# uv from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
# Production dependencies only; cached until the lockfile changes.
RUN uv sync --frozen --no-dev --no-install-project

# Test stage: adds dev dependencies and the test suite.
FROM base AS test
RUN uv sync --frozen --no-install-project
COPY app ./app
COPY tests ./tests
CMD ["uv", "run", "--no-sync", "pytest", "--cov=app", "--cov-report=term-missing"]

# Production stage: no tests, non-root user.
FROM base AS prod
COPY app ./app
# Non-root user
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]