'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Ban, Lock, Timer, ArrowRight } from "lucide-react";

interface BotStats {
    scoreBuckets: { bucket: string; count: number; percentage: number }[];
    topReasons: { rule: string; count: number; percentage: number }[];
    actions: Record<string, number>;
    config?: {
        heuristics: boolean;
        aiClassifier: boolean;
        challengeMode: boolean;
        thresholds: { low: number; medium: number; high: number };
    };
}

export default function BotsPage() {
    const [stats, setStats] = useState<BotStats>({
        scoreBuckets: [],
        topReasons: [],
        actions: {},
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/metrics/bots?hours=1')
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error('Failed to fetch bot stats:', error);
                setLoading(false);
            });
    }, []);

    // Map bucket names to display labels
    const bucketLabels: Record<string, { label: string; score: string; color: 'green' | 'yellow' | 'red' }> = {
        low: { label: 'Low Risk', score: '0 - 0.3', color: 'green' },
        medium: { label: 'Medium Risk', score: '0.3 - 0.6', color: 'yellow' },
        high: { label: 'High Risk', score: '0.6 - 1.0', color: 'red' },
    };

    // Calculate total for percentages
    const totalRequests = stats.scoreBuckets.reduce((sum, b) => sum + b.count, 0);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bot Guard</h1>
                <p className="text-muted-foreground mt-1">Bot detection metrics and scoring analysis</p>
            </div>

            {/* Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {loading ? (
                    <>
                        <div className="h-32 bg-muted animate-pulse rounded-lg" />
                        <div className="h-32 bg-muted animate-pulse rounded-lg" />
                        <div className="h-32 bg-muted animate-pulse rounded-lg" />
                    </>
                ) : (
                    ['low', 'medium', 'high'].map((bucket) => {
                        const bucketData = stats.scoreBuckets.find(b => b.bucket === bucket);
                        const labelData = bucketLabels[bucket] || { label: bucket, score: '', color: 'green' as const };
                        return (
                            <ScoreBucket
                                key={bucket}
                                label={labelData.label}
                                score={labelData.score}
                                count={bucketData?.count || 0}
                                percentage={totalRequests > 0 ? bucketData?.percentage || 0 : 0}
                                color={labelData.color}
                            />
                        );
                    })
                )}
            </div>

            {/* Top Detection Reasons */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Detection Reasons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                            ))}
                        </div>
                    ) : stats.topReasons.length > 0 ? (
                        stats.topReasons.map((reason) => (
                            <ReasonBar key={reason.rule} {...reason} />
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            No bot detection reasons recorded yet.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Actions Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Actions Taken</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                                ))}
                            </div>
                        ) : (
                            <>
                                <ActionRow label="Allowed" count={stats.actions.allow || 0} icon={CheckCircle2} />
                                <ActionRow label="Blocked" count={stats.actions.block || 0} icon={Ban} />
                                <ActionRow label="Challenged" count={stats.actions.challenge || 0} icon={Lock} />
                                <ActionRow label="Throttled" count={stats.actions.throttle || 0} icon={Timer} />
                                <ActionRow label="Rerouted" count={stats.actions.reroute || 0} icon={ArrowRight} />
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                                ))}
                            </div>
                        ) : stats.config ? (
                            <>
                                <ConfigRow label="Heuristics" status={stats.config.heuristics ? "enabled" : "disabled"} />
                                <ConfigRow label="AI Classifier" status={stats.config.aiClassifier ? "enabled" : "disabled"} />
                                <ConfigRow label="Challenge Mode" status={stats.config.challengeMode ? "enabled" : "disabled"} />
                                <div className="pt-4 border-t">
                                    <h4 className="text-sm text-muted-foreground mb-2">Thresholds</h4>
                                    <div className="grid grid-cols-3 gap-2 text-sm">
                                        <div className="bg-muted/50 rounded p-2 text-center border">
                                            <div className="text-green-500 font-medium">Low</div>
                                            <div className="text-muted-foreground">{stats.config.thresholds.low}</div>
                                        </div>
                                        <div className="bg-muted/50 rounded p-2 text-center border">
                                            <div className="text-yellow-500 font-medium">Med</div>
                                            <div className="text-muted-foreground">{stats.config.thresholds.medium}</div>
                                        </div>
                                        <div className="bg-muted/50 rounded p-2 text-center border">
                                            <div className="text-red-500 font-medium">High</div>
                                            <div className="text-muted-foreground">{stats.config.thresholds.high}</div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-muted-foreground py-4">
                                Configuration not available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Sentry Link */}
            <a
                href="https://sentry.io/issues/?query=tag%3Amodule%3Abot-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                <Card className="hover:bg-muted/50 transition-colors border-primary/20 bg-primary/5">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-primary">View Bot Guard Issues in Sentry</h3>
                            <p className="text-sm text-muted-foreground mt-1">See errors and exceptions related to bot detection</p>
                        </div>
                        <span className="text-2xl text-primary">→</span>
                    </CardContent>
                </Card>
            </a>
        </div>
    );
}

function ScoreBucket({
    label,
    score,
    count,
    percentage,
    color
}: {
    label: string;
    score: string;
    count: number;
    percentage: number;
    color: 'green' | 'yellow' | 'red';
}) {
    const colorClasses = {
        green: 'border-green-500/20 text-green-500 bg-green-500/5',
        yellow: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5',
        red: 'border-red-500/20 text-red-500 bg-red-500/5',
    };

    return (
        <Card className={`border ${colorClasses[color]}`}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{label}</span>
                    <span className="text-sm opacity-80">{score}</span>
                </div>
                <div className="text-3xl font-bold">{count.toLocaleString()}</div>
                <div className="text-sm opacity-80 mt-1">{percentage.toFixed(2)}% of traffic</div>
            </CardContent>
        </Card>
    );
}

function ReasonBar({ rule, count, percentage }: { rule: string; count: number; percentage: number }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <code className="text-sm bg-muted px-2 py-0.5 rounded text-foreground">{rule}</code>
                <span className="text-sm text-muted-foreground">{count.toLocaleString()} ({percentage.toFixed(2)}%)</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${percentage * 2}%` }}
                />
            </div>
        </div>
    );
}

function ActionRow({ label, count, icon: Icon }: { label: string; count: number; icon: React.ComponentType<{ className?: string }> }) {
    return (
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <span className="text-sm text-muted-foreground">{count.toLocaleString()}</span>
        </div>
    );
}

function ConfigRow({ label, status }: { label: string; status: 'enabled' | 'disabled' }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{label}</span>
            <Badge variant={status === 'enabled' ? "default" : "secondary"} className={status === 'enabled' ? "bg-green-500 hover:bg-green-600" : ""}>
                {status}
            </Badge>
        </div>
    );
}
