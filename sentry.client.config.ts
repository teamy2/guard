// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Performance monitoring
    tracesSampleRate: 0.1,

    // Session replay for debugging UI issues
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // Release tracking
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Integrations
    integrations: [
        Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
        }),
        Sentry.browserTracingIntegration(),
    ],

    // Filter out non-critical errors
    beforeSend(event) {
        // Filter out chunk load errors (common in SPAs)
        if (event.exception?.values?.[0]?.value?.includes('ChunkLoadError')) {
            return null;
        }
        return event;
    },

    // Initial scope
    initialScope: {
        tags: {
            runtime: 'browser',
        },
    },
});
