// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Performance monitoring
    tracesSampleRate: parseFloat(process.env.TELEMETRY_SAMPLE_RATE || '0.1'),

    // Set up profiling for performance insights
    profilesSampleRate: 0.1,

    // Error sampling
    sampleRate: 1.0,

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Additional integrations
    integrations: [
        Sentry.captureConsoleIntegration({
            levels: ['error', 'warn'],
        }),
    ],

    // Filter out non-critical errors
    beforeSend(event) {
        // Don't send events for expected errors
        if (event.exception?.values?.[0]?.type === 'AbortError') {
            return null;
        }
        return event;
    },

    // Tag all events with runtime
    initialScope: {
        tags: {
            runtime: 'nodejs',
        },
    },
});
