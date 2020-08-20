import { DocumentNode, GraphQLError } from 'graphql';
import { RequestAgent } from 'apollo-server-env';
import {
  Logger,
  GraphQLRequestContextDidResolveOperation,
  GraphQLRequestContextDidEncounterErrors,
} from 'apollo-server-types';
import {
  ApolloServerPluginUsageReportingOptions,
  VariableValueOptions,
  SendValuesBaseOptions,
  GenerateClientInfo,
} from './options';

/**
 * The type of the legacy `engine` option to `new ApolloServer`. Replaced by the `apollo`
 * argument and the options to various plugin functions.
 */
export interface EngineReportingOptions<TContext> {
  /**
   * API key for the service. Get this from
   * [Engine](https://engine.apollographql.com) by logging in and creating
   * a service. You may also specify this with the `ENGINE_API_KEY`
   * environment variable; the option takes precedence. __Required__.
   */
  apiKey?: string;
  /**
   * Specify the function for creating a signature for a query. See signature.ts
   * for details.
   */
  calculateSignature?: (ast: DocumentNode, operationName: string) => string;
  /**
   * How often to send reports to the Engine server. We'll also send reports
   * when the report gets big; see maxUncompressedReportSize.
   */
  reportIntervalMs?: number;
  /**
   * We send a report when the report size will become bigger than this size in
   * bytes (default: 4MB).  (This is a rough limit --- we ignore the size of the
   * report header and some other top level bytes. We just add up the lengths of
   * the serialized traces and signatures.)
   */
  maxUncompressedReportSize?: number;
  /**
   * [DEPRECATED] this option was replaced by tracesEndpointUrl
   * The URL of the Engine report ingress server.
   */
  endpointUrl?: string;
  /**
   * The URL to the Apollo Graph Manager ingress endpoint.
   * (Previously, this was `endpointUrl`, which will be removed in AS3).
   */
  tracesEndpointUrl?: string;
  /**
   * If set, prints all reports as JSON when they are sent.
   */
  debugPrintReports?: boolean;
  /**
   * HTTP(s) agent to be used on the fetch call to apollo-engine metrics endpoint
   */
  requestAgent?: RequestAgent | false;
  /**
   * Reporting is retried with exponential backoff up to this many times
   * (including the original request). Defaults to 5.
   */
  maxAttempts?: number;
  /**
   * Minimum back-off for retries. Defaults to 100ms.
   */
  minimumRetryDelayMs?: number;
  /**
   * By default, errors that occur when sending trace reports to Engine servers
   * will be logged to standard error. Specify this function to process errors
   * in a different way.
   */
  reportErrorFunction?: (err: Error) => void;
  /**
   * By default, Apollo Server does not send the values of any GraphQL variables to Apollo's servers, because variable
   * values often contain the private data of your app's users. If you'd like variable values to be included in traces, set this option.
   * This option can take several forms:
   * - { none: true }: don't send any variable values (DEFAULT)
   * - { all: true}: send all variable values
   * - { transform: ... }: a custom function for modifying variable values. Keys added by the custom function will
   *    be removed, and keys removed will be added back with an empty value. For security reasons, if an error occurs within this function, all variable values will be replaced with `[PREDICATE_FUNCTION_ERROR]`.
   * - { exceptNames: ... }: a case-sensitive list of names of variables whose values should not be sent to Apollo servers
   * - { onlyNames: ... }: A case-sensitive list of names of variables whose values will be sent to Apollo servers
   *
   * Defaults to not sending any variable values if both this parameter and
   * the deprecated `privateVariables` are not set. The report will
   * indicate each private variable key whose value was redacted by { none: true } or { exceptNames: [...] }.
   *
   * TODO(helen): Add new flag to the trace details (and modify the protobuf message structure) to indicate the type of modification. Then, add the following description to the docs:
   * "The report will indicate that variable values were modified by a custom function, or will list all private variables redacted."
   * TODO(helen): LINK TO EXAMPLE FUNCTION? e.g. a function recursively search for keys to be blocklisted
   */
  sendVariableValues?: VariableValueOptions;
  /**
   * This option allows configuring the behavior of request tracing and
   * reporting to [Apollo Graph Manager](https://engine.apollographql.com/).
   *
   * By default, this is set to `true`, which results in *all* requests being
   * traced and reported. This behavior can be _disabled_ by setting this option
   * to `false`. Alternatively, it can be selectively enabled or disabled on a
   * per-request basis using a predicate function.
   *
   * When specified as a predicate function, the _return value_ of its
   * invocation (per request) will determine whether or not that request is
   * traced and reported. The predicate function will receive the request
   * context. If validation and parsing of the request succeeds the function will
   * receive the request context in the
   * [`GraphQLRequestContextDidResolveOperation`](https://www.apollographql.com/docs/apollo-server/integrations/plugins/#didresolveoperation)
   * phase, which permits tracing based on dynamic properties, e.g., HTTP
   * headers or the `operationName` (when available),
   * otherwise it will receive the request context in the  [`GraphQLRequestContextDidEncounterError`](https://www.apollographql.com/docs/apollo-server/integrations/plugins/#didencountererrors)
   * phase:
   *
   * **Example:**
   *
   * ```js
   * reportTiming(requestContext) {
   *   // Always trace `query HomeQuery { ... }`.
   *   if (requestContext.operationName === "HomeQuery") return true;
   *
   *   // Also trace if the "trace" header is set to "true".
   *   if (requestContext.request.http?.headers?.get("trace") === "true") {
   *     return true;
   *   }
   *
   *   // Otherwise, do not trace!
   *   return false;
   * },
   * ```
   *
   */
  reportTiming?: ReportTimingOptions<TContext>;
  /**
   * [DEPRECATED] Use sendVariableValues
   * Passing an array into privateVariables is equivalent to passing { exceptNames: array } into
   * sendVariableValues, and passing in `true` or `false` is equivalent to passing { none: true } or
   * { all: true }, respectively.
   *
   * An error will be thrown if both this deprecated option and its replacement, sendVariableValues are defined.
   */
  privateVariables?: Array<String> | boolean;
  /**
   * By default, Apollo Server does not send the list of HTTP headers and values to
   * Apollo's servers, to protect private data of your app's users. If you'd like this information included in traces,
   * set this option. This option can take several forms:
   *
   * - { none: true } to drop all HTTP request headers (DEFAULT)
   * - { all: true } to send the values of all HTTP request headers
   * - { exceptNames: Array<String> } A case-insensitive list of names of HTTP headers whose values should not be
   *     sent to Apollo servers
   * - { onlyNames: Array<String> }: A case-insensitive list of names of HTTP headers whose values will be sent to Apollo servers
   *
   * Defaults to not sending any request header names and values if both this parameter and
   * the deprecated `privateHeaders` are not set.
   * Unlike with sendVariableValues, names of dropped headers are not reported.
   * The headers 'authorization', 'cookie', and 'set-cookie' are never reported.
   */
  sendHeaders?: SendValuesBaseOptions;
  /**
   * [DEPRECATED] Use sendHeaders
   * Passing an array into privateHeaders is equivalent to passing { exceptNames: array } into sendHeaders, and
   * passing `true` or `false` is equivalent to passing in { none: true } and { all: true }, respectively.
   *
   * An error will be thrown if both this deprecated option and its replacement, sendHeaders are defined.
   */
  privateHeaders?: Array<String> | boolean;
  /**
   * For backwards compatibility only; specifying `new ApolloServer({engine: {handleSignals: false}})` is
   * equivalent to specifying `new ApolloServer({stopOnTerminationSignals: false})`.
   */
  handleSignals?: boolean;
  /**
   * Sends the trace report immediately. This options is useful for stateless environments
   */
  sendReportsImmediately?: boolean;
  /**
   * @deprecated Use `rewriteError` instead.
   * @default false
   *
   * To remove the error message from traces, set this to true.
   */
  maskErrorDetails?: boolean;
  /**
   * By default, all errors get reported to Engine servers. You can specify a
   * a filter function to exclude specific errors from being reported by
   * returning an explicit `null`, or you can mask certain details of the error
   * by modifying it and returning the modified error.
   */
  rewriteError?: (err: GraphQLError) => GraphQLError | null;
  /**
   * [DEPRECATED: use graphVariant] A human readable name to tag this variant of a schema (i.e. staging, EU)
   */
  schemaTag?: string;
  /**
   * A human readable name to refer to the variant of the graph for which metrics are reported
   */
  graphVariant?: string;
  /**
   * Creates the client information for operation traces.
   */
  generateClientInfo?: GenerateClientInfo<TContext>;

  /**
   * Enable schema reporting from this server with Apollo Graph Manager.
   *
   * The use of this option avoids the need to register schemas manually within
   * CI deployment pipelines using `apollo schema:push` by periodically
   * reporting this server's schema (when changes are detected) along with
   * additional details about its runtime environment to Apollo Graph Manager.
   *
   * See [our _preview
   * documentation_](https://github.com/apollographql/apollo-schema-reporting-preview-docs)
   * for more information.
   */
  reportSchema?: boolean;

  /**
   * Override the reported schema that is reported to AGM.
   * This schema does not go through any normalizations and the string is directly sent to Apollo Graph Manager.
   * This would be useful for comments or other ordering and whitespace changes that get stripped when generating a `GraphQLSchema`
   */
  overrideReportedSchema?: string;

  /**
   * The schema reporter waits before starting reporting.
   * By default, the report waits some random amount of time between 0 and 10 seconds.
   * A longer interval leads to more staggered starts which means it is less likely
   * multiple servers will get asked to upload the same schema.
   *
   * If this server runs in lambda or in other constrained environments it would be useful
   * to decrease the schema reporting max wait time to be less than default.
   *
   * This number will be the max for the range in ms that the schema reporter will
   * wait before starting to report.
   */
  schemaReportingInitialDelayMaxMs?: number;

  /**
   * The URL to use for reporting schemas.
   */
  schemaReportingUrl?: string;

  /**
   * A logger interface to be used for output and errors.  When not provided
   * it will default to the server's own `logger` implementation and use
   * `console` when that is not available.
   */
  logger?: Logger;

  /**
   * @deprecated use {@link reportSchema} instead
   */
  experimental_schemaReporting?: boolean;

  /**
   * @deprecated use {@link overrideReportedSchema} instead
   */
  experimental_overrideReportedSchema?: string;

  /**
   * @deprecated use {@link schemaReportingInitialDelayMaxMs} instead
   */
  experimental_schemaReportingInitialDelayMaxMs?: number;
}

export type ReportTimingOptions<TContext> =
  | ((
      request:
        | GraphQLRequestContextDidResolveOperation<TContext>
        | GraphQLRequestContextDidEncounterErrors<TContext>,
    ) => Promise<boolean>)
  | boolean;

// Helper function to modify the EngineReportingOptions if the deprecated fields
// 'privateVariables' and 'privateHeaders' were set.
// - Throws an error if both the deprecated option and its replacement (e.g.
//   'privateVariables' and 'sendVariableValues') were set.
// - Otherwise, wraps the deprecated option into objects that can be passed to
//   the new replacement field (see the helper function
//   makeSendValuesBaseOptionsFromLegacy), and deletes the deprecated field from
//   the options
export function legacyOptionsToPluginOptions(
  engine: EngineReportingOptions<any>,
): ApolloServerPluginUsageReportingOptions<any> {
  const pluginOptions: ApolloServerPluginUsageReportingOptions<any> = {};
  // apiKey, schemaTag, graphVariant, and handleSignals are dealt with
  // elsewhere.

  pluginOptions.calculateSignature = engine.calculateSignature;
  pluginOptions.reportIntervalMs = engine.reportIntervalMs;
  pluginOptions.maxUncompressedReportSize = engine.maxUncompressedReportSize;
  pluginOptions.endpointUrl = engine.tracesEndpointUrl ?? engine.endpointUrl;
  pluginOptions.debugPrintReports = engine.debugPrintReports;
  pluginOptions.requestAgent = engine.requestAgent;
  pluginOptions.maxAttempts = engine.maxAttempts;
  pluginOptions.minimumRetryDelayMs = engine.minimumRetryDelayMs;
  pluginOptions.reportErrorFunction = engine.reportErrorFunction;
  pluginOptions.sendVariableValues = engine.sendVariableValues;
  if (typeof engine.reportTiming === 'function') {
    // We can ignore true because that just means to make the plugin, and
    // false is already taken care of with disabledViaLegacyOption.
    pluginOptions.includeRequest = engine.reportTiming;
  }
  pluginOptions.sendHeaders = engine.sendHeaders;
  pluginOptions.sendReportsImmediately = engine.sendReportsImmediately;

  // Normalize the legacy option maskErrorDetails.
  if (engine.maskErrorDetails && engine.rewriteError) {
    throw new Error("Can't set both maskErrorDetails and rewriteError!");
  } else if (engine.rewriteError && typeof engine.rewriteError !== 'function') {
    throw new Error('rewriteError must be a function');
  } else if (engine.maskErrorDetails) {
    pluginOptions.rewriteError = () => new GraphQLError('<masked>');
    delete engine.maskErrorDetails;
  } else if (engine.rewriteError) {
    pluginOptions.rewriteError = engine.rewriteError;
  }
  pluginOptions.generateClientInfo = engine.generateClientInfo;

  // Handle the legacy option: privateVariables
  if (
    typeof engine.privateVariables !== 'undefined' &&
    engine.sendVariableValues
  ) {
    throw new Error(
      "You have set both the 'sendVariableValues' and the deprecated 'privateVariables' options. " +
        "Please only set 'sendVariableValues' (ideally, when calling `ApolloServerPluginUsageReporting` " +
        'instead of the deprecated `engine` option to the `ApolloServer` constructor).',
    );
  } else if (typeof engine.privateVariables !== 'undefined') {
    if (engine.privateVariables !== null) {
      pluginOptions.sendVariableValues = makeSendValuesBaseOptionsFromLegacy(
        engine.privateVariables,
      );
    }
  } else {
    pluginOptions.sendVariableValues = engine.sendVariableValues;
  }

  // Handle the legacy option: privateHeaders
  if (typeof engine.privateHeaders !== 'undefined' && engine.sendHeaders) {
    throw new Error(
      "You have set both the 'sendHeaders' and the deprecated 'privateVariables' options. " +
        "Please only set 'sendHeaders' (ideally, when calling `ApolloServerPluginUsageReporting` " +
        'instead of the deprecated `engine` option to the `ApolloServer` constructor).',
    );
  } else if (typeof engine.privateHeaders !== 'undefined') {
    if (engine.privateHeaders !== null) {
      pluginOptions.sendHeaders = makeSendValuesBaseOptionsFromLegacy(
        engine.privateHeaders,
      );
    }
  } else {
    pluginOptions.sendHeaders = engine.sendHeaders;
  }
  return pluginOptions;
}

// This helper wraps non-null inputs from the deprecated options
// 'privateVariables' and 'privateHeaders' into objects that can be passed to
// the replacement options, 'sendVariableValues' and 'sendHeaders'.
function makeSendValuesBaseOptionsFromLegacy(
  legacyPrivateOption: Array<String> | boolean,
): SendValuesBaseOptions {
  return Array.isArray(legacyPrivateOption)
    ? {
        exceptNames: legacyPrivateOption,
      }
    : legacyPrivateOption
    ? { none: true }
    : { all: true };
}
