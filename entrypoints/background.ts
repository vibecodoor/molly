import {
  IDLE_INTERVAL_S,
  type ImportBackupMessage,
  type SetLangMessage,
  type SetThemeMessage,
  type SetLimitMessage,
  importBackup,
  reconcile,
  saveLang,
  saveTheme,
  setLimit,
} from '../src/adapter/reconcile';

export default defineBackground(() => {
  // One job at a time: overlapping async storage read-modify-writes would double-credit or lose writes.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = queue.then(job);
    queue = result.catch((e) => console.error('background job failed', e));
    return result;
  };
  const run = () => void enqueue(() => reconcile());

  // Listeners must be registered synchronously at top level so Chrome wakes the worker for them.
  browser.idle.setDetectionInterval(IDLE_INTERVAL_S);
  browser.runtime.onStartup.addListener(run);
  browser.runtime.onInstalled.addListener(run);
  browser.tabs.onActivated.addListener(run);
  browser.tabs.onUpdated.addListener((_id, info) => info.url && run());
  browser.tabs.onRemoved.addListener(run);
  browser.tabs.onAttached.addListener(run);
  browser.tabs.onDetached.addListener(run);
  browser.tabs.onReplaced.addListener(run);
  browser.windows.onRemoved.addListener(run);
  browser.alarms.onAlarm.addListener(run);
  browser.idle.onStateChanged.addListener(run); // locked → paused, anything else → resumed (in reconcile)

  // Writes from extension pages go through the same queue, then re-apply blocks at once.
  browser.runtime.onMessage.addListener((msg: SetLimitMessage | ImportBackupMessage | SetLangMessage | SetThemeMessage, _sender, sendResponse) => {
    const job =
      msg?.type === 'setLimit'
        ? () => setLimit(msg)
        : msg?.type === 'importBackup'
          ? () => importBackup(msg)
          : msg?.type === 'setLang'
            ? () => saveLang(msg)
            : msg?.type === 'setTheme'
              ? () => saveTheme(msg)
              : null;
    if (!job) return;
    enqueue(async () => {
      const result = await job();
      await reconcile();
      return result;
    }).then(
      (result) => sendResponse({ ok: true, result }),
      (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true; // keep the channel open for the async response
  });
});
