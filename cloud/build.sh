#!/bin/bash
# Stage the app files the Worker serves. Run before `wrangler deploy`.
set -e
cd "$(dirname "$0")"
rm -rf public && mkdir -p public
cp ../index.html ../style.css ../app.js ../hcw.js ../render.js \
   ../catalog.js ../assets.js ../blocking.js ../storage.js public/
echo "staged $(ls public | wc -l | tr -d ' ') files into cloud/public"
