#!/usr/bin/env bash
# Dùng từ thư mục infrastructure; không in giá trị bí mật hay đánh giá mã trong .env.
# File tạm 0600 giúp lỗi parser được bắt trước vòng đọc (process substitution che exit code).
env_tmp="$(mktemp)"
if ! node --input-type=module -e '
import {parseEnv} from "node:util"; import {readFileSync} from "node:fs";
for (const [k,v] of Object.entries(parseEnv(readFileSync(".env","utf8")))) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(k) || ["PATH","HOME","SHELL","BASH_ENV","ENV","NODE_OPTIONS","LD_PRELOAD","DOCKER_HOST","DOCKER_CONFIG"].includes(k)) throw new Error("Forbidden env key");
  process.stdout.write(k+"\0"+v+"\0");
}' > "$env_tmp"; then rm -f "$env_tmp"; return 1; fi
while IFS= read -r -d '' env_key && IFS= read -r -d '' env_value; do
  export "$env_key=$env_value"
done < "$env_tmp"
rm -f "$env_tmp"
unset env_tmp env_key env_value
