# @automatikas/node-red-contrib-haystack

Node-RED nodes for Project Haystack authentication and HTTP ops against Project Haystack servers such as Haxall, FIN, SkySpark, and other Haystack-compatible platforms.

Project Haystack:

- [https://project-haystack.org/](https://project-haystack.org/)

## Included nodes

- `haystack-server`: config node for URL, project path, credentials, and token caching
- `haystack-request`: generic Haystack op runner
- `haystack-read`: convenience node for `read`
- `haystack-hisread`: convenience node for `hisRead`
- `haystack-eval`: convenience node for `eval`
- `haystack-point-write`: convenience node for `pointWrite`

## Install for local development

```bash
npm install
```

From your Node-RED user directory:

```bash
npm install /path/to/node-red-contrib-haystack
```

For npm after publish:

```bash
npm install @automatikas/node-red-contrib-haystack
```

## Publish

Publish the package to npm as a public scoped package:

```bash
npm publish --access public
```

After npm publish, submit it to the Node-RED Flow Library:

- [https://flows.nodered.org/add/node](https://flows.nodered.org/add/node)

## Example Flow

A sanitized importable example flow is included at:

- [examples/demo-flow.json](C:/Users/AndriusJasiulionis/Dropbox/Darbas/Andrius/GitHub/node-red-contrib-haystack/examples/demo-flow.json)

Before using it, replace the placeholder refs with values from your own server:

- `@POINT_REF`
- `@EQUIP_REF`
- `@WRITABLE_POINT_REF`

The example flow does not include usernames or passwords. Configure credentials in the `haystack-server` config node after import.

## Config node

`haystack-server` stores:

- base URL, for example `http://127.0.0.1:8080`
- project path, for example `/api/{projectName}`
- username
- password

The runtime authenticates lazily on the first request and caches the returned auth token.

### Base URL and Project Path

The server config intentionally separates:

- `Base URL`: the server root, for example `http://127.0.0.1:8080`
- `Project Path`: the Haystack HTTP API path under that server, following the Project Haystack convention `/api/{projectName}`

For Haxall, the default project is commonly `sys`, so the usual API path is:

```text
/api/sys
```

That means a typical Haxall server config is:

- `Base URL = http://host:port`
- `Project Path = /api/sys`

Other Project Haystack servers may expose a different project name or API path, so this value should stay configurable instead of being hard-coded for one platform.

## Generic request node

`haystack-request` accepts values from the editor or from `msg`:

- `msg.haystack.op`
- `msg.method`
- `msg.haystack.method`
- `msg.format`
- `msg.haystack.format`
- `msg.outputMode`
- `msg.haystack.outputMode`
- `msg.headers`
- `msg.payload`
- `msg.rawBody`

The node returns:

- `msg.payload`: response body
- `msg.statusCode`
- `msg.headers`

The editor provides a dropdown for common Haystack ops. You can override the configured value with `msg.haystack.op`. In `Auto` method mode, `eval`, `hisRead`, and `pointWrite` use `POST`.

Use the `ops` operation to inspect which operations your server exposes. Many Haystack servers include additional vendor- or project-specific ops beyond the common Project Haystack set, so `Custom...` remains important.

One Haystack wire format is selected for the response:

- `zinc`
- `json`
- `trio`

Return modes follow the Node-RED `http request` pattern:

- `a UTF-8 string`
- `a parsed JSON object`

When Return is set to `a parsed JSON object`, JSON responses are parsed into objects and returned in `msg.payload`. Zinc and Trio remain UTF-8 strings, with the original text also available as `msg.payloadRaw`.

Generated request bodies use Zinc by default. The main exception is `eval`, which can generate JSON request bodies when JSON format is selected.

Default `Accept` and `Content-Type` headers are inferred from the selected format. For custom headers, use `msg.headers`, following the same pattern as the built-in HTTP Request node.
For example, if `Format` is `JSON`, the node sends `application/json; charset=utf-8` and expects `application/json` unless you explicitly override with `msg.headers`.

For `eval`, you can provide either:

- `msg.haystack.expr = "readAll(point).limit(5)"`
- or `msg.payload = "readAll(point).limit(5)"`

and the request node will build the Zinc or JSON body automatically unless you explicitly send `msg.rawBody`.

The preferred dynamic input shape is a nested object such as:

```json
{
  "haystack": {
    "op": "eval",
    "expr": "readAll(point).limit(5)"
  }
}
```

Flat fields such as `msg.id` or `msg.expr` are still accepted as a temporary compatibility fallback where supported, but op selection now uses `msg.haystack.op`.

Examples:

```json
{
  "haystack": {
    "op": "read",
    "query": {
      "filter": "point and temp"
    }
  }
}
```

```json
{
  "haystack": {
    "op": "hisRead",
    "id": "@somePointRef",
    "range": "today",
    "format": "trio",
    "outputMode": "string"
  }
}
```

```json
{
  "haystack": {
    "op": "eval",
    "expr": "readAll(point).limit(5)"
  }
}
```

```json
{
  "haystack": {
    "op": "read",
    "id": "@someRecordRef",
    "format": "json",
    "outputMode": "object"
  }
}
```

## Convenience nodes

### `haystack-eval`

Accepts:

- `msg.haystack.expr`
- `msg.haystack.format`
- `msg.haystack.outputMode`

Sends a POST to the `eval` op. `msg.haystack.expr` is used when the editor field is left empty.
`haystack-eval` supports Zinc, JSON, and Trio response format selection, and it can return JSON as a parsed object.

### `haystack-read`

Accepts either:

- `msg.haystack.filter`
- `msg.haystack.id`
- `msg.haystack.format`
- `msg.haystack.outputMode`

If `msg.haystack.filter` is provided it will be sent as a query string. Otherwise `msg.haystack.id` is sent as a Zinc POST body so the `id` is typed as a Haystack Ref. You may also configure a default id in the editor.
If the editor field is set, it wins; `msg.haystack.filter` or `msg.haystack.id` only fill in blank fields.
`haystack-read` supports Zinc, JSON, and Trio response format selection.
Generated request bodies still use Zinc unless you explicitly provide `msg.rawBody`.

Examples:

```json
{
  "haystack": {
    "filter": "point and temp and equipRef==@someEquipRef"
  }
}
```

```json
{
  "haystack": {
    "id": "@someRecordRef"
  }
}
```

### `haystack-hisread`

Accepts:

- `msg.haystack.id`
- `msg.haystack.range`
- `msg.haystack.format`
- `msg.haystack.outputMode`

By default the node sends a single-point `hisRead` request using query parameters with `id` as a Ref and `range` as a Haystack string. If you explicitly provide `msg.rawBody`, it sends that body as a POST request instead. Editor values win; `msg.haystack.id` and `msg.haystack.range` only fill in blank fields.
`haystack-hisread` supports Zinc, JSON, and Trio response format selection.

### `haystack-point-write`

Accepts:

- `msg.haystack.id`
- `msg.haystack.action`
- `msg.haystack.resultMode`
- `msg.haystack.format`
- `msg.haystack.outputMode`
- `msg.haystack.level`
- `msg.haystack.value`
- `msg.haystack.who`
- `msg.haystack.duration`

Sends a Zinc body to the `pointWrite` op.
Supported actions are `write`, `manualAuto`, and `emergencyAuto`.
`manualAuto` clears level `8`, and `emergencyAuto` clears level `1`.
Supported result modes are `array` and `ack`.
`array` returns the updated point write array, and `ack` returns the raw write acknowledgement.
Return modes follow the same pattern as the generic request node:

- `a UTF-8 string`
- `a parsed JSON object`

Parsed JSON output requires the server response to actually be JSON.
The original write acknowledgement is kept in `msg.pointWriteAck`.
The level selector offers levels `1` through `17`, with `1` labeled Emergency, `8` labeled Manual, and `17` labeled Default.
Editor values win; `msg.haystack.id`, `msg.haystack.action`, `msg.haystack.resultMode`, `msg.haystack.outputMode`, `msg.haystack.level`, `msg.haystack.value`, `msg.haystack.who`, and `msg.haystack.duration` only fill in blank fields.
Generated request bodies still use Zinc unless you explicitly provide `msg.rawBody`.

## Notes

- `eval` is implemented as `POST`, matching validated Haxall behavior.
- The package currently returns raw response text instead of parsing Zinc.
- Query/body conventions vary by server and op, so the generic node stays intentionally low-level.

## Validation Notes

Validated during testing:

- `about` works against Haxall and SkyFoundry/BRAID
- `ops` works and is the best discovery starting point for server capabilities
- `nav` works, but returned tags vary by server and vendor implementation
- `read` works by filter and by id
- `eval` works with Zinc request bodies and supports JSON response parsing where the server returns JSON
- `pointWrite` works for write and auto/release workflows
- HTTPS works with a valid FQDN and trusted CA certificate

Current format rule:

- generated request bodies use Zinc by default
- the main exception is `eval`, which can generate JSON request bodies when JSON format is selected
- `msg.rawBody` bypasses generated request logic and is fully user-controlled

Current server-specific findings:

- `formats` may be available on some servers but returned `404` on the tested Haxall target
- watch/session-style ops such as `watchSub`, `watchPoll`, and `watchUnsub` are not yet validated across servers
- `hisWrite` is not included yet; it needs dedicated validation and request-side guardrails similar to `pointWrite`
- use the `ops` operation to confirm what a specific server exposes before depending on optional or vendor-specific ops

## Project Haystack References

The official Project Haystack operation docs are useful background for the node behaviors in this package:

- [Project Haystack Ops](https://project-haystack.org/doc/docHaystack/Ops)
- [Project Haystack HTTP API](https://project-haystack.org/doc/docHaystack/HttpApi)

The node help and README in this repo paraphrase those docs for practical Node-RED usage. For the exact op definitions, request grids, and response grids, refer back to the official Project Haystack documentation.
