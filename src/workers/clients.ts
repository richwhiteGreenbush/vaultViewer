import * as Comlink from 'comlink';
import type { ParseWorkerApi } from './parse.worker';
import type { LayoutWorkerApi } from './layout.worker';

export type ParseClient = Comlink.Remote<ParseWorkerApi>;
export type LayoutClient = Comlink.Remote<LayoutWorkerApi>;

const newParseWorker = () =>
  new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module', name: 'parse' });

let parse: ParseClient | undefined;
let poolReady: Promise<void> | undefined;

/** Coordinator parse worker, plus (cores - 1, max 3) helper workers wired to it over MessageChannels. */
export function parseClient(): ParseClient {
  if (!parse) {
    const coordinator = Comlink.wrap<ParseWorkerApi>(newParseWorker());
    parse = coordinator;
    const helpers = Math.max(0, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    poolReady = Promise.all(
      Array.from({ length: helpers }, async () => {
        const helper = Comlink.wrap<ParseWorkerApi>(newParseWorker());
        const { port1, port2 } = new MessageChannel();
        await helper.servePort(Comlink.transfer(port2, [port2]));
        await coordinator.addHelper(Comlink.transfer(port1, [port1]));
      }),
    ).then(() => undefined);
  }
  return parse;
}

export async function parseClientReady(): Promise<ParseClient> {
  const client = parseClient();
  await poolReady;
  return client;
}

let layout: LayoutClient | undefined;
export function layoutClient(): LayoutClient {
  layout ??= Comlink.wrap<LayoutWorkerApi>(
    new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module', name: 'layout' }),
  );
  return layout;
}
