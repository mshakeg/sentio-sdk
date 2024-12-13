import {
  AccountAddressInput,
  Aptos,
  AptosConfig,
  InputViewFunctionData,
  PaginationArgs,
  LedgerVersionArg,
  MoveStructId,
  MoveValue,
  AnyNumber,
  InputViewFunctionJsonData
} from '@aptos-labs/ts-sdk'
import { AptosBaseContext } from './context.js'
import { TypeDescriptor } from '@typemove/move'
import { defaultMoveCoderForClient } from './move-coder.js'

// Aptos Client inherit [[ Aptos ]] and add getTypedAccountResource method with could get resource and
// decode it to the specified type
export class RichAptosClient extends Aptos {
  async getTypedAccountResource<T>(args: {
    accountAddress: AccountAddressInput
    resourceType: TypeDescriptor<T>
    options?: LedgerVersionArg
  }): Promise<T> {
    const type = args.resourceType
    const res = await this.getAccountResource({
      ...args,
      resourceType: type.getSignature() as MoveStructId
    })

    return (await defaultMoveCoderForClient(this).decodeType(res, type))!
  }
}

// Aptos Client inherit [[ RichAptosClient ]] and add context to it
// will inject ledger version from context for the following methods if ledgerVersion not specified
// - getAccountResource(s)
// - getModule(s)
// - view/viewJson
export class RichAptosClientWithContext extends RichAptosClient {
  protected ctx: AptosBaseContext
  constructor(ctx: AptosBaseContext, config: AptosConfig) {
    super(config)
    this.ctx = ctx
  }

  private transformArgs<T extends { options?: LedgerVersionArg }>(args: T): T {
    if (args.options?.ledgerVersion) {
      args.options = {
        ...args.options,
        ledgerVersion: this.ctx.version
      }
    }
    return args
  }

  view<T extends Array<MoveValue>>(args: { payload: InputViewFunctionData; options?: LedgerVersionArg }) {
    return super.view<T>(this.transformArgs(args))
  }

  viewJson<T extends Array<MoveValue>>(args: { payload: InputViewFunctionJsonData; options?: LedgerVersionArg }) {
    return super.viewJson<T>(this.transformArgs(args))
  }

  getAccountResource<T extends object>(args: {
    accountAddress: AccountAddressInput
    resourceType: MoveStructId
    options?: LedgerVersionArg
  }) {
    return super.getAccountResource<T>(this.transformArgs(args))
  }

  getAccountResources(args: { accountAddress: AccountAddressInput; options?: PaginationArgs & LedgerVersionArg }) {
    return super.getAccountResources(this.transformArgs(args))
  }

  getAccountModules(args: { accountAddress: AccountAddressInput; options?: PaginationArgs & LedgerVersionArg }) {
    return super.getAccountModules(this.transformArgs(args))
  }

  getAccountModule(args: { accountAddress: AccountAddressInput; moduleName: string; options?: LedgerVersionArg }) {
    return super.getAccountModule(this.transformArgs(args))
  }

  lookupOriginalAccountAddress(args: {
    authenticationKey: AccountAddressInput
    minimumLedgerVersion?: AnyNumber
    options?: LedgerVersionArg
  }) {
    return super.lookupOriginalAccountAddress(this.transformArgs(args))
  }
}
