//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  JobQueue,
  EventWatcher as BaseEventWatcher,
  EventWatcherInterface,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  UNKNOWN_EVENT_NAME,
  UpstreamConfig
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Event } from './entity/Event';

const EVENT = 'event';

const log = debug('vulcanize:events');

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined
  _baseEventWatcher: BaseEventWatcher
  _pubsub: PubSub
  _jobQueue: JobQueue

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    assert(ethClient);
    assert(indexer);

    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._baseEventWatcher = new BaseEventWatcher(upstreamConfig, this._ethClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([EVENT]);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    this._baseEventWatcher.startBlockProcessing();
  }

  async stop (): Promise<void> {
    this._baseEventWatcher.stop();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      const { id, data: { failed } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_BLOCK_PROCESSING} failed`);
        return;
      }

      await this._baseEventWatcher.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      const { id, data: { request, failed, state, createdOn } } = job;

      if (failed) {
        log(`Job ${id} for queue ${QUEUE_EVENT_PROCESSING} failed`);
        return;
      }

      const dbEvents = await this._baseEventWatcher.eventProcessingCompleteHandler(job);
      const timeElapsedInSeconds = (Date.now() - Date.parse(createdOn)) / 1000;

      // Cannot publish individual event as they are processed together in a single job.
      // TODO: Use a different pubsub to publish event from job-runner.
      // https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
      for (const dbEvent of dbEvents) {
        log(`Job onComplete event ${dbEvent.id} publish ${!!request.data.publish}`);

        if (!failed && state === 'completed' && request.data.publish) {
          // Check for max acceptable lag time between request and sending results to live subscribers.
          if (timeElapsedInSeconds <= this._jobQueue.maxCompletionLag) {
            await this.publishEventToSubscribers(dbEvent, timeElapsedInSeconds);
          } else {
            log(`event ${dbEvent.id} is too old (${timeElapsedInSeconds}s), not broadcasting to live subscribers`);
          }
        }
      }
    });
  }

  async publishEventToSubscribers (dbEvent: Event, timeElapsedInSeconds: number): Promise<void> {
    if (dbEvent && dbEvent.eventName !== UNKNOWN_EVENT_NAME) {
      const resultEvent = this._indexer.getResultEvent(dbEvent);

      log(`pushing event to GQL subscribers (${timeElapsedInSeconds}s elapsed): ${resultEvent.event.__typename}`);

      // Publishing the event here will result in pushing the payload to GQL subscribers for `onEvent`.
      await this._pubsub.publish(EVENT, {
        onEvent: resultEvent
      });
    }
  }
}
