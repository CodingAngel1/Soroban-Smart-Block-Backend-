#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [existing-image]" >&2
  exit 2
fi

image=${1:-node:24-slim}
runtime_user=()
if [[ $# -eq 0 ]]; then
  runtime_user+=(--user 1001:1001)
fi

docker run --rm \
  --pull=always \
  "${runtime_user[@]}" \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --entrypoint=node \
  "$image" \
  -e '
    const fs = require("node:fs");
    const status = fs.readFileSync("/proc/self/status", "utf8");
    const field = (name) => status.split("\n").find((line) => line.startsWith(`${name}:`))?.split(/\s+/)[1];
    const uid = process.getuid();
    const effectiveCapabilities = field("CapEff");
    const noNewPrivileges = field("NoNewPrivs");

    console.log(`uid=${uid} CapEff=${effectiveCapabilities} NoNewPrivs=${noNewPrivileges}`);
    if (uid === 0 || effectiveCapabilities !== "0000000000000000" || noNewPrivileges !== "1") {
      console.error("Runtime privilege verification failed.");
      process.exit(1);
    }
  '
