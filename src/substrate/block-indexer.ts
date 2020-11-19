import { resolveSubsocialApi } from '../connections/subsocial';
import { shouldHandleEvent } from '../substrate/utils';
import { handleEventForPostgres } from '../substrate/handle-postgres';
import { handleEventForElastic } from '../substrate/handle-elastic';
import { BlockNumber, EventRecord } from '@polkadot/types/interfaces';
import { u32 } from '@polkadot/types/primitive'
import registry from '@subsocial/types/substrate/registry'
import { readFileSync } from 'fs';
import { SubsocialSubstrateApi } from '@subsocial/api/substrate';
import { newLogger } from '@subsocial/utils';
import { join } from 'path';
import { OffchainState, CommonDbState, SubstrateEvent } from './types';
import { writeOffchainState } from '../substrate/offchain-state';
import { getUniqueIds } from '@subsocial/api';
import { Vec } from '@polkadot/types';
import { TEST_MODE } from '../env';
const log = newLogger('Events')

async function processEvents(blockNumber: BlockNumber, events: Vec<EventRecord>) {
  
  for (let i = 0; i < events.length; i++) {
    const { event } = events[i]

    if (shouldHandleEvent(event)) {
      log.debug(`Handle a new event: %o`, event.method)

      const eventMeta = {
        eventName: event.method,
        data: event.data,
        blockNumber: blockNumber,
        eventIndex: i
      }
      console.log(JSON.stringify(eventMeta))
      await handleEventForPostgres(eventMeta)
      await handleEventForElastic(eventMeta)
    }
  }
}

async function indexingFromFile(substrate: SubsocialSubstrateApi) {
  const api = await substrate.api

  const stateDirPath = join(__dirname, '../../state/')
  
  const content = readFileSync(stateDirPath + 'Blocks.csv', 'utf-8')

  const blockNumbersArr = content.replace(/"/g, '').split('\n')
  const blockNumbers = getUniqueIds(blockNumbersArr)
    .map(x => new u32(registry, x))
    .sort((a, b) => a.sub(b).toNumber())

  log.debug(`${blockNumbers.length} blocks will be reindexed`)

  let eventsMeta: SubstrateEvent[] = JSON.parse(readFileSync('./test/input_data/events.json', 'utf-8'))

  for (let i = 0; i < blockNumbers.length; i++) {
    const blockNumber = blockNumbers[i];

    if (TEST_MODE) { 
      let events = eventsMeta.filter(x => x.blockNumber == blockNumber)
      for (let i = 0; i < events.length; i++) {
        const event = events[i]

        await handleEventForPostgres(event)
      }
    }
    else {
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber)
      let events = await api.query.system.events.at(blockHash)
      processEvents(blockNumber, events)
    }
  }  

  let lastBlock: CommonDbState = { lastBlock: blockNumbers.pop()?.toNumber() }

  let state: OffchainState = { postgres: lastBlock, elastic: lastBlock }
  await writeOffchainState(state)
  log.debug('State is:', lastBlock)  
}

resolveSubsocialApi()
  .then(({ substrate }) => indexingFromFile(substrate))
  .catch((error) => {
    log.error('Unexpected error during processing of Substrate events:', error)
    process.exit(-1)
  })
