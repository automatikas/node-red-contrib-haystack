"use strict";

const HaystackClient = require("../lib/haystack-client");

module.exports = function (RED) {
  function HaystackEvalNode(config) {
    RED.nodes.createNode(this, config);

    this.server = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.expr = config.expr || "";
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

      const expr = node.expr || haystack.expr || msg.expr;
      const format = haystack.format || msg.format || node.format || "zinc";
      const requestFormat = format === "trio" ? "zinc" : format;
      const outputMode = haystack.outputMode || msg.outputMode || node.outputMode || "string";
      if (!expr) {
        done(new Error("No Axon expression provided"));
        return;
      }

      try {
        node.status({ fill: "blue", shape: "dot", text: "eval..." });
        const client = node.server.getClient();
        const response = await client.request("eval", {
          method: "POST",
          accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
          headers: {
            ...(msg.headers || {}),
            "Content-Type": haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat)
          },
          body: msg.rawBody !== undefined
            ? msg.rawBody
            : requestFormat === "json"
              ? HaystackClient.buildEvalJsonBody(expr)
              : HaystackClient.buildEvalBody(expr)
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
        node.status({ fill: "green", shape: "dot", text: `eval ${transformed.statusCode}` });
        send(msg);
        done();
      } catch (error) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(error);
      }
    });
  }

  RED.nodes.registerType("haystack-eval", HaystackEvalNode);
};
