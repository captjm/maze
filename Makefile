# =========================
# Config
# =========================
DC = docker compose
SERVICE = dev

FRONTEND = frontend
WASM = wasm

# =========================
# Docker lifecycle
# =========================

up:
	$(DC) up -d

down:
	$(DC) down

build:
	$(DC) build

rebuild:
	$(DC) build --no-cache

logs:
	$(DC) logs -f

shell:
	$(DC) exec $(SERVICE) bash


# =========================
# Frontend (Vite)
# =========================

frontend-install:
	$(DC) exec $(SERVICE) sh -c "cd $(FRONTEND) && npm install"

frontend-dev:
	$(DC) exec $(SERVICE) sh -c "cd $(FRONTEND) && npm run dev -- --host 0.0.0.0"

frontend-build:
	$(DC) exec $(SERVICE) sh -c "cd $(FRONTEND) && npm run build"


# =========================
# Rust / WASM
# =========================

wasm-build:
	$(DC) exec $(SERVICE) sh -c "cd $(WASM) && cargo build"

wasm-watch:
	$(DC) exec $(SERVICE) sh -c "cd $(WASM) && cargo watch -x build"

wasm-release:
	$(DC) exec $(SERVICE) sh -c "cd $(WASM) && cargo build --release"


# =========================
# WASM pack (optional)
# =========================

wasm-pack:
	$(DC) exec $(SERVICE) sh -c "cd $(WASM) && wasm-pack build --target web"


# =========================
# Dev helpers
# =========================

dev:
	$(DC) exec $(SERVICE) sh -c "cd $(FRONTEND) && npm run dev -- --host 0.0.0.0"

reset:
	$(DC) down -v
	$(DC) up -d --build

add-file-paths:
	$(DC) exec $(SERVICE) sh -c "cd $(FRONTEND) && npm run add:file-paths"