"use strict";

const HaystackClient = require("../lib/haystack-client");

module.exports = function (RED) {
  function HaystackServerNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.projectPath = config.projectPath;
    this.requestTimeout = Number.parseInt(config.requestTimeout, 10) || 30000;
    this.client = null;
  }

  HaystackServerNode.prototype.getClient = function () {
    const credentials = this.credentials || {};

    if (
      !this.client ||
      this.client.baseUrl !== String(this.baseUrl || "").replace(/\/+$/g, "") ||
      this.client.projectPath !== (String(this.projectPath || "/api/sys").startsWith("/") ? String(this.projectPath || "/api/sys").replace(/\/+$/g, "") : `/${String(this.projectPath || "/api/sys").replace(/\/+$/g, "")}`) ||
      this.client.username !== credentials.username ||
      this.client.password !== credentials.password
    ) {
      this.client = new HaystackClient({
        baseUrl: this.baseUrl,
        projectPath: this.projectPath,
        username: credentials.username,
        password: credentials.password,
        authToken: credentials.authToken,
        requestTimeout: this.requestTimeout
      });
    }

    return this.client;
  };

  HaystackServerNode.prototype.setAuthToken = function (token) {
    this.credentials = this.credentials || {};
    this.credentials.authToken = token || "";
    if (this.client) {
      this.client.setAuthToken(token);
    }
  };

  RED.nodes.registerType("haystack-server", HaystackServerNode, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" },
      authToken: { type: "password" }
    }
  });
};
