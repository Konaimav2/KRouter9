# Run KRouter9 in a container

KRouter9 ships the same Dockerfile layout as upstream 9router.

## Prebuilt image (ghcr.io)

```bash
docker pull ghcr.io/konaimav2/krouter9:latest
docker run -d \
  --name krouter9 \
  --restart unless-stopped \
  -p 20128:20128 \
  -v "$HOME/.krouter9:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/konaimav2/krouter9:latest
```

Tags: `latest` tracks main, `0.5.69` etc. are release pins.

The package is currently private — `docker login ghcr.io -u Konaimav2` first
(any token with `read:packages`), or make the package public:
github.com → Packages → krouter9 → Package settings → Change visibility.

## Build from source

```bash
git clone https://github.com/Konaimav2/KRouter9.git
cd KRouter9
docker build -t krouter9 .
docker run -d \
  --name krouter9 \
  --restart unless-stopped \
  -p 20128:20128 \
  -v "$HOME/.krouter9:/app/data" \
  -e DATA_DIR=/app/data \
  krouter9
```

→ Open http://localhost:20128 — dashboard at `/dashboard`, API at `/v1`.

## Compose (docker-compose.yml included in the repo)

```bash
docker compose up -d
```

The committed `docker-compose.yml` builds from source and exposes port 20128
with a `./data` volume. Edit `INITIAL_PASSWORD` / `JWT_SECRET` in the file (or
export them) before exposing beyond localhost.

## Container defaults

| Path / var | Value |
|---|---|
| Data dir (container) | `/app/data` |
| Port | `20128` |
| Dashboard password | `INITIAL_PASSWORD` env (default `123456` if unset — change it) |
| API keys, accounts, settings | SQLite inside the data volume |

## Ops

```bash
docker logs -f krouter9      # view logs
docker stop krouter9         # stop
docker start krouter9        # start again
docker exec -it krouter9 sh  # shell in
```

## Migrating data in

Dump your old 9router / ZenRouter / 9router-v3 SQLite and import (host side):

```bash
node tools/migrations/sqlite-dump.js ~/.9router/db/data.sqlite
node tools/migrations/import.js import ~/.9router/db-export.json
```

Or point the container's `DATA_DIR` volume at a directory containing a
pre-imported `data.sqlite`.

## Publishing your own image (optional)

```bash
docker tag krouter9 ghcr.io/Konaimav2/krouter9:latest
docker push ghcr.io/Konaimav2/krouter9:latest
# or Docker Hub:
docker tag krouter9 <dockerhub-user>/krouter9:latest
docker push <dockerhub-user>/krouter9:latest
```

Multi-platform build (matches upstream's amd64+arm64):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/krouter9:latest --push .
```
