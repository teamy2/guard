#!/usr/bin/env node

/**
 * Simple load test script using native fetch
 * For production load testing, consider using k6, artillery, or hey
 * 
 * Usage:
 *   node scripts/load-test.js [options]
 * 
 * Options:
 *   --url       Target URL (default: http://localhost:3000)
 *   --requests  Total requests to make (default: 1000)
 *   --concurrency  Concurrent requests (default: 10)
 *   --bot       Simulate bot traffic (missing headers)
 */

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
    const index = args.findIndex(a => a === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

const BASE_URL = getArg('url', 'http://localhost:3000');
const TOTAL_REQUESTS = parseInt(getArg('requests', '1000'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '10'), 10);
const SIMULATE_BOT = args.includes('--bot');

// User agents for realistic traffic
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

// Endpoints to test
const ENDPOINTS = [
    '/api/health',
    '/api/test',
    '/dashboard',
    '/',
];

// Statistics
const stats = {
    total: 0,
    success: 0,
    errors: 0,
    blocked: 0,
    challenged: 0,
    throttled: 0,
    latencies: [],
    startTime: Date.now(),
};

async function makeRequest() {
    const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const url = `${BASE_URL}${endpoint}`;

    const headers = {};

    if (!SIMULATE_BOT) {
        // Normal browser headers
        headers['User-Agent'] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        headers['Accept-Language'] = 'en-US,en;q=0.9';
        headers['Accept-Encoding'] = 'gzip, deflate, br';
    } else {
        // Bot-like request (missing headers)
        headers['User-Agent'] = 'python-requests/2.28.0';
    }

    const startTime = Date.now();

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers,
        });

        const latency = Date.now() - startTime;
        stats.latencies.push(latency);
        stats.total++;

        switch (response.status) {
            case 200:
            case 201:
            case 204:
                stats.success++;
                break;
            case 403:
                stats.blocked++;
                break;
            case 429:
                stats.throttled++;
                break;
            case 302:
                // Likely a challenge redirect
                const location = response.headers.get('location');
                if (location && location.includes('challenge')) {
                    stats.challenged++;
                } else {
                    stats.success++;
                }
                break;
            default:
                stats.errors++;
        }

        return { status: response.status, latency };
    } catch (error) {
        stats.total++;
        stats.errors++;
        return { status: 0, latency: Date.now() - startTime, error: error.message };
    }
}

async function runBatch(batchSize) {
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
        promises.push(makeRequest());
    }
    await Promise.all(promises);
}

function calculatePercentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || 0;
}

function printProgress() {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const rps = stats.total / elapsed;
    process.stdout.write(`\r  Progress: ${stats.total}/${TOTAL_REQUESTS} (${rps.toFixed(1)} req/s)`);
}

async function main() {
    console.log('🚀 Edge Load Balancer - Load Test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Requests: ${TOTAL_REQUESTS}`);
    console.log(`  Concurrency: ${CONCURRENCY}`);
    console.log(`  Mode: ${SIMULATE_BOT ? 'Bot simulation' : 'Normal traffic'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const progressInterval = setInterval(printProgress, 100);

    // Run requests in batches
    while (stats.total < TOTAL_REQUESTS) {
        const remaining = TOTAL_REQUESTS - stats.total;
        const batchSize = Math.min(CONCURRENCY, remaining);
        await runBatch(batchSize);
    }

    clearInterval(progressInterval);

    // Calculate results
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const rps = stats.total / elapsed;
    const p50 = calculatePercentile(stats.latencies, 0.5);
    const p95 = calculatePercentile(stats.latencies, 0.95);
    const p99 = calculatePercentile(stats.latencies, 0.99);
    const avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;

    console.log('\n');
    console.log('📊 Results');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total Requests: ${stats.total}`);
    console.log(`  Duration: ${elapsed.toFixed(2)}s`);
    console.log(`  Requests/sec: ${rps.toFixed(2)}`);
    console.log('');
    console.log('  📈 Response Distribution:');
    console.log(`    ✅ Success: ${stats.success} (${(stats.success / stats.total * 100).toFixed(1)}%)`);
    console.log(`    🚫 Blocked: ${stats.blocked} (${(stats.blocked / stats.total * 100).toFixed(1)}%)`);
    console.log(`    🔐 Challenged: ${stats.challenged} (${(stats.challenged / stats.total * 100).toFixed(1)}%)`);
    console.log(`    ⏱️  Throttled: ${stats.throttled} (${(stats.throttled / stats.total * 100).toFixed(1)}%)`);
    console.log(`    ❌ Errors: ${stats.errors} (${(stats.errors / stats.total * 100).toFixed(1)}%)`);
    console.log('');
    console.log('  ⚡ Latency:');
    console.log(`    Avg: ${avgLatency.toFixed(2)}ms`);
    console.log(`    P50: ${p50}ms`);
    console.log(`    P95: ${p95}ms`);
    console.log(`    P99: ${p99}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Exit code based on error rate
    const errorRate = stats.errors / stats.total;
    if (errorRate > 0.05) {
        console.log('\n⚠️  Warning: Error rate exceeds 5%');
        process.exit(1);
    }

    console.log('\n✅ Load test completed successfully');
}

main().catch(console.error);
