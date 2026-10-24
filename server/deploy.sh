#!/usr/bin/env bash
# bundles the server into one file and ships it to fly
set -e
cd "$(dirname "$0")"
bun build src/index.ts --target bun --outdir dist
flyctl deploy --remote-only
