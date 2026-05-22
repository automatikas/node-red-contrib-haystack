"use strict";

const HaystackClient = require("../lib/haystack-client");

function applyStatus(node, status) {
  node.status(status);
}

function defaultMethodForOp(op) {
  switch (String(op || "").trim()) {
    case "eval":
    case "pointWrite":
      return "POST";
    case "hisRead":
      return "GET";
    default:
      return "GET";
  }
}

function defaultContentTypeForOp(op) {
  switch (String(op || "").trim()) {
    case "eval":
    case "hisRead":
    case "hisWrite":
    case "pointWrite":
      return HaystackClient.contentTypeForFormat("zinc");
    default:
      return "";
  }
}

function defaultAcceptForOp(op) {
  switch (String(op || "").trim()) {
    case "eval":
    case "hisRead":
    case "hisWrite":
    case "pointWrite":
    case "read":
    case "nav":
    case "about":
    case "ops":
    case "formats":
      return HaystackClient.acceptForFormat("zinc");
    default:
      return HaystackClient.acceptForFormat("zinc");
  }
}

function requestFormatForOp(op, format) {
  const normalizedOp = String(op || "").trim();
  const normalizedFormat = String(format || "zinc").trim().toLowerCase();

  if (normalizedOp === "eval") {
    return normalizedFormat === "json" ? "json" : "zinc";
  }

  if (normalizedOp === "hisRead" || normalizedOp === "pointWrite" || normalizedOp === "read") {
    return "zinc";
  }

  return normalizedFormat === "trio" ? "zinc" : normalizedFormat;
}

function buildRequestBody(op, msg, fallbackPayload, requestFormat) {
  const haystack = msg.haystack || {};

  if (msg.rawBody !== undefined) {
    return msg.rawBody;
  }

  if (op === "eval") {
    const expr = haystack.expr !== undefined ? haystack.expr : msg.expr;
    if (expr !== undefined && expr !== null && expr !== "") {
      return requestFormat === "json" ? HaystackClient.buildEvalJsonBody(expr) : HaystackClient.buildEvalBody(expr);
    }
    if (typeof fallbackPayload === "string" && fallbackPayload.trim() && !fallbackPayload.includes("\n")) {
      return requestFormat === "json"
        ? HaystackClient.buildEvalJsonBody(fallbackPayload.trim())
        : HaystackClient.buildEvalBody(fallbackPayload.trim());
    }
  }

  const id = haystack.id !== undefined ? haystack.id : msg.id;
  const range = haystack.range !== undefined ? haystack.range : msg.range;
  if (op === "hisRead" && id && range) {
    return HaystackClient.buildHisReadBody(id, range);
  }

  const level = haystack.level !== undefined ? haystack.level : msg.level;
  const value = haystack.value !== undefined ? haystack.value : msg.value;
  const who = haystack.who !== undefined ? haystack.who : msg.who;
  const duration = haystack.duration !== undefined ? haystack.duration : msg.duration;
  if (op === "pointWrite" && id && level !== undefined && value !== undefined) {
    return HaystackClient.buildPointWriteBody(id, level, value, who, duration);
  }

  return fallbackPayload;
}

function lowerCaseHeaderKeys(headers) {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const normalized = {};
  Object.entries(headers).forEach(([key, value]) => {
    normalized[String(key).toLowerCase()] = value;
  });
  return normalized;
}

module.exports = function (RED) {
  function HaystackRequestNode(config) {
    RED.nodes.createNode(this, config);

    this.server = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.op = config.op;
    this.opCustom = config.opCustom || "";
    this.method = config.method || "auto";
    this.format = config.format || "zinc";
    this.outputMode = config.outputMode || "string";

    this.on("input", async (msg, send, done) => {
      const node = this;
      send = send || function () { node.send.apply(node, arguments); };
      const haystack = msg.haystack || {};

      if (!node.server) {
        done(new Error("Missing haystack-server config node"));
        return;
      }

      const configuredOp = node.op === "__custom__" ? node.opCustom : node.op;
      const op = haystack.op || configuredOp;
      if (!op) {
        done(new Error("No Haystack op specified"));
        return;
      }

      const method = haystack.method || msg.method || (node.method === "auto" ? defaultMethodForOp(op) : node.method || defaultMethodForOp(op));
      const headers = lowerCaseHeaderKeys(msg.headers);
      const format = haystack.format || msg.format || node.format || "zinc";
      const requestFormat = requestFormatForOp(op, format);
      const outputMode = haystack.outputMode || msg.outputMode || node.outputMode || "string";
      const contentType = haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat) || defaultContentTypeForOp(op);
      const accept = haystack.accept || msg.accept || HaystackClient.acceptForFormat(format) || defaultAcceptForOp(op);

      const hasHisReadFields = op === "hisRead" && msg.rawBody === undefined && haystack.id !== undefined && haystack.range !== undefined;
      const query = hasHisReadFields
        ? { id: haystack.id, range: haystack.range }
        : (haystack.query || msg.query);

      if (contentType && headers["content-type"] === undefined) {
        headers["content-type"] = contentType;
      }
      if (accept && headers["accept"] === undefined) {
        headers.accept = accept;
      }
      if (method === "GET") {
        delete headers["content-type"];
      }

      try {
        applyStatus(node, { fill: "blue", shape: "dot", text: `${op}...` });

        const client = node.server.getClient();
        const response = await client.request(op, {
          method,
          headers,
          accept,
          query,
          body: buildRequestBody(op, msg, msg.payload, requestFormat)
        });
        const transformed = HaystackClient.transformResponse(response, outputMode);

        node.server.setAuthToken(client.authToken);

        msg.statusCode = transformed.statusCode;
        msg.headers = transformed.headers;
        msg.payload = transformed.payload;
        msg.payloadRaw = transformed.payloadRaw;
        msg.haystackResponse = {
          wireFormat: transformed.wireFormat,
          parsed: transformed.parsed === true
        };

        applyStatus(node, { fill: "green", shape: "dot", text: `${op} ${transformed.statusCode}` });
        send(msg);
        done();
      } catch (error) {
        applyStatus(node, { fill: "red", shape: "ring", text: "error" });
        done(error);
      }
    });
  }

  RED.nodes.registerType("haystack-request", HaystackRequestNode);
};
