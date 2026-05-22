"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const HaystackClient = require("../lib/haystack-client");

test("acceptForFormat maps Haystack formats to HTTP Accept headers", () => {
  assert.equal(HaystackClient.acceptForFormat("zinc"), "text/zinc");
  assert.equal(HaystackClient.acceptForFormat("json"), "application/json");
  assert.equal(HaystackClient.acceptForFormat("trio"), "text/trio");
});

test("contentTypeForFormat maps Haystack formats to HTTP Content-Type headers", () => {
  assert.equal(HaystackClient.contentTypeForFormat("zinc"), "text/zinc; charset=utf-8");
  assert.equal(HaystackClient.contentTypeForFormat("json"), "application/json; charset=utf-8");
  assert.equal(HaystackClient.contentTypeForFormat("trio"), "text/trio; charset=utf-8");
});

test("buildEvalBody creates a Zinc grid for eval", () => {
  assert.equal(
    HaystackClient.buildEvalBody("readAll(point).limit(5)"),
    'ver:"3.0"\nexpr\n"readAll(point).limit(5)"'
  );
});

test("buildEvalJsonBody creates a Haystack JSON grid for eval", () => {
  assert.deepEqual(
    JSON.parse(HaystackClient.buildEvalJsonBody("readAll(point).limit(5)")),
    {
      _kind: "grid",
      meta: { ver: "3.0" },
      cols: [{ name: "expr" }],
      rows: [{ expr: "readAll(point).limit(5)" }]
    }
  );
});

test("buildHisReadBody encodes id and range as a Zinc grid", () => {
  assert.equal(
    HaystackClient.buildHisReadBody("@pointRef", "today"),
    'ver:"3.0"\nid,range\n@pointRef,"today"'
  );
});

test("buildPointWriteBody encodes point write values with optional who and duration", () => {
  assert.equal(
    HaystackClient.buildPointWriteBody("@pointRef", "16", "18", "node-red", "5min"),
    'ver:"3.0"\nid,level,val,who,duration\n@pointRef,16,18,"node-red",5min'
  );
});

test("buildPointWriteBody encodes null point writes as Zinc N", () => {
  assert.equal(
    HaystackClient.buildPointWriteBody("@pointRef", "8", null, "", ""),
    'ver:"3.0"\nid,level,val\n@pointRef,8,N'
  );
});

test("buildPointWriteBody reads point write array when level is blank", () => {
  assert.equal(
    HaystackClient.buildPointWriteBody("@pointRef", "", null),
    'ver:"3.0"\nid\n@pointRef'
  );
});

test("transformResponse parses JSON payloads in object mode", () => {
  const transformed = HaystackClient.transformResponse(
    {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      payload: '{"rows":[{"id":"@ref"}]}'
    },
    "object"
  );

  assert.equal(transformed.wireFormat, "json");
  assert.equal(transformed.parsed, true);
  assert.deepEqual(transformed.payload, { rows: [{ id: "@ref" }] });
  assert.equal(transformed.payloadRaw, '{"rows":[{"id":"@ref"}]}');
});

test("transformResponse leaves Zinc payloads as strings in object mode", () => {
  const transformed = HaystackClient.transformResponse(
    {
      statusCode: 200,
      headers: { "content-type": "text/zinc; charset=utf-8" },
      payload: 'ver:"3.0"\nempty'
    },
    "object"
  );

  assert.equal(transformed.wireFormat, "zinc");
  assert.equal(transformed.parsed, false);
  assert.equal(transformed.payload, 'ver:"3.0"\nempty');
});
