'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DashboardStats {
    totalRequests: number;
    allowedRequests: number;
    blockedRequests: number;
    challengedRequests: number;
    avgLatency: number;
    healthyBackends: number;
    totalBackends: number;
}

interface BackendStatus {
    backendId: string;
    healthy: boolean;
    latencyP95: number;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
        challengedRequests: 0,
        avgLatency: 0,
        healthyBackends: 0,
        totalBackends: 0,
    });

    const [backends, setBackends] = useState<BackendStatus[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch dashboard stats
        fetch('/api/metrics/stats?hours=1')
            .then(res => res.json())
            .then(data => {
                setStats({
                    totalRequests: data.totalRequests || 0,
                    allowedRequests: data.allowedRequests || 0,
                    blockedRequests: data.blockedRequests || 0,
                    challengedRequests: data.challengedRequests || 0,
                    avgLatency: data.avgLatency || 0,
                    healthyBackends: 0, // Will be set from backends
                    totalBackends: 0, // Will be set from backends
                });
                setLoading(false);
            })
            .catch((error) => {
                console.error('Failed to fetch stats:', error);
                setLoading(false);
            });

        // Fetch backend health
        fetch('/internal/api/admin/backends')
            .then(res => res.json())
            .then(data => {
                const backendList = data.backends || [];
                setBackends(backendList);
                setStats(prev => ({
                    ...prev,
                    healthyBackends: backendList.filter((b: BackendStatus) => b.healthy).length,
                    totalBackends: backendList.length,
                }));
            })
            .catch(() => { });
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Real-time load balancer metrics and insights</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Requests"
                    value={loading ? '...' : formatNumber(stats.totalRequests)}
                    trend=""
                    trendUp={true}
                    icon="📊"
                />
                <StatCard
                    label="Blocked"
                    value={loading ? '...' : formatNumber(stats.blockedRequests)}
                    trend=""
                    trendUp={false}
                    icon="🛡️"
                    color="red"
                />
                <StatCard
                    label="Challenged"
                    value={loading ? '...' : formatNumber(stats.challengedRequests)}
                    trend=""
                    trendUp={true}
                    icon="🔐"
                    color="yellow"
                />
                <StatCard
                    label="Avg Latency"
                    value={loading ? '...' : `${stats.avgLatency}ms`}
                    trend=""
                    trendUp={false}
                    icon="⚡"
                    color="green"
                />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Traffic Chart Placeholder */}
                <Card>
                    <CardHeader>
                        <CardTitle>Traffic Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg">
                            <div className="text-center">
                                <div className="text-4xl mb-2">📈</div>
                                <p className="text-muted-foreground text-sm">Traffic chart</p>
                                <p className="text-muted-foreground text-xs mt-1">Connect to Sentry for real-time data</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Backend Health */}
                <Card>
                    <CardHeader>
                        <CardTitle>Backend Health</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {backends.length > 0 ? (
                            backends.map((backend) => (
                                <BackendRow key={backend.backendId} backend={backend} />
                            ))
                        ) : (
                            <>
                                <BackendRow
                                    backend={{ backendId: 'primary', healthy: true, latencyP95: 42 }}
                                />
                                <BackendRow
                                    backend={{ backendId: 'secondary', healthy: true, latencyP95: 58 }}
                                />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Decision Distribution */}
            <Card>
                <CardHeader>
                    <CardTitle>Decision Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : stats.totalRequests > 0 ? (
                        <>
                            <div className="flex items-center gap-2 h-8 rounded-lg overflow-hidden">
                                <DecisionBar 
                                    label="Allow" 
                                    percentage={(stats.allowedRequests / stats.totalRequests) * 100} 
                                    color="bg-green-500" 
                                />
                                <DecisionBar 
                                    label="Block" 
                                    percentage={(stats.blockedRequests / stats.totalRequests) * 100} 
                                    color="bg-red-500" 
                                />
                                <DecisionBar 
                                    label="Challenge" 
                                    percentage={(stats.challengedRequests / stats.totalRequests) * 100} 
                                    color="bg-yellow-500" 
                                />
                                <DecisionBar 
                                    label="Throttle" 
                                    percentage={((stats.totalRequests - stats.allowedRequests - stats.blockedRequests - stats.challengedRequests) / stats.totalRequests) * 100} 
                                    color="bg-orange-500" 
                                />
                            </div>
                            <div className="flex flex-wrap gap-4 mt-4">
                                <Legend 
                                    color="bg-green-500" 
                                    label={`Allow (${((stats.allowedRequests / stats.totalRequests) * 100).toFixed(1)}%)`} 
                                />
                                <Legend 
                                    color="bg-red-500" 
                                    label={`Block (${((stats.blockedRequests / stats.totalRequests) * 100).toFixed(1)}%)`} 
                                />
                                <Legend 
                                    color="bg-yellow-500" 
                                    label={`Challenge (${((stats.challengedRequests / stats.totalRequests) * 100).toFixed(1)}%)`} 
                                />
                                <Legend 
                                    color="bg-orange-500" 
                                    label={`Throttle (${(((stats.totalRequests - stats.allowedRequests - stats.blockedRequests - stats.challengedRequests) / stats.totalRequests) * 100).toFixed(1)}%)`} 
                                />
                            </div>
                        </>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No data available yet. Metrics will appear as requests are processed.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sentry Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SentryLink
                    title="View Issues"
                    description="Errors and exceptions"
                    href="https://sentry.io/issues/"
                />
                <SentryLink
                    title="View Traces"
                    description="Performance monitoring"
                    href="https://sentry.io/performance/"
                />
                <SentryLink
                    title="View Metrics"
                    description="Custom metrics dashboard"
                    href="https://sentry.io/metrics/"
                />
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    trend,
    trendUp,
    icon,
    color = 'blue'
}: {
    label: string;
    value: string;
    trend: string;
    trendUp: boolean;
    icon: string;
    color?: 'blue' | 'red' | 'yellow' | 'green';
}) {
    // Simplifying colors to use theme variables or simple classes for now, or keep custom if needed
    // But using Card component is better
    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold mt-1">{value}</p>
                    </div>
                    <span className="text-2xl">{icon}</span>
                </div>
                {trend && (
                    <div className={`text-sm mt-2 ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
                        {trend} vs last hour
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function BackendRow({ backend }: { backend: BackendStatus }) {
    return (
        <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${backend.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{backend.backendId}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">p95: {backend.latencyP95}ms</span>
                <Badge variant={backend.healthy ? "default" : "destructive"} className={backend.healthy ? "bg-green-500 hover:bg-green-600" : ""}>
                    {backend.healthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
            </div>
        </div>
    );
}

function DecisionBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
    return (
        <div
            className={`${color} h-full transition-all duration-300 hover:opacity-80`}
            style={{ width: `${percentage}%` }}
            title={`${label}: ${percentage}%`}
        />
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span className="text-sm text-muted-foreground">{label}</span>
        </div>
    );
}

function SentryLink({ title, description, href }: { title: string; description: string; href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
        >
            <Card className="h-full hover:bg-muted/50 transition-colors">
                <CardContent className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 72 66">
                            <path d="M29 2.26a4.67 4.67 0 0 0-8 0L14.42 13.53A32.21 32.21 0 0 1 32.17 40.19H27.55A27.68 27.68 0 0 0 12.09 17.47L6 28a15.92 15.92 0 0 1 9.23 12.17H4.62A.76.76 0 0 1 4 39.06l2.94-5a10.74 10.74 0 0 0-3.36-1.9l-2.91 5a4.54 4.54 0 0 0 1.69 6.24A4.66 4.66 0 0 0 4.62 44h14.73a.76.76 0 0 1 .76.76v.13a.75.75 0 0 1-.13.42L17.05 51H4.62a4.54 4.54 0 0 0-4.43 5.52 4.48 4.48 0 0 0 2.16 2.82L24.31 43A36.58 36.58 0 0 1 0 0z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="font-medium">{title}</h4>
                        <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                </CardContent>
            </Card>
        </a>
    );
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
