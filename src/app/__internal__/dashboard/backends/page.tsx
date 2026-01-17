'use client';

import { useState, useEffect } from 'react';

interface Backend {
    backendId: string;
    healthy: boolean;
    lastCheck: string;
    latencyP50?: number;
    latencyP95?: number;
    latencyP99?: number;
    errorRate?: number;
    consecutiveFailures: number;
}

export default function BackendsPage() {
    const [backends, setBackends] = useState<Backend[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/__internal__/api/admin/backends')
            .then(res => res.json())
            .then(data => {
                setBackends(data.backends || []);
                setLoading(false);
            })
            .catch(() => {
                // Demo data
                setBackends([
                    {
                        backendId: 'primary',
                        healthy: true,
                        lastCheck: new Date().toISOString(),
                        latencyP50: 32,
                        latencyP95: 45,
                        latencyP99: 78,
                        errorRate: 0.001,
                        consecutiveFailures: 0,
                    },
                    {
                        backendId: 'secondary',
                        healthy: true,
                        lastCheck: new Date().toISOString(),
                        latencyP50: 48,
                        latencyP95: 62,
                        latencyP99: 95,
                        errorRate: 0.002,
                        consecutiveFailures: 0,
                    },
                ]);
                setLoading(false);
            });
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Backends
                    </h1>
                    <p className="text-gray-400 mt-1">Backend health and performance metrics</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Backend Cards */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {backends.map((backend) => (
                        <BackendCard key={backend.backendId} backend={backend} />
                    ))}
                </div>
            )}

            {/* Latency Comparison */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Latency Comparison (P95)</h3>
                <div className="space-y-4">
                    {backends.map((backend) => (
                        <div key={backend.backendId} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{backend.backendId}</span>
                                <span className={`text-sm ${(backend.latencyP95 || 0) < 50 ? 'text-green-400' :
                                    (backend.latencyP95 || 0) < 100 ? 'text-yellow-400' : 'text-red-400'
                                    }`}>
                                    {backend.latencyP95 || 0}ms
                                </span>
                            </div>
                            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${(backend.latencyP95 || 0) < 50 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                                        (backend.latencyP95 || 0) < 100 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                                            'bg-gradient-to-r from-red-500 to-red-400'
                                        }`}
                                    style={{ width: `${Math.min(100, (backend.latencyP95 || 0) / 2)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sentry Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                    href="https://sentry.io/issues/?query=tag%3Amodule%3Abackend"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 hover:border-red-500/50 transition-colors"
                >
                    <h4 className="font-medium">Backend Errors in Sentry</h4>
                    <p className="text-sm text-gray-400 mt-1">View backend-related issues</p>
                </a>
                <a
                    href="https://sentry.io/performance/?query=op%3Aedge.proxy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 hover:border-blue-500/50 transition-colors"
                >
                    <h4 className="font-medium">Proxy Performance</h4>
                    <p className="text-sm text-gray-400 mt-1">View edge.proxy traces</p>
                </a>
            </div>
        </div>
    );
}

function BackendCard({ backend }: { backend: Backend }) {
    return (
        <div className={`bg-gray-900/50 rounded-xl border ${backend.healthy ? 'border-green-500/30' : 'border-red-500/30'
            } p-6`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${backend.healthy ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                        }`} />
                    <h3 className="text-xl font-semibold">{backend.backendId}</h3>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${backend.healthy
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                    }`}>
                    {backend.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 mb-4">
                <MetricBox label="P50" value={`${backend.latencyP50 || 0}ms`} />
                <MetricBox label="P95" value={`${backend.latencyP95 || 0}ms`} />
                <MetricBox label="P99" value={`${backend.latencyP99 || 0}ms`} />
            </div>

            {/* Additional Info */}
            <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Error Rate</span>
                    <span className={backend.errorRate && backend.errorRate > 0.01 ? 'text-red-400' : 'text-gray-300'}>
                        {((backend.errorRate || 0) * 100).toFixed(2)}%
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Consecutive Failures</span>
                    <span className={backend.consecutiveFailures > 0 ? 'text-red-400' : 'text-gray-300'}>
                        {backend.consecutiveFailures}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Last Check</span>
                    <span className="text-gray-300">
                        {new Date(backend.lastCheck).toLocaleTimeString()}
                    </span>
                </div>
            </div>
        </div>
    );
}

function MetricBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 uppercase">{label}</div>
            <div className="text-lg font-semibold mt-1">{value}</div>
        </div>
    );
}
