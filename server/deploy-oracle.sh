#!/usr/bin/env bash
# bundles the server and ships it to the oracle vm, the env file there is never overwritten
set -e
cd "$(dirname "$0")"
HOST=${MUSDY_HOST:-ubuntu@129.225.102.39}
KEY=${MUSDY_KEY:-$HOME/.ssh/musdy_oracle}
bun build src/index.ts --target bun --outdir dist
scp -i "$KEY" dist/index.js "$HOST":/opt/musdy/index.js
ssh -i "$KEY" "$HOST" 'sudo systemctl restart musdy && sleep 15 && curl -s localhost:8080/health'
