import { setErrorHandler } from './libs/generic';
import SentryReporter from './libs/errors/sentry-reporter';
import { injectedScript } from './libs/messaging/injected';

setErrorHandler((ex) => SentryReporter.captureException(ex));

injectedScript.addMessageListener('error', (injectedEx) => {
  const ex = new Error(injectedEx.message);
  ex.name = injectedEx.name;
  ex.stack = injectedEx.stack;
  if (injectedEx.details) ex.details = injectedEx.details;

  SentryReporter.captureException(ex);
});

// The manifest loads the MAIN helper and then this bridge plus the ISOLATED renderer.
