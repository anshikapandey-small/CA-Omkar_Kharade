#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
read -rp 'Owner username: ' owner
read -rsp 'Owner password (at least 16 characters): ' password; echo
[[ -n "$owner" && ${#password} -ge 16 ]] || { echo 'Enter a username and a longer password.'; exit 1; }
read -rsp 'Confirm password: ' confirm; echo
[[ "$password" == "$confirm" ]] || { echo 'Passwords differ.'; exit 1; }
read -rsp 'Fine-grained GitHub token: ' token; echo
[[ -n "$token" ]] || exit 1
digest=$(printf %s "$password" | node -e "const c=require('node:crypto'),s=c.randomBytes(16),p=require('node:fs').readFileSync(0);console.log(s.toString('hex')+':'+c.pbkdf2Sync(p,s,100000,32,'sha256').toString('hex'))")
session=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
printf '%s\0' "$owner" "$digest" "$session" "$token" | node -e "const [OWNER_NAME,PASSWORD_HASH,SESSION_KEY,GITHUB_TOKEN]=require('node:fs').readFileSync(0,'utf8').split('\u0000');process.stdout.write(JSON.stringify({OWNER_NAME,PASSWORD_HASH,SESSION_KEY,GITHUB_TOKEN}))" | npx wrangler@4 secret bulk
