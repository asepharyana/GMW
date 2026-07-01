'use strict';

const { setInterval } = require('node:timers');
const { Collection } = require('@discordjs/collection');
const makeFetchCookie = require('fetch-cookie');
const { CookieJar } = require('tough-cookie');
const {
  buildConnector,
  Client: UndiciClient,
  ProxyAgent,
  fetch: fetchOriginal,
} = require('undici');
const APIRequest = require('./APIRequest');
const routeBuilder = require('./APIRouter');
const RequestHandler = require('./RequestHandler');
const { Error } = require('../errors');
const { ciphers, Endpoints } = require('../util/Constants');
const Util = require('../util/Util');

class RESTManager {
  constructor(client) {
    this.client = client;
    this.handlers = new Collection();
    this.versioned = true;
    this.globalLimit =
      client.options.restGlobalRateLimit > 0
        ? client.options.restGlobalRateLimit
        : Infinity;
    this.globalRemaining = this.globalLimit;
    this.globalReset = null;
    this.globalDelay = null;
    this.cookieJar = new CookieJar();
    this.fetch = makeFetchCookie.default(fetchOriginal, this.cookieJar);
    this.dispatcher = null;
    this.superPropertiesSource = null;
    this.superPropertiesHeader = null;
    if (client.options.restSweepInterval > 0) {
      this.sweepInterval = setInterval(() => {
        this.handlers.sweep((handler) => handler._inactive);
      }, client.options.restSweepInterval * 1_000).unref();
    }
  }

  get api() {
    return routeBuilder(this);
  }

  getAuth() {
    const token = this.client.token ?? this.client.accessToken;
    if (token) return token?.replace(/Bot /g, '');
    throw new Error('TOKEN_MISSING');
  }

  get cdn() {
    return Endpoints.CDN(this.client.options.http.cdn);
  }

  getDispatcher() {
    if (this.dispatcher) return this.dispatcher;

    const proxy = Util.checkUndiciProxyAgent(this.client.options.http.agent);
    if (proxy) {
      this.dispatcher = new ProxyAgent({
        ...proxy,
        ciphers: ciphers.join(':'),
      });
    } else {
      this.dispatcher = new UndiciClient('https://discord.com', {
        connect: buildConnector({ ciphers: ciphers.join(':') }),
      });
    }

    return this.dispatcher;
  }

  getSuperPropertiesHeader() {
    const source = JSON.stringify(this.client.options.ws.properties);
    if (source !== this.superPropertiesSource) {
      this.superPropertiesSource = source;
      this.superPropertiesHeader = Buffer.from(source, 'ascii').toString('base64');
    }
    return this.superPropertiesHeader;
  }

  request(method, url, options = {}) {
    const apiRequest = new APIRequest(this, method, url, options);
    let handler = this.handlers.get(apiRequest.route);

    if (!handler) {
      handler = new RequestHandler(this);
      this.handlers.set(apiRequest.route, handler);
    }

    return handler.push(apiRequest);
  }

  get endpoint() {
    return this.client.options.http.api;
  }

  set endpoint(endpoint) {
    this.client.options.http.api = endpoint;
  }
}

module.exports = RESTManager;
