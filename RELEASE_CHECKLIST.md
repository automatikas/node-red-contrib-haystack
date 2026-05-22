# v0.1.0 Release Checklist

This checklist tracks the minimum work to ship the first public release of `node-red-contrib-haystack`.

## 1. Format And Return Hardening

- [x] Document the exact request/response format rules for every node
- [x] Make sure generated request bodies use the correct wire format or explicitly fall back to Zinc
- [x] Verify `Return` behavior is consistent across all nodes
- [x] Verify JSON parsing only happens when the server actually returns JSON
- [x] Review node help text so it matches the runtime behavior

## 2. Example Flows

- [x] Add an importable flow for `haystack-read`
- [x] Add an importable flow for `haystack-hisread`
- [x] Add an importable flow for `haystack-eval`
- [x] Add an importable flow for `haystack-point-write`
- [x] Add short notes explaining how to configure the server node in the example flows

## 3. Automated Tests

- [x] Add unit tests for shared request/body building helpers
- [x] Add tests for `eval` request generation in Zinc and JSON
- [x] Add tests for `read` id/filter behavior
- [x] Add tests for `hisRead` request generation
- [x] Add tests for `pointWrite` request generation and result behavior
- [x] Add tests for response parsing and `Return` handling

## 4. Package And Publish Polish

- [x] Add repository metadata to `package.json`
- [x] Add homepage / bugs metadata to `package.json`
- [x] Add author metadata to `package.json`
- [x] Add a `CHANGELOG.md`
- [x] Review keywords, description, and Node-RED metadata
- [x] Do a final README pass for publish-ready usage guidance

## 5. Release Validation

- [x] Run lint / syntax checks
- [x] Import example flows into a local Node-RED instance
- [x] Re-test against Haxall
- [x] Re-test against FIN
- [ ] Decide release version and tag `v0.1.0`

## Post-V1 / Nice To Have

- [ ] Improve auth/debug error messages for wrong username, password, or project path
- [ ] Validate watch/session-style ops across multiple servers
- [ ] Add dedicated `hisWrite` validation and request-side guardrails similar to `pointWrite`
- [ ] Add stronger support for additional generated request formats beyond the current Zinc-first rule
