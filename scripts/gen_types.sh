#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# TODO(B): announce changes and commit schema, fixtures, and both generated type files.
./web/node_modules/.bin/json2ts -i contracts/schema.json -o web/lib/contracts.ts --bannerComment '/* Generated from contracts/schema.json. Run make types; do not edit. */'
cp web/lib/contracts.ts extension/lib/contracts.d.ts
