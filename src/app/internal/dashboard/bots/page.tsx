'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BotsPage() {
    const botReasons = [
        { rule: 'missing_ua', count: 542, percentage: 35 },
        { rule: 'bot_ua_pattern', count: 389, percentage: 25 },
        { rule: 'missing_accept', count: 234, percentage: 15 },
        { rule: 'few_headers', count: 187, percentage: 12 },
        { rule: 'high_frequency', count: 124, percentage: 8 },
        { rule: 'short_ua', count: 78, percentage: 5 },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bot Guard</h1>
                <p className="text-muted-foreground mt-1">Bot detection metrics and scoring analysis</p>
            </div>

            {/* Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ScoreBucket
                    label="Low Risk"
                    score="0 - 0.3"
                    count={118420}
                    percentage={94.4}
                    color="green"
                />
                <ScoreBucket
                    label="Medium Risk"
                    score="0.3 - 0.6"
                    count={5200}
                    percentage={4.1}
                    color="yellow"
                />
                <ScoreBucket
                    label="High Risk"
                    score="0.6 - 1.0"
                    count={1812}
                    percentage={1.5}
                    color="red"
                />
            </div>

            {/* Top Detection Reasons */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Detection Reasons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {botReasons.map((reason) => (
                        <ReasonBar key={reason.rule} {...reason} />
                    ))}
                </CardContent>
            </Card>

            {/* Actions Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Actions Taken</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ActionRow label="Allowed" count={118420} icon="✅" />
                        <ActionRow label="Blocked" count={1200} icon="🚫" />
                        <ActionRow label="Challenged" count={232} icon="🔐" />
                        <ActionRow label="Throttled" count={98} icon="⏱️" />
                        <ActionRow label="Rerouted" count={45} icon="↪️" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ConfigRow label="Heuristics" status="enabled" />
                        <ConfigRow label="AI Classifier" status="disabled" />
                        <ConfigRow label="Challenge Mode" status="enabled" />
                        <div className="pt-4 border-t">
                            <h4 className="text-sm text-muted-foreground mb-2">Thresholds</h4>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <div className="bg-muted/50 rounded p-2 text-center border">
                                    <div className="text-green-500 font-medium">Low</div>
                                    <div className="text-muted-foreground">0.3</div>
                                </div>
                                <div className="bg-muted/50 rounded p-2 text-center border">
                                    <div className="text-yellow-500 font-medium">Med</div>
                                    <div className="text-muted-foreground">0.6</div>
                                </div>
                                <div className="bg-muted/50 rounded p-2 text-center border">
                                    <div className="text-red-500 font-medium">High</div>
                                    <div className="text-muted-foreground">0.85</div>
                                </div>
                            </div>
                        </div>
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
                <div className="text-sm opacity-80 mt-1">{percentage}% of traffic</div>
            </CardContent>
        </Card>
    );
}

function ReasonBar({ rule, count, percentage }: { rule: string; count: number; percentage: number }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <code className="text-sm bg-muted px-2 py-0.5 rounded text-foreground">{rule}</code>
                <span className="text-sm text-muted-foreground">{count.toLocaleString()} ({percentage}%)</span>
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

function ActionRow({ label, count, icon }: { label: string; count: number; icon: string }) {
    return (
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-2">
                <span>{icon}</span>
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
