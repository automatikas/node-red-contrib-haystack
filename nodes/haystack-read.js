"use strict";

const HaystackClient = require("../lib/haystack-client");

function buildReadByIdBody(ids) {
  const rows = Array.isArray(ids) ? ids : [ids];
  return `ver:"3.0"\nid\n${rows.join("\n")}`;
}

module.exports = function (RED) {
  function HaystackReadNode(config) {
    RED.nodes.createNode(this, config);

    this.server = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.filter = config.filter || "";
    this.recordId = config.recordId || config.id || "";
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

      const filter = node.filter || haystack.filter || msg.filter;
      const id = node.recordId || haystack.id || msg.id;
      const format = node.format || haystack.format || msg.format || "zinc";
      const requestFormat = format === "json" || format === "trio" ? "zinc" : format;
      const outputMode = node.outputMode || haystack.outputMode || msg.outputMode || "string";

      if (!filter && !id) {
        done(new Error("Provide either a read filter or an id"));
        return;
      }

      try {
        node.status({ fill: "blue", shape: "dot", text: "read..." });
        const client = node.server.getClient();
        const requestOptions = filter
          ? {
              method: "GET",
              accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
              headers: msg.headers,
              query: {
                filter,
                limit: haystack.limit !== undefined ? haystack.limit : msg.limit
              }
            }
          : {
              method: "POST",
              accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
              headers: {
                ...(msg.headers || {}),
                "Content-Type": haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat)
              },
              body: msg.rawBody !== undefined ? msg.rawBody : buildReadByIdBody(id)
            };

        const response = await client.request("read", requestOptions);
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
        node.status({ fill: "green", shape: "dot", text: `read ${transformed.statusCode}` });
        send(msg);
        done();
      } catch (error) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(error);
      }
    });
  }

  RED.nodes.registerType("haystack-read", HaystackReadNode);
};
