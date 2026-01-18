'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
        fetch('/api/admin/backends')
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
                    <h1 className="text-3xl font-bold tracking-tight">Backends</h1>
                    <p className="text-muted-foreground mt-1">Backend health and performance metrics</p>
                </div>
                <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                >
                    Refresh
                </Button>
            </div>

            {/* Backend Cards */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {backends.map((backend) => (
                        <BackendCard key={backend.backendId} backend={backend} />
                    ))}
                </div>
            )}

            {/* Latency Comparison */}
            <Card>
                <CardHeader>
                    <CardTitle>Latency Comparison (P95)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2].map((i) => (
                                <div key={i} className="space-y-2">
                                    <div className="h-4 bg-muted animate-pulse rounded" />
                                    <div className="h-3 bg-muted animate-pulse rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : backends.length > 0 ? (
                        backends.map((backend) => {
                            const p95 = backend.latencyP95 || 0;
                            const maxLatency = Math.max(...backends.map(b => b.latencyP95 || 0), 100);
                            const percentage = maxLatency > 0 ? (p95 / maxLatency) * 100 : 0;

                            return (
                                <div key={backend.backendId} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm">{backend.backendId}</span>
                                        <span className={`text-sm ${p95 < 50 ? 'text-green-500' :
                                            p95 < 100 ? 'text-yellow-500' : 'text-red-500'
                                            }`}>
                                            {p95 > 0 ? `${Math.round(p95)}ms` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                                        {p95 > 0 ? (
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${p95 < 50 ? 'bg-green-500' :
                                                    p95 < 100 ? 'bg-yellow-500' :
                                                        'bg-red-500'
                                                    }`}
                                                style={{ width: `${Math.min(100, percentage)}%` }}
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center">
                                                <span className="text-xs text-muted-foreground">No data</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No backends configured or no latency data available yet.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sentry Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                    href="https://sentry.io/issues/?query=tag%3Amodule%3Abackend"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                >
                    <Card className="hover:bg-muted/50 transition-colors">
                        <CardContent className="p-6">
                            <h4 className="font-medium">Backend Errors in Sentry</h4>
                            <p className="text-sm text-muted-foreground mt-1">View backend-related issues</p>
                        </CardContent>
                    </Card>
                </a>
                <a
                    href="https://sentry.io/performance/?query=op%3Aedge.proxy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                >
                    <Card className="hover:bg-muted/50 transition-colors">
                        <CardContent className="p-6">
                            <h4 className="font-medium">Proxy Performance</h4>
                            <p className="text-sm text-muted-foreground mt-1">View edge.proxy traces</p>
                        </CardContent>
                    </Card>
                </a>
            </div>
        </div>
    );
}

function BackendCard({ backend }: { backend: Backend }) {
    return (
        <Card className={backend.healthy ? "border-green-500/30" : "border-red-500/30"}>
            <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${backend.healthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                            }`} />
                        <h3 className="text-xl font-semibold">{backend.backendId}</h3>
                    </div>
                    <Badge variant={backend.healthy ? "default" : "destructive"} className={backend.healthy ? "bg-green-500 hover:bg-green-600" : ""}>
                        {backend.healthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
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
                        <span className="text-muted-foreground">Error Rate</span>
                        <span className={backend.errorRate && backend.errorRate > 0.01 ? 'text-red-500' : 'text-foreground'}>
                            {((backend.errorRate || 0) * 100).toFixed(2)}%
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Consecutive Failures</span>
                        <span className={backend.consecutiveFailures > 0 ? 'text-red-500' : 'text-foreground'}>
                            {backend.consecutiveFailures}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last Check</span>
                        <span className="text-foreground">
                            {new Date(backend.lastCheck).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MetricBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-muted/50 rounded-lg p-3 text-center border">
            <div className="text-xs text-muted-foreground uppercase">{label}</div>
            <div className="text-lg font-semibold mt-1">{value}</div>
        </div>
    );
}
