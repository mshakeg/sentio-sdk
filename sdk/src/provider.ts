import { BaseProvider, FallbackProvider, getNetwork, Provider, StaticJsonRpcProvider } from '@ethersproject/providers'
import { Networkish } from '@ethersproject/networks'

export const DummyProvider = new StaticJsonRpcProvider(undefined, 1)

export function getProvider(networkish?: Networkish): Provider {
  if (!networkish) {
    networkish = 1
  }
  const network = getNetwork(networkish)

  if (!globalThis.SentioProvider) {
    throw Error('Provider not found')
  }
  const value = globalThis.SentioProvider.get(network.chainId)
  if (value === undefined) {
    throw Error('Provider not found')
  }
  return value
}

export function setProvider(config: any) {
  globalThis.SentioProvider = new Map<number, Provider>()

  for (const chainIdStr in config) {
    if (isNaN(Number.parseInt(chainIdStr))) {
      continue
    }

    const chainConfig = config[chainIdStr]
    const chainId = Number(chainIdStr)

    // let providers: StaticJsonRpcProvider[] = []
    // for (const http of chainConfig.Https) {
    //   providers.push(new StaticJsonRpcProvider(http, chainId))
    // }
    // random shuffle
    // providers = providers.sort(() => Math.random() - 0.5)

    // const provider = new FallbackProvider(providers)
    const idx = Math.floor(Math.random() * chainConfig.Https.length)
    const provider = new StaticJsonRpcProvider(chainConfig.Https[idx], chainId)

    globalThis.SentioProvider.set(chainId, provider)
  }
}
