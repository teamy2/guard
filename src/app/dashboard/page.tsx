'use client';

import { useState, useEffect } from 'react';

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
    const [stats] = useState<DashboardStats>({
        totalRequests: 125432,
        allowedRequests: 124000,
        blockedRequests: 1200,
        challengedRequests: 232,
        avgLatency: 45,
        healthyBackends: 2,
        totalBackends: 2,
    });

    const [backends, setBackends] = useState<BackendStatus[]>([]);

    useEffect(() => {
        // Fetch backend health
        fetch('/api/admin/backends')
            .then(res => res.json())
            .then(data => setBackends(data.backends || []))
            .catch(() => { });
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Dashboard
                </h1>
                <p className="text-gray-400 mt-1">Real-time load balancer metrics and insights</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Requests"
                    value={formatNumber(stats.totalRequests)}
                    trend="+12.5%"
                    trendUp={true}
                    icon="📊"
                />
                <StatCard
                    label="Blocked"
                    value={formatNumber(stats.blockedRequests)}
                    trend="-5.2%"
                    trendUp={false}
                    icon="🛡️"
                    color="red"
                />
                <StatCard
                    label="Challenged"
                    value={formatNumber(stats.challengedRequests)}
                    trend="+2.1%"
                    trendUp={true}
                    icon="🔐"
                    color="yellow"
                />
                <StatCard
                    label="Avg Latency"
                    value={`${stats.avgLatency}ms`}
                    trend="-8ms"
                    trendUp={false}
                    icon="⚡"
                    color="green"
                />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Traffic Chart Placeholder */}
                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                    <h3 className="text-lg font-semibold mb-4">Traffic Overview</h3>
                    <div className="h-64 flex items-center justify-center bg-gray-800/30 rounded-lg">
                        <div className="text-center">
                            <div className="text-4xl mb-2">📈</div>
                            <p className="text-gray-400 text-sm">Traffic chart</p>
                            <p className="text-gray-500 text-xs mt-1">Connect to Sentry for real-time data</p>
                        </div>
                    </div>
                </div>

                {/* Backend Health */}
                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                    <h3 className="text-lg font-semibold mb-4">Backend Health</h3>
                    <div className="space-y-3">
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
                    </div>
                </div>
            </div>

            {/* Decision Distribution */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Decision Distribution</h3>
                <div className="flex items-center gap-2 h-8 rounded-lg overflow-hidden">
                    <DecisionBar label="Allow" percentage={96.5} color="bg-green-500" />
                    <DecisionBar label="Block" percentage={2.5} color="bg-red-500" />
                    <DecisionBar label="Challenge" percentage={0.8} color="bg-yellow-500" />
                    <DecisionBar label="Throttle" percentage={0.2} color="bg-orange-500" />
                </div>
                <div className="flex flex-wrap gap-4 mt-4">
                    <Legend color="bg-green-500" label="Allow (96.5%)" />
                    <Legend color="bg-red-500" label="Block (2.5%)" />
                    <Legend color="bg-yellow-500" label="Challenge (0.8%)" />
                    <Legend color="bg-orange-500" label="Throttle (0.2%)" />
                </div>
            </div>

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
    const colorClasses = {
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
        red: 'from-red-500/20 to-red-600/5 border-red-500/20',
        yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-5`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400">{label}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <span className="text-2xl">{icon}</span>
            </div>
            <div className={`text-sm mt-2 ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
                {trend} vs last hour
            </div>
        </div>
    );
}

function BackendRow({ backend }: { backend: BackendStatus }) {
    return (
        <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${backend.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="font-medium">{backend.backendId}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">p95: {backend.latencyP95}ms</span>
                <span className={`text-xs px-2 py-1 rounded ${backend.healthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {backend.healthy ? 'Healthy' : 'Unhealthy'}
                </span>
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
            <span className="text-sm text-gray-400">{label}</span>
        </div>
    );
}

function SentryLink({ title, description, href }: { title: string; description: string; href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-gray-900/50 rounded-xl border border-gray-800 p-4 hover:border-purple-500/50 hover:bg-gray-900 transition-all"
        >
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                    <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 72 66">
                        <path d="M29 2.26a4.67 4.67 0 0 0-8 0L14.42 13.53A32.21 32.21 0 0 1 32.17 40.19H27.55A27.68 27.68 0 0 0 12.09 17.47L6 28a15.92 15.92 0 0 1 9.23 12.17H4.62A.76.76 0 0 1 4 39.06l2.94-5a10.74 10.74 0 0 0-3.36-1.9l-2.91 5a4.54 4.54 0 0 0 1.69 6.24A4.66 4.66 0 0 0 4.62 44h14.73a.76.76 0 0 1 .76.76v.13a.75.75 0 0 1-.13.42L17.05 51H4.62a4.54 4.54 0 0 0-4.43 5.52 4.48 4.48 0 0 0 2.16 2.82L24.31 43A36.58 36.58 0 0 1 0 0z" />
                    </svg>
                </div>
                <div>
                    <h4 className="font-medium group-hover:text-white transition-colors">{title}</h4>
                    <p className="text-sm text-gray-500">{description}</p>
                </div>
            </div>
        </a>
    );
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
