#!/bin/bash
# Build, deploy, and print the address. Assumes `wrangler login` has been done.
set -e
cd "$(dirname "$0")"
./build.sh
wrangler deploy
echo
echo "Set the passphrase if you haven't:  wrangler secret put SYNC_KEY"
