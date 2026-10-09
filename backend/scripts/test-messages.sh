#!/usr/bin/env bash
# C14: entrypoint cũ chuyển sang suite có assertion, không ghi vào DB demo đang chạy.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npm run test:integration
