#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# TODO(B): announce contract changes; commit schema, fixtures, and generated types together.
./web/node_modules/.bin/json2ts -i contracts/schema.json -o web/lib/contracts.ts --bannerComment '/* Generated from contracts/schema.json. Run make types; do not edit. */'
