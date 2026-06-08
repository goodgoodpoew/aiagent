#!/usr/bin/env bash
set -euo pipefail

patterns=(
  ".pnpm-store/*"
  "antdXStudy/coverage/*"
  "antdXStudy/src/.umi-production/*"
  "antdXStudy/playwright-report/*"
  "antdXStudy/playwright-gray-report/*"
  "antdXStudy/test-results/*"
  "ai-proxy-server/uploads/*"
  "ai-proxy-server/uploads-test/*"
)

tracked="$(git ls-files "${patterns[@]}")"

if [[ -n "${tracked}" ]]; then
  echo "以下生成产物或本机缓存仍被 git 跟踪，请先从索引移除："
  echo "${tracked}"
  exit 1
fi

echo "生成产物索引检查通过。"
