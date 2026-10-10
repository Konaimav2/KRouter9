#!/usr/bin/env bash
# Reviewed, user-invoked setup only. Never starts a gateway or modifies its database.
set -euo pipefail
umask 077

if (( $# )); then
  printf '%s\n' 'No flags supported. Review this file, then run it interactively.' >&2
  exit 2
fi
if [[ -z "${HOME:-}" || "$HOME" != /* || ! -d "$HOME" ]]; then
  printf '%s\n' 'A valid absolute HOME directory is required.' >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Install Node.js 18 or newer first.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { printf '%s\n' 'Install npm first.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || {
  printf '%s\n' 'Node.js 18 or newer is required.' >&2
  exit 1
}

printf '%s\n' 'Install krouter9@latest globally via npm? This downloads code and runs npm package installation hooks.'
printf '%s\n' 'No administrator escalation is used. If npm denies access, configure a user-owned npm prefix and retry.'
printf '%s' 'Type yes to continue: '
IFS= read -r consent || { printf '\n%s\n' 'Cancelled: no confirmation received.' >&2; exit 1; }
if [[ "$consent" != 'yes' ]]; then
  printf '%s\n' 'Cancelled. Nothing installed.'
  exit 0
fi

data_dir="$HOME/.krouter9"
if [[ -L "$data_dir" || ( -e "$data_dir" && ! -d "$data_dir" ) ]]; then
  printf '%s\n' 'Refusing an unsafe data directory. No files changed.' >&2
  exit 1
fi
npm install --global krouter9@latest
mkdir -p -- "$data_dir"
launcher="$data_dir/start-local.sh"
# noclobber is atomic: never replace an existing launcher or follow its symlink.
if [[ -e "$launcher" || -L "$launcher" ]]; then
  printf '%s\n' 'Existing launch scaffold preserved.'
else
  (
    set -o noclobber
    cat > "$launcher" <<'LAUNCH'
#!/usr/bin/env bash
# Local-only launch scaffold. Configure providers and access in the dashboard.
set -euo pipefail
exec krouter9 --host 127.0.0.1 --port 20128 "$@"
LAUNCH
  ) || { printf '%s\n' 'Launch scaffold creation refused; existing file preserved.' >&2; exit 1; }
  chmod 700 -- "$launcher"
  printf '%s\n' 'Created private local-only launch scaffold: ~/.krouter9/start-local.sh'
fi
printf '%s\n' 'Setup complete. Review ~/.krouter9/start-local.sh, then run it yourself.'
printf '%s\n' 'No server was started. Configure providers and access in the local dashboard before exposing it remotely.'
