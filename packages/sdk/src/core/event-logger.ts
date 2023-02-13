import { BaseContext } from './base-context.js'
import { EventTrackingResult, LogLevel } from '@sentio/protos'
import { normalizeAttribute } from './normalization.js'

export interface Event {
  // The unique identifier of main identity associate with an event
  // .e.g user id / token address / account address / contract address id
  //
  distinctId?: string
  severity?: LogLevel
  message?: string

  [key: string]: any
}

export class EventLogger {
  private readonly ctx: BaseContext

  constructor(ctx: BaseContext) {
    this.ctx = ctx
  }

  emit(eventName: string, event: Event) {
    const { distinctId, severity, message, ...payload } = event

    const res: EventTrackingResult = {
      metadata: this.ctx.getMetaData(eventName, {}),
      severity: severity || LogLevel.INFO,
      message: message || '',
      distinctEntityId: distinctId || '',
      attributes: normalizeAttribute(payload),
      runtimeInfo: undefined,
      noMetric: true,
    }
    this.ctx._res.events.push(res)
  }
}
