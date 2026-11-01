.PHONY: up up-storage down init dev build test check check-fix format typecheck db-migrate db-seed

COMPOSE_FILE = infra/compose/compose.yaml

up:
	docker compose -f $(COMPOSE_FILE) up -d postgres

up-storage:
	docker compose -f $(COMPOSE_FILE) --profile storage-local up -d

down:
	docker compose -f $(COMPOSE_FILE) --profile storage-local down

init: up
	@echo "Waiting for PostgreSQL to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' streamflow-postgres 2>/dev/null)" = "healthy" ]; do \
		sleep 1; \
	done
	@echo "PostgreSQL is healthy. Running migrations and seed..."
	pnpm db:migrate
	pnpm db:seed

dev:
	pnpm run dev

build:
	pnpm run build

test:
	pnpm run test

check:
	pnpm run check

check-fix:
	pnpm run check:fix

format:
	pnpm run format

typecheck:
	pnpm run typecheck

db-migrate:
	pnpm run db:migrate

db-seed:
	pnpm run db:seed
