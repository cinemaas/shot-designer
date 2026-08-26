#!/bin/bash
# Start the Shot Designer clone and open it.
cd "$(dirname "$0")"
python3 server.py &
sleep 1
open http://localhost:8769
wait
