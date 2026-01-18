'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Shield, Lock, Zap, Search, TrendingUp } from "lucide-react";

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
    latencyMs: number | null;
    timedOut: boolean;
}

interface TrafficDataPoint {
    time: string;
    total: number;
    allow: number;
    block: number;
    challenge: number;
    throttle: number;
}

export default function DashboardPage() {
    const [selectedDomain, setSelectedDomain] = useState<string>('');
    const [domains, setDomains] = useState<string[]>([]);
    const [showCreateDomain, setShowCreateDomain] = useState(false);
    const [newDomain, setNewDomain] = useState('');
    const [creatingDomain, setCreatingDomain] = useState(false);

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
    const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [trafficLoading, setTrafficLoading] = useState(true);
    const [backendsLoading, setBackendsLoading] = useState(true);

    // Fetch user domains on mount
    useEffect(() => {
        fetch('/api/admin/domains')
            .then(res => res.json())
            .then(data => {
                const userDomains = data.domains || [];
                setDomains(userDomains);
                // Auto-select first domain if available
                if (userDomains.length > 0 && !selectedDomain) {
                    setSelectedDomain(userDomains[0]);
                }
            })
            .catch(() => {
                setDomains([]);
            });
    }, []);

    // Fetch data when domain changes
    useEffect(() => {
        if (!selectedDomain) {
            // No domain selected, show empty state
            setStats({
                totalRequests: 0,
                allowedRequests: 0,
                blockedRequests: 0,
                challengedRequests: 0,
                avgLatency: 0,
                healthyBackends: 0,
                totalBackends: 0,
            });
            setTrafficData([]);
            setBackends([]);
            setLoading(false);
            setTrafficLoading(false);
            setBackendsLoading(false);
            return;
        }

        setLoading(true);
        setTrafficLoading(true);
        setBackendsLoading(true);

        const domainParam = `&domain=${encodeURIComponent(selectedDomain)}`;
        
        // Fetch dashboard stats
        console.log('[Dashboard] Fetching stats for domain:', selectedDomain);
        fetch(`/api/metrics/stats?hours=1${domainParam}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                console.log('[Dashboard] Stats received:', {
                    domain: selectedDomain,
                    totalRequests: data.totalRequests,
                    allowed: data.allowedRequests,
                    blocked: data.blockedRequests,
                    challenged: data.challengedRequests,
                    throttled: data.throttledRequests,
                });
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
                console.error('[Dashboard] Failed to fetch stats:', error);
                // Set stats to zero on error to show something
                setStats({
                    totalRequests: 0,
                    allowedRequests: 0,
                    blockedRequests: 0,
                    challengedRequests: 0,
                    avgLatency: 0,
                    healthyBackends: 0,
                    totalBackends: 0,
                });
                setLoading(false);
            });

        // Fetch backend health - ping each backend in real-time
        fetch(`/api/admin/backends/health-check?domain=${encodeURIComponent(selectedDomain)}`)
            .then(res => res.json())
            .then(data => {
                const backendList = data.backends || [];
                setBackends(backendList);
                setStats(prev => ({
                    ...prev,
                    healthyBackends: backendList.filter((b: BackendStatus) => b.healthy).length,
                    totalBackends: backendList.length,
                }));
                setBackendsLoading(false);
            })
            .catch((error) => {
                console.error('Failed to fetch backend health:', error);
                setBackends([]);
                setBackendsLoading(false);
            });

        // Fetch traffic data
        fetch(`/api/metrics/traffic?${domainParam.replace('&', '')}`)
            .then(res => res.json())
            .then(data => {
                setTrafficData(data.data || []);
                setTrafficLoading(false);
            })
            .catch((error) => {
                console.error('Failed to fetch traffic data:', error);
                setTrafficLoading(false);
            });
    }, [selectedDomain]);

    const handleCreateDomain = async () => {
        if (!newDomain.trim()) return;
        
        setCreatingDomain(true);
        try {
            const res = await fetch('/api/admin/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: newDomain.trim() }),
            });

            if (res.ok) {
                const data = await res.json();
                setDomains(prev => [...prev, data.domain]);
                setSelectedDomain(data.domain);
                setNewDomain('');
                setShowCreateDomain(false);
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to create domain');
            }
        } catch (error) {
            console.error('Failed to create domain:', error);
            alert('Failed to create domain');
        } finally {
            setCreatingDomain(false);
        }
    };

    const chartConfig: ChartConfig = {
        total: {
            label: "Total",
            color: "var(--chart-1)",
        },
        allow: {
            label: "Allowed",
            color: "#22c55e", // green-500
        },
        block: {
            label: "Blocked",
            color: "#ef4444", // red-500
        },
        challenge: {
            label: "Challenged",
            color: "#eab308", // yellow-500
        },
        throttle: {
            label: "Throttled",
            color: "#f97316", // orange-500
        },
    };

    // Format data for chart - format time labels
    const chartData = trafficData.map(point => ({
        ...point,
        timeLabel: new Date(point.time).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        }),
    }));

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Real-time load balancer metrics and insights</p>
                </div>
                
                {/* Domain Selector */}
                <div className="flex items-center gap-2">
                    <Label htmlFor="domain-select" className="text-sm">Domain:</Label>
                    <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={domains.length === 0}>
                        <SelectTrigger id="domain-select" className="w-[200px]">
                            <SelectValue placeholder={domains.length === 0 ? "No domains" : "Select domain"} />
                        </SelectTrigger>
                        {domains.length > 0 && (
                            <SelectContent>
                                {domains.map(domain => (
                                    <SelectItem key={domain} value={domain}>
                                        {domain}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        )}
                    </Select>
                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowCreateDomain(!showCreateDomain)}
                    >
                        {showCreateDomain ? 'Cancel' : '+ New Domain'}
                    </Button>
                </div>
            </div>

            {/* Create Domain Form */}
            {showCreateDomain && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Domain</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <Label htmlFor="new-domain">Domain Name</Label>
                                <Input
                                    id="new-domain"
                                    placeholder="api.example.com"
                                    value={newDomain}
                                    onChange={(e) => setNewDomain(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleCreateDomain();
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    After creating, point your domain's CNAME to this load balancer
                                </p>
                            </div>
                            <Button 
                                onClick={handleCreateDomain}
                                disabled={!newDomain.trim() || creatingDomain}
                            >
                                {creatingDomain ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Requests"
                    value={loading ? '...' : formatNumber(stats.totalRequests)}
                    trend=""
                    trendUp={true}
                    icon={BarChart3}
                />
                <StatCard
                    label="Blocked"
                    value={loading ? '...' : formatNumber(stats.blockedRequests)}
                    trend=""
                    trendUp={false}
                    icon={Shield}
                    color="red"
                />
                <StatCard
                    label="Challenged"
                    value={loading ? '...' : formatNumber(stats.challengedRequests)}
                    trend=""
                    trendUp={true}
                    icon={Lock}
                    color="yellow"
                />
                <StatCard
                    label="Avg Latency"
                    value={loading ? '...' : `${stats.avgLatency}ms`}
                    trend=""
                    trendUp={false}
                    icon={Zap}
                    color="green"
                />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Traffic Overview Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Traffic Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {trafficLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                            </div>
                        ) : chartData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="fillAllow" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-allow)" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="var(--color-allow)" stopOpacity={0.1}/>
                                        </linearGradient>
                                        <linearGradient id="fillBlock" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-block)" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="var(--color-block)" stopOpacity={0.1}/>
                                        </linearGradient>
                                        <linearGradient id="fillChallenge" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-challenge)" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="var(--color-challenge)" stopOpacity={0.1}/>
                                        </linearGradient>
                                        <linearGradient id="fillThrottle" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-throttle)" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="var(--color-throttle)" stopOpacity={0.1}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                    <XAxis
                                        dataKey="timeLabel"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) => value}
                                        className="text-xs"
                                    />
                                    <ChartTooltip 
                                        content={
                                            <ChartTooltipContent 
                                                labelKey="timeLabel"
                                                indicator="dot"
                                            />
                                        }
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="allow"
                                        stackId="1"
                                        stroke="var(--color-allow)"
                                        fill="url(#fillAllow)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="challenge"
                                        stackId="1"
                                        stroke="var(--color-challenge)"
                                        fill="url(#fillChallenge)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="throttle"
                                        stackId="1"
                                        stroke="var(--color-throttle)"
                                        fill="url(#fillThrottle)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="block"
                                        stackId="1"
                                        stroke="var(--color-block)"
                                        fill="url(#fillBlock)"
                                    />
                                </AreaChart>
                            </ChartContainer>
                        ) : (
                            <div className="text-center text-muted-foreground py-8">
                                <div className="flex justify-center mb-2">
                                    <BarChart3 className="w-12 h-12 text-muted-foreground" />
                                </div>
                                <p className="text-sm">No traffic data yet</p>
                                <p className="text-xs mt-1">Traffic will appear here as requests are processed</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Backend Health */}
                <Card>
                    <CardHeader>
                        <CardTitle>Backend Health</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {backendsLoading ? (
                            <div className="flex items-center justify-center h-32">
                                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                            </div>
                        ) : backends.length > 0 ? (
                            backends.map((backend) => (
                                <BackendRow key={backend.backendId} backend={backend} />
                            ))
                        ) : (
                            <div className="text-center text-muted-foreground py-8">
                                <div className="flex justify-center mb-2">
                                    <Search className="w-12 h-12 text-muted-foreground" />
                                </div>
                                <p className="text-sm">No backends configured</p>
                                <p className="text-xs mt-1">Configure backends in the Policies page</p>
                            </div>
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
    icon: Icon,
    color = 'blue'
}: {
    label: string;
    value: string;
    trend: string;
    trendUp: boolean;
    icon: React.ComponentType<{ className?: string }>;
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
                    <Icon className="w-6 h-6 text-muted-foreground" />
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
    const latencyDisplay = backend.timedOut 
        ? 'Timeout' 
        : backend.latencyMs !== null 
            ? `${Math.round(backend.latencyMs)}ms` 
            : 'N/A';

    return (
        <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${backend.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{backend.backendId}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className={`text-sm ${backend.timedOut ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {latencyDisplay}
                </span>
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
