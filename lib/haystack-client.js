"use strict";

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  return Buffer.from(normalized, "base64");
}

function digestName(hash) {
  return (hash || "SHA-256").toLowerCase().replace(/-/g, "");
}

function digestLength(name) {
  return name === "sha512" ? 64 : 32;
}

function hmac(name, key, data) {
  return crypto.createHmac(name, key).update(data).digest();
}

function hash(name, data) {
  return crypto.createHash(name).update(data).digest();
}

function xorBuffers(a, b) {
  const output = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) {
    output[i] = a[i] ^ b[i];
  }
  return output;
}

function parseKeyValueHeader(header) {
  const firstSpace = header.indexOf(" ");
  const scheme = firstSpace === -1 ? header.trim() : header.slice(0, firstSpace).trim();
  const rest = firstSpace === -1 ? "" : header.slice(firstSpace + 1).trim();
  const params = {};

  if (rest) {
    rest.split(",").forEach((part) => {
      const index = part.indexOf("=");
      if (index > -1) {
        params[part.slice(0, index).trim()] = part.slice(index + 1).trim();
      }
    });
  }

  return {
    scheme: scheme.toUpperCase(),
    params
  };
}

function parseScramMessage(message) {
  const data = {};
  message.split(",").forEach((part) => {
    const index = part.indexOf("=");
    if (index > -1) {
      data[part.slice(0, index)] = part.slice(index + 1);
    }
  });
  return data;
}

function escapeZincString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"");
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/g, "");
}

function normalizeProjectPath(projectPath) {
  const value = String(projectPath || "/api/sys").trim();
  if (!value) return "/api/sys";
  return value.startsWith("/") ? value.replace(/\/+$/g, "") : `/${value.replace(/\/+$/g, "")}`;
}

function normalizeWireFormat(format) {
  switch (String(format || "").trim().toLowerCase()) {
    case "json":
    case "application/json":
      return "json";
    case "trio":
    case "text/trio":
      return "trio";
    case "zinc":
    case "text/zinc":
    default:
      return "zinc";
  }
}

class HaystackClient {
  constructor(options) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.projectPath = normalizeProjectPath(options.projectPath);
    this.username = options.username;
    this.password = options.password;
    this.authToken = options.authToken || null;
    this.requestTimeout = options.requestTimeout || 30000;
  }

  setAuthToken(token) {
    this.authToken = token || null;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  aboutUrl() {
    return `${this.baseUrl}${this.projectPath}/about`;
  }

  opUrl(opName) {
    return `${this.baseUrl}${this.projectPath}/${opName}`;
  }

  async login() {
    if (!this.baseUrl || !this.username || !this.password) {
      throw new Error("Haystack server config requires base URL, username, and password");
    }

    const helloResponse = await this.httpRequest({
      method: "GET",
      url: this.aboutUrl(),
      headers: {
        Authorization: `HELLO username=${toBase64Url(Buffer.from(this.username, "utf8"))}`
      }
    });

    if (helloResponse.statusCode !== 401) {
      throw this.buildError("Expected 401 response for HELLO auth", helloResponse);
    }

    const authenticateHeader = helloResponse.headers["www-authenticate"];
    if (!authenticateHeader) {
      throw new Error("Missing WWW-Authenticate header during HELLO auth");
    }

    const challenge = parseKeyValueHeader(authenticateHeader);
    if (challenge.scheme !== "SCRAM") {
      throw new Error(`Unsupported auth scheme: ${challenge.scheme}`);
    }

    const algorithm = digestName(challenge.params.hash || "SHA-256");
    const handshakeToken = challenge.params.handshakeToken;
    const clientNonce = toBase64Url(crypto.randomBytes(18));
    const clientFirstBare = `n=${this.username},r=${clientNonce}`;
    const clientFirst = `n,,${clientFirstBare}`;

    const stepOne = await this.httpRequest({
      method: "GET",
      url: this.aboutUrl(),
      headers: {
        Authorization: `SCRAM handshakeToken=${handshakeToken}, data=${toBase64Url(Buffer.from(clientFirst, "utf8"))}`
      }
    });

    if (stepOne.statusCode !== 401) {
      throw this.buildError("Expected 401 response for SCRAM step 1", stepOne);
    }

    const serverFirstHeader = stepOne.headers["www-authenticate"];
    if (!serverFirstHeader) {
      throw new Error("Missing WWW-Authenticate header during SCRAM step 1");
    }

    const serverFirstChallenge = parseKeyValueHeader(serverFirstHeader);
    const serverFirstRaw = fromBase64Url(serverFirstChallenge.params.data || "").toString("utf8");
    const serverFirst = parseScramMessage(serverFirstRaw);
    const salt = Buffer.from(serverFirst.s, "base64");
    const iterations = Number.parseInt(serverFirst.i, 10);
    const saltedPassword = crypto.pbkdf2Sync(
      Buffer.from(this.password, "utf8"),
      salt,
      iterations,
      digestLength(algorithm),
      algorithm
    );
    const clientKey = hmac(algorithm, saltedPassword, "Client Key");
    const storedKey = hash(algorithm, clientKey);
    const clientFinalWithoutProof = `c=biws,r=${serverFirst.r}`;
    const authMessage = `${clientFirstBare},${serverFirstRaw},${clientFinalWithoutProof}`;
    const clientSignature = hmac(algorithm, storedKey, authMessage);
    const clientProof = xorBuffers(clientKey, clientSignature).toString("base64");
    const serverKey = hmac(algorithm, saltedPassword, "Server Key");
    const expectedServerSignature = hmac(algorithm, serverKey, authMessage).toString("base64");
    const clientFinal = `${clientFinalWithoutProof},p=${clientProof}`;

    const stepTwo = await this.httpRequest({
      method: "GET",
      url: this.aboutUrl(),
      headers: {
        Authorization: `SCRAM handshakeToken=${serverFirstChallenge.params.handshakeToken}, data=${toBase64Url(Buffer.from(clientFinal, "utf8"))}`
      }
    });

    if (stepTwo.statusCode !== 200) {
      throw this.buildError("Expected 200 response for SCRAM step 2", stepTwo);
    }

    const authInfoHeader = stepTwo.headers["authentication-info"];
    if (!authInfoHeader) {
      throw new Error("Missing Authentication-Info header after SCRAM auth");
    }

    const authInfo = parseKeyValueHeader(`AUTH ${authInfoHeader}`);
    if (!authInfo.params.authToken) {
      throw new Error("Authentication-Info did not include authToken");
    }

    if (authInfo.params.data) {
      const serverFinalRaw = fromBase64Url(authInfo.params.data).toString("utf8");
      const serverFinal = parseScramMessage(serverFinalRaw);
      if (serverFinal.v && serverFinal.v !== expectedServerSignature) {
        throw new Error("Server SCRAM signature verification failed");
      }
    }

    this.authToken = authInfo.params.authToken;
    return this.authToken;
  }

  async request(opName, options = {}) {
    if (!this.authToken) {
      await this.login();
    }

    const response = await this.sendAuthorizedRequest(opName, options, this.authToken);

    if (response.statusCode === 401) {
      this.clearAuthToken();
      await this.login();
      return this.sendAuthorizedRequest(opName, options, this.authToken);
    }

    return response;
  }

  async sendAuthorizedRequest(opName, options, token) {
    const headers = {
      Accept: options.accept || "text/zinc",
      ...(options.headers || {}),
      Authorization: `BEARER authToken=${token}`
    };

    return this.httpRequest({
      method: options.method || "GET",
      url: this.opUrl(opName),
      headers,
      query: options.query,
      body: options.body
    });
  }

  async httpRequest(options) {
    const target = new URL(options.url);
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          target.searchParams.set(key, String(value));
        }
      });
    }

    const transport = target.protocol === "https:" ? https : http;
    const body = options.body === undefined || options.body === null ? null : String(options.body);
    const headers = {
      ...(options.headers || {})
    };

    if (body !== null && headers["Content-Length"] === undefined && headers["content-length"] === undefined) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    return new Promise((resolve, reject) => {
      const request = transport.request(
        target,
        {
          method: options.method || "GET",
          headers,
          timeout: this.requestTimeout
        },
        (response) => {
          let payload = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            payload += chunk;
          });
          response.on("end", () => {
            const loweredHeaders = {};
            Object.entries(response.headers || {}).forEach(([key, value]) => {
              loweredHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
            });
            resolve({
              statusCode: response.statusCode,
              headers: loweredHeaders,
              payload
            });
          });
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error(`Request timed out after ${this.requestTimeout}ms`));
      });
      request.on("error", reject);

      if (body !== null) {
        request.write(body);
      }

      request.end();
    });
  }

  buildError(message, response) {
    const error = new Error(`${message}: HTTP ${response.statusCode}`);
    error.response = response;
    return error;
  }

  static buildEvalBody(expr) {
    return `ver:"3.0"\nexpr\n"${escapeZincString(expr)}"`;
  }

  static buildEvalJsonBody(expr) {
    return JSON.stringify({
      _kind: "grid",
      meta: { ver: "3.0" },
      cols: [{ name: "expr" }],
      rows: [{ expr: String(expr) }]
    });
  }

  static buildHisReadBody(id, range) {
    return `ver:"3.0"\nid,range\n${id},"${escapeZincString(range)}"`;
  }

  static buildPointWriteBody(id, level, value, who, duration) {
    if (level === undefined || level === null || level === "") {
      return `ver:"3.0"\nid\n${id}`;
    }

    const columns = ["id", "level", "val"];
    const normalizedValue = value === null ? "N" : value;
    const values = [id, level, normalizedValue];

    if (who !== undefined && who !== null && who !== "") {
      columns.push("who");
      values.push(`"${escapeZincString(who)}"`);
    }

    if (duration !== undefined && duration !== null && duration !== "") {
      columns.push("duration");
      values.push(duration);
    }

    return `ver:"3.0"\n${columns.join(",")}\n${values.join(",")}`;
  }

  static acceptForFormat(format) {
    switch (normalizeWireFormat(format)) {
      case "json":
        return "application/json";
      case "trio":
        return "text/trio";
      case "zinc":
      default:
        return "text/zinc";
    }
  }

  static contentTypeForFormat(format) {
    switch (normalizeWireFormat(format)) {
      case "json":
        return "application/json; charset=utf-8";
      case "trio":
        return "text/trio; charset=utf-8";
      case "zinc":
      default:
        return "text/zinc; charset=utf-8";
    }
  }

  static responseWireFormat(headers) {
    const contentType = String((headers || {})["content-type"] || "").toLowerCase();
    if (contentType.includes("application/json")) {
      return "json";
    }
    if (contentType.includes("text/trio")) {
      return "trio";
    }
    return "zinc";
  }

  static transformResponse(response, outputMode) {
    const mode = String(outputMode || "string").toLowerCase();
    const wireFormat = HaystackClient.responseWireFormat(response.headers);
    const transformed = {
      ...response,
      wireFormat,
      payloadRaw: response.payload
    };

    if (mode === "string") {
      transformed.parsed = false;
      return transformed;
    }

    if (mode === "object" && wireFormat === "json") {
      transformed.payload = response.payload ? JSON.parse(response.payload) : null;
      transformed.parsed = true;
      return transformed;
    }

    transformed.parsed = false;
    return transformed;
  }
}

module.exports = HaystackClient;
