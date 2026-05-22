"use strict";

const HaystackClient = require("../lib/haystack-client");

module.exports = function (RED) {
  function HaystackHisReadNode(config) {
    RED.nodes.createNode(this, config);

    this.server = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.recordId = config.recordId || config.id || "";
    this.range = config.range || "today";
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

      const id = node.recordId || haystack.id || msg.id;
      const range = node.range || haystack.range || msg.range;
      const format = node.format || haystack.format || msg.format || "zinc";
      const requestFormat = format === "json" || format === "trio" ? "zinc" : format;
      const outputMode = node.outputMode || haystack.outputMode || msg.outputMode || "string";
      if (!id || !range) {
        done(new Error("hisRead requires both id and range"));
        return;
      }

      try {
        node.status({ fill: "blue", shape: "dot", text: "hisRead..." });
        const client = node.server.getClient();
        const response = await client.request(
          "hisRead",
          msg.rawBody !== undefined
            ? {
                method: "POST",
                accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
                headers: {
                  ...(msg.headers || {}),
                  "Content-Type": haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat)
                },
                body: msg.rawBody
              }
            : {
                method: "GET",
                accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
                headers: msg.headers,
                query: { id, range }
              }
        );
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
        node.status({ fill: "green", shape: "dot", text: `hisRead ${transformed.statusCode}` });
        send(msg);
        done();
      } catch (error) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(error);
      }
    });
  }

  RED.nodes.registerType("haystack-hisread", HaystackHisReadNode);
};
