#!/bin/bash
# Parse every app module as an ES module. `node --check` treats files as scripts,
# so it misses duplicate top-level declarations and module-only syntax — which
# has shipped a blank app more than once.
cd "$(dirname "$0")/.."
fail=0
for f in *.js; do
  out=$(node --input-type=module -e "$(cat "$f")" 2>&1)
  if grep -q "SyntaxError" <<<"$out"; then
    echo "SYNTAX ERROR in $f"
    grep -A2 "SyntaxError" <<<"$out" | head -4
    fail=1
  fi
done
[ $fail -eq 0 ] && echo "all modules parse"
exit $fail
