"use strict";

const HaystackClient = require("../lib/haystack-client");

module.exports = function (RED) {
  function HaystackPointWriteNode(config) {
    RED.nodes.createNode(this, config);

    this.server = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.recordId = config.recordId || config.id || "";
    this.action = config.action || "write";
    this.resultMode = config.resultMode || "array";
    this.format = config.format || "zinc";
    this.outputMode = config.outputMode || "string";
    this.level = config.level || "16";
    this.value = config.value || "";
    this.who = config.who || "";
    this.duration = config.duration || "";

    this.on("input", async (msg, send, done) => {
      const node = this;
      send = send || function () { node.send.apply(node, arguments); };
      const haystack = msg.haystack || {};

      if (!node.server) {
        done(new Error("Missing haystack-server config node"));
        return;
      }

      const id = node.recordId || haystack.id || msg.id;
      const action = node.action || haystack.action || msg.action || "write";
      const resultMode = node.resultMode || haystack.resultMode || msg.resultMode || "array";
      const format = node.format || haystack.format || msg.format || "zinc";
      const requestFormat = format === "json" || format === "trio" ? "zinc" : format;
      const outputMode = node.outputMode || haystack.outputMode || msg.outputMode || "string";
      const configuredLevel = node.level || haystack.level || msg.level;
      const level = action === "manualAuto" ? "8" : action === "emergencyAuto" ? "1" : configuredLevel;
      const value = node.value !== "" ? node.value : (haystack.value !== undefined ? haystack.value : msg.value);
      const who = node.who !== "" ? node.who : (haystack.who !== undefined ? haystack.who : msg.who);
      const duration = node.duration !== "" ? node.duration : (haystack.duration !== undefined ? haystack.duration : msg.duration);

      if (!id) {
        done(new Error("pointWrite requires id"));
        return;
      }

      if (!level) {
        done(new Error("pointWrite action requires level"));
        return;
      }

      if (action === "write" && (value === undefined || value === "")) {
        done(new Error("pointWrite write action requires value"));
        return;
      }

      try {
        node.status({ fill: "blue", shape: "dot", text: `pointWrite ${action}...` });
        const client = node.server.getClient();
        let body;
        if (msg.rawBody !== undefined) {
          body = msg.rawBody;
        } else if (action === "manualAuto" || action === "emergencyAuto") {
          body = HaystackClient.buildPointWriteBody(id, level, null, who, duration);
        } else {
          body = HaystackClient.buildPointWriteBody(id, level, value, who, duration);
        }

        const response = await client.request("pointWrite", {
          method: "POST",
          accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
          headers: {
            ...(msg.headers || {}),
            "Content-Type": haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat)
          },
          body
        });

        let finalResponse = response;
        const shouldReadArray = msg.rawBody === undefined && resultMode === "array";
        if (shouldReadArray) {
          const readArrayResponse = await client.request("pointWrite", {
            method: "POST",
            accept: haystack.accept || msg.accept || HaystackClient.acceptForFormat(format),
            headers: {
              ...(msg.headers || {}),
              "Content-Type": haystack.contentType || msg.contentType || HaystackClient.contentTypeForFormat(requestFormat)
            },
            body: HaystackClient.buildPointWriteBody(id, "", null)
          });
          finalResponse = readArrayResponse;
          msg.pointWriteAck = {
            statusCode: response.statusCode,
            headers: response.headers,
            payload: response.payload
          };
        } else {
          msg.pointWriteAck = {
            statusCode: response.statusCode,
            headers: response.headers,
            payload: response.payload
          };
        }

        const transformed = HaystackClient.transformResponse(finalResponse, outputMode);

        node.server.setAuthToken(client.authToken);
        msg.statusCode = transformed.statusCode;
        msg.headers = transformed.headers;
        msg.payload = transformed.payload;
        msg.payloadRaw = transformed.payloadRaw;
        msg.haystackResponse = {
          wireFormat: transformed.wireFormat,
          parsed: transformed.parsed === true
        };
        node.status({ fill: "green", shape: "dot", text: `pointWrite ${action} ${transformed.statusCode}` });
        send(msg);
        done();
      } catch (error) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(error);
      }
    });
  }

  RED.nodes.registerType("haystack-point-write", HaystackPointWriteNode);
};
