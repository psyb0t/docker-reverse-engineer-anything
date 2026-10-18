#!/usr/bin/env bash
# Age-gated dependency lifecycle, run inside the dev image by the pkg-* Make
# targets. Every third-party release must be at least seven days old when it is
# added or upgraded.
#
# release-age-cutoff holds the UTC cutoff. lock keeps it; add, update, upgrade
# and remove move it to seven days before now. pnpm's minimumReleaseAge is a
# duration, so it is recomputed from the cutoff before every resolution: a
# later lock run still refuses anything published after the recorded cutoff.
#
# Usage: pkg.sh lock|upgrade|audit
#        pkg.sh add|update|remove PACKAGE
set -euo pipefail

readonly CUTOFF_FILE=release-age-cutoff
readonly WORKSPACE_FILE=pnpm-workspace.yaml
readonly GATE_DAYS=7
readonly PACKAGE_PATTERN='^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*(@[0-9]+\.[0-9]+\.[0-9]+)?$'

log() {
	local level=$1
	shift
	printf '{"level":"%s","msg":"%s"}\n' "${level}" "$*" >&2
}

fail() {
	log ERROR "$*"
	exit 1
}

refresh_cutoff() {
	date -u -d "${GATE_DAYS} days ago" '+%Y-%m-%dT%H:%M:%SZ' >"${CUTOFF_FILE}"
	log INFO "release-age cutoff moved to $(cat "${CUTOFF_FILE}")"
}

apply_cutoff() {
	local cutoff cutoff_epoch now_epoch minutes
	[[ -s "${CUTOFF_FILE}" ]] || fail "${CUTOFF_FILE} is missing"
	cutoff=$(tr -d '[:space:]' <"${CUTOFF_FILE}")
	cutoff_epoch=$(date -u -d "${cutoff}" '+%s') || fail "invalid cutoff ${cutoff}"
	now_epoch=$(date -u '+%s')
	((cutoff_epoch < now_epoch)) || fail "cutoff ${cutoff} is in the future"
	minutes=$(((now_epoch - cutoff_epoch + 59) / 60))
	sed -i -E "s/^minimumReleaseAge: [0-9]+$/minimumReleaseAge: ${minutes}/" "${WORKSPACE_FILE}"
	grep -qx "minimumReleaseAge: ${minutes}" "${WORKSPACE_FILE}" || fail "could not set minimumReleaseAge"
	log INFO "resolving releases published before ${cutoff} (minimumReleaseAge ${minutes} minutes)"
}

require_package() {
	local package=${1:-}
	[[ -n "${package}" ]] || fail "PKG is required"
	[[ "${package}" =~ ${PACKAGE_PATTERN} ]] || fail "PKG must be name or name@X.Y.Z, got ${package}"
}

main() {
	local command=${1:-}
	local package=${2:-}

	case "${command}" in
	lock)
		apply_cutoff
		pnpm install --lockfile-only --ignore-scripts
		;;
	add)
		require_package "${package}"
		refresh_cutoff
		apply_cutoff
		pnpm add --save-exact --lockfile-only --ignore-scripts "${package}"
		;;
	update)
		require_package "${package}"
		refresh_cutoff
		apply_cutoff
		pnpm update --latest --lockfile-only --ignore-scripts "${package}"
		;;
	upgrade)
		refresh_cutoff
		apply_cutoff
		pnpm update --latest --lockfile-only --ignore-scripts
		;;
	remove)
		require_package "${package}"
		refresh_cutoff
		apply_cutoff
		pnpm remove --lockfile-only --ignore-scripts "${package}"
		;;
	audit)
		pnpm audit --prod
		;;
	*)
		fail "usage: pkg.sh lock|upgrade|audit or pkg.sh add|update|remove PACKAGE"
		;;
	esac
}

main "$@"
