# Changelog

All notable changes to this project will be documented in this file.

## 0.1.1 - 2026-05-22

### Changed

- Simplified README install and usage guidance
- Simplified public README wording
- Updated npm package naming and public install guidance to use `node-red-contrib-haystack`
- Added direct Project Haystack format links for Zinc, JSON, and Trio
- Clarified generic behavior and compatibility wording in the docs

## 0.1.0 - 2026-05-22

### Added

- Initial `haystack-server` config node for Project Haystack connection settings
- Generic `haystack-request` node for Haystack HTTP operations
- Convenience nodes for `read`, `hisRead`, `eval`, and `pointWrite`
- Project Haystack SCRAM authentication flow with bearer token reuse
- Request/response format selection for Zinc, JSON, and Trio
- Return mode selection for UTF-8 string or parsed JSON object
- Sanitized importable demo flow in `examples/demo-flow.json`
- Initial automated tests for shared request/response helpers

### Validated

- Authentication works against Haxall and FIN using the validated Haystack auth flow
- HTTPS works with a valid FQDN and trusted CA certificate
- `eval` uses POST
- `read` works by filter and by id
- `pointWrite` supports write response or updated point write array return modes
- `about`, `ops`, and `nav` were validated against live servers

### Interoperability Notes

- `ops` is the preferred discovery entry point for checking which operations a specific server exposes
- `formats` was available on one tested server but returned `404` on the tested Haxall target
- watch/session-style ops are not yet validated across servers
- `hisWrite` is not included yet and needs dedicated validation and request-side guardrails
- generated request bodies use Zinc by default; `eval` is the main operation with built-in JSON request generation

### Notes

- Generated request bodies use Zinc by default unless JSON generation is explicitly implemented for that operation or `msg.rawBody` is supplied
- Zinc and Trio responses are returned as UTF-8 strings
- JSON responses can be returned as parsed objects
