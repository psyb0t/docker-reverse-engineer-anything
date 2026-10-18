#!/usr/bin/env bash
# Sets the project version in every static declaration: VERSION and the Codex
# plugin manifest. server.json and the OpenClaw plugin keep their 0.0.0
# placeholders; CI stamps them from the release tag. Never touches Git.
set -euo pipefail

readonly CODEX_MANIFEST=.agents/.codex-plugin/plugin.json

main() {
	local version=${V:-}
	local tmp
	[[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
		printf 'V must be X.Y.Z, got "%s"\n' "${version}" >&2
		exit 2
	}
	printf '%s\n' "${version}" >VERSION
	tmp=$(mktemp)
	jq --arg v "${version}" '.version = $v' "${CODEX_MANIFEST}" >"${tmp}"
	mv "${tmp}" "${CODEX_MANIFEST}"
	printf 'version set to %s in VERSION and %s\n' "${version}" "${CODEX_MANIFEST}"
}

main "$@"
