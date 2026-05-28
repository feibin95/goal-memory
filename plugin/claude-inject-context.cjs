#!/usr/bin/env node
'use strict';

const { getSessionKey } = require('./build-state-context.cjs');
const { readStdinJson, injectIfNeeded } = require('./inject-core.cjs');

readStdinJson(input => {
  if (!input.transcript_path) process.exit(0);
  const sessionKey = getSessionKey(input.transcript_path);
  const result = injectIfNeeded(sessionKey, input.hook_event_name, input, 'goalmem-counter-', 5);
  if (result !== 'emitted') process.exit(0);
});
