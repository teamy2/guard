// This file configures the initialization of Sentry for edge features (Middleware, Edge Rotues).
// The config you add here will be used whenever one of the features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Performance monitoring - higher sample rate for edge
    tracesSampleRate: parseFloat(process.env.TELEMETRY_SAMPLE_RATE || '0.1'),

    // Error sampling
    sampleRate: 1.0,

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Edge-specific settings
    integrations: [],

    // Filter out non-critical errors
    beforeSend(event) {
        // Don't send events for expected errors like AbortError
        if (event.exception?.values?.[0]?.type === 'AbortError') {
            return null;
        }
        return event;
    },

    // Initial scope
    initialScope: {
        tags: {
            runtime: 'edge',
        },
    },
});
