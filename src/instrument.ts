// Import with `const Sentry = require("@sentry/nestjs");` if you are using CJS
import * as Sentry from '@sentry/nestjs'
import {nodeProfilingIntegration} from '@sentry/profiling-node'

Sentry.init({
  dsn: 'https://5966f6d46e9fc3d85c89f06dba2d8f12@o4507665778868224.ingest.us.sentry.io/4507665795121152',
  integrations: [
    nodeProfilingIntegration()
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0
})
