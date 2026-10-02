ENV ?= dev
COMPOSE = docker compose --env-file .env.$(ENV)

export ENV_FILE = .env.$(ENV)

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

.PHONY: up down logs