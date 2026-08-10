/*
 * @embabel/appliance-client — the one place the appliance's REST surface is written down.
 *
 * Consumed by the Worlds console (browser, same-origin fetch) and by the Me app's MAIN process
 * (Node, configured baseUrl, credential held out of the renderer). No DOM, no framework, so it can
 * load in either.
 */

export { HttpTransport, basicAuth } from './transport.ts'
export type { Transport, RequestSpec, HttpTransportConfig } from './transport.ts'

export { isOk, expect } from './outcome.ts'
export type { Outcome, Ok, Failure, FailureKind } from './outcome.ts'

export { KgClient, isBackgroundHandle } from './kg.ts'
export type {
  ExecuteOptions,
  KgAnswerAccepted,
  KgBackgroundHandle,
  KgDeleteViewResult,
  KgGenerated,
  KgInFlightRun,
  KgKillResult,
  KgQueryResult,
  KgRefreshViewResult,
  KgRunChoice,
  KgRunState,
  KgSaveViewRequest,
  KgSaveViewResult,
  KgSchema,
  KgValidation,
  KgView,
  KgViewInvocation,
  KgViewParamSpec,
} from './kg.ts'

export type { components, paths } from './generated/openapi.ts'

import { KgClient } from './kg.ts'
import { HttpTransport, type HttpTransportConfig, type Transport } from './transport.ts'

/** Everything the appliance offers, per connection. One more sub-client lands here per surface. */
export class ApplianceClient {
  readonly kg: KgClient

  constructor(readonly transport: Transport) {
    this.kg = new KgClient(transport)
  }

  /** The console's configuration: relative URLs, same origin, ambient credentials. */
  static sameOrigin(config: Omit<HttpTransportConfig, 'baseUrl'> = {}): ApplianceClient {
    return new ApplianceClient(new HttpTransport({ ...config, baseUrl: '' }))
  }

  /** The Me main process's configuration: an explicit appliance URL and its credential. */
  static forAppliance(config: HttpTransportConfig): ApplianceClient {
    return new ApplianceClient(new HttpTransport(config))
  }
}
