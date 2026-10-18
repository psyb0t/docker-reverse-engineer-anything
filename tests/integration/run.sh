#!/usr/bin/env bash
# Integration test for the built image. Needs only Docker on the host:
#   1. the REA CLI answers;
#   2. `mcp` serves REA's stdio MCP server;
#   3. the bridge runs hardened (read-only root, no capabilities, non-root),
#      refuses a missing token, and passes a real MCP client through to REA's
#      Android tools on the pinned ApiDemos APK (tests/integration/client.ts);
#   4. REA_INSTALL=ghidra installs Ghidra into a volume and the bridge analyzes
#      a native binary with it (amd64), or refuses with a clear reason (arm64).
set -euo pipefail

readonly TEST_IMAGE=${TEST_IMAGE:?TEST_IMAGE is required}
readonly DEV_IMAGE=${DEV_IMAGE:?DEV_IMAGE is required}
readonly FIXTURES="${PWD}/tests/.fixtures"
readonly NAME="rea-integration-$$"
readonly HEALTH_ATTEMPTS=60
# The first Ghidra start downloads about 570 MB before the bridge listens.
readonly GHIDRA_HEALTH_ATTEMPTS=900
# Kept between runs so local reruns skip the Ghidra download; make clean drops it.
readonly TOOLS_VOLUME=${TOOLS_VOLUME:-rea-integration-tools}
readonly SKILL_WRAPPER=.agents/skills/reverse-engineer-anything/scripts/rea.sh
# The flags every documented docker run uses.
readonly HARDENING=(
	--read-only
	--tmpfs "/tmp:rw,nosuid,size=2g"
	--tmpfs "/home/rea:rw,nosuid,size=256m"
	--cap-drop ALL
	--security-opt no-new-privileges
)

log() {
	local level=$1
	shift
	printf '{"level":"%s","msg":"%s"}\n' "${level}" "$*" >&2
}

cleanup() {
	local status=$?
	local container
	if ((status != 0)); then
		for container in "${NAME}" "${NAME}-ghidra"; do
			docker inspect "${container}" >/dev/null 2>&1 || continue
			log ERROR "${container} logs follow"
			docker logs "${container}" 2>&1 | tail -n 100 >&2 || true
		done
	fi
	docker rm -f "${NAME}" "${NAME}-stdio" "${NAME}-ghidra" >/dev/null 2>&1 || true
	exit "${status}"
}
trap cleanup EXIT

on_network_of() {
	local container=$1
	shift
	docker run --rm --network "container:${container}" "$@"
}

on_bridge_network() {
	on_network_of "${NAME}" "$@"
}

wait_healthy() {
	local container=$1 attempts=$2 attempt
	for ((attempt = 1; attempt <= attempts; attempt++)); do
		if ! docker inspect -f '{{.State.Running}}' "${container}" 2>/dev/null | grep -q true; then
			log ERROR "${container} exited before becoming healthy"
			return 1
		fi
		if on_network_of "${container}" "${DEV_IMAGE}" node -e \
			"fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" 2>/dev/null; then
			log INFO "${container} healthy"
			return 0
		fi
		sleep 1
	done
	log ERROR "${container} did not become healthy"
	return 1
}

test_cli() {
	local output
	output=$(docker run --rm --network none "${HARDENING[@]}" "${TEST_IMAGE}" --help 2>&1)
	grep -q 'mcp' <<<"${output}" || {
		log ERROR "rea --help did not mention mcp"
		return 1
	}
	log INFO "cli ok"
}

test_stdio_mcp() {
	local requests response
	requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"it","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
	# Keep stdin open until both answers are back; head closes the pipe.
	response=$({ printf '%s\n' "${requests}"; sleep 90; } |
		docker run --rm -i --name "${NAME}-stdio" "${HARDENING[@]}" \
			-v "${FIXTURES}:/work:ro" "${TEST_IMAGE}" mcp 2>/dev/null |
		head -n 2 | tail -n 1) || true
	docker rm -f "${NAME}-stdio" >/dev/null 2>&1 || true
	grep -q '"inspect_android_package"' <<<"${response}" || {
		log ERROR "stdio tools/list did not include inspect_android_package"
		return 1
	}
	log INFO "stdio mcp ok"
}

test_skill_wrapper() {
	local output
	output=$(REA_IMAGE="${TEST_IMAGE}" "${SKILL_WRAPPER}" --dir "${FIXTURES}" \
		inspect-android-package /work/ApiDemos-debug.apk)
	grep -q 'io.appium.android.apis' <<<"${output}" || {
		log ERROR "skill wrapper inspect-android-package did not report the package"
		return 1
	}
	log INFO "skill wrapper apk analysis ok"
}

start_bridge() {
	REA_BRIDGE_TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
	export REA_BRIDGE_TOKEN
	docker run -d --name "${NAME}" \
		-e REA_BRIDGE_TOKEN \
		"${HARDENING[@]}" \
		-v "${FIXTURES}:/work:ro" \
		"${TEST_IMAGE}" >/dev/null
	wait_healthy "${NAME}" "${HEALTH_ATTEMPTS}"
}

test_bridge_auth() {
	local status
	status=$(on_bridge_network "${DEV_IMAGE}" node -e \
		"fetch('http://localhost:8080/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((r) => console.log(r.status))")
	[[ "${status}" == "401" ]] || {
		log ERROR "unauthenticated request returned ${status}, expected 401"
		return 1
	}
	log INFO "bridge refuses a missing token"
}

test_bridge_android() {
	on_bridge_network -e REA_BRIDGE_TOKEN -v "${PWD}:/src:ro" -w /src "${DEV_IMAGE}" \
		node tests/integration/client.ts
	log INFO "bridge android analysis ok"
}

test_ghidra() {
	local arch output
	arch=$(docker info --format '{{.Architecture}}')
	if [[ "${arch}" != "x86_64" ]]; then
		output=$(docker run --rm "${HARDENING[@]}" -e REA_INSTALL=ghidra \
			-v "${TOOLS_VOLUME}:/opt/rea-tools" "${TEST_IMAGE}" --help 2>&1) && {
			log ERROR "REA_INSTALL=ghidra should refuse on ${arch}"
			return 1
		}
		grep -q 'no native decompiler' <<<"${output}" || {
			log ERROR "REA_INSTALL=ghidra on ${arch} failed without the expected reason"
			return 1
		}
		log INFO "ghidra install refused on ${arch} with a clear reason"
		return 0
	fi

	docker volume create "${TOOLS_VOLUME}" >/dev/null
	docker run -d --name "${NAME}-ghidra" \
		-e REA_BRIDGE_TOKEN \
		-e REA_INSTALL=ghidra \
		"${HARDENING[@]}" \
		-v "${TOOLS_VOLUME}:/opt/rea-tools" \
		"${TEST_IMAGE}" >/dev/null
	wait_healthy "${NAME}-ghidra" "${GHIDRA_HEALTH_ATTEMPTS}"
	on_network_of "${NAME}-ghidra" -e REA_BRIDGE_TOKEN -v "${PWD}:/src:ro" -w /src "${DEV_IMAGE}" \
		node tests/integration/native-client.ts
	log INFO "ghidra native analysis ok"
}

main() {
	[[ -f "${FIXTURES}/ApiDemos-debug.apk" ]] || {
		log ERROR "missing fixture; run make fixtures"
		exit 1
	}
	test_cli
	test_stdio_mcp
	test_skill_wrapper
	start_bridge
	test_bridge_auth
	test_bridge_android
	test_ghidra
	log INFO "integration tests passed"
}

main "$@"
