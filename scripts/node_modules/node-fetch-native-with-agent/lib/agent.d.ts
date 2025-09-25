import type * as http from "node:http";
import type * as https from "node:https";
import type * as undici from "undici";

export type AgentOptions = {
  /**
   * Reject unauthorized TLS certificates, default is `true`
   */
  rejectUnauthorized?: boolean;
};

export declare const createAgent: (
  uri?: string,
  opts?: AgentOptions,
) => {
  agent: http.Agent | https.Agent | undefined;
  dispatcher: undici.Dispatcher | undefined;
};

export declare const createFetch: (
  agentOptions?: AgentOptions,
) => typeof globalThis.fetch;

export declare const fetch: typeof globalThis.fetch;
