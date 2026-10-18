#!/bin/sh
# Container entrypoint (run under tini).
#   bridge  Streamable HTTP MCP bridge on port 8080 (default)
#   mcp     REA's own stdio MCP server, for `docker run -i`
#   *       any other arguments run the REA CLI, e.g. `--help`
#
# REA_INSTALL=ghidra installs opt-in tools into REA_TOOLS_DIR (a volume) first
# and exports the variables REA needs to find them.
set -eu

if [ -n "${REA_INSTALL:-}" ]; then
	env_file="${TMPDIR:-/tmp}/rea-tools.env"
	node /app/dist/install.js "${env_file}"
	set -a
	# shellcheck disable=SC1090 # written by install.js just above
	. "${env_file}"
	set +a
	rm -f "${env_file}"
fi

case "${1:-bridge}" in
bridge)
	exec node /app/dist/main.js
	;;
mcp)
	exec rea mcp
	;;
*)
	exec rea "$@"
	;;
esac
