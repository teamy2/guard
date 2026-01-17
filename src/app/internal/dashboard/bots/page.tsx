'use client';

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
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Bot Guard
                </h1>
                <p className="text-gray-400 mt-1">Bot detection metrics and scoring analysis</p>
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
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Top Detection Reasons</h3>
                <div className="space-y-4">
                    {botReasons.map((reason) => (
                        <ReasonBar key={reason.rule} {...reason} />
                    ))}
                </div>
            </div>

            {/* Actions Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                    <h3 className="text-lg font-semibold mb-4">Actions Taken</h3>
                    <div className="space-y-3">
                        <ActionRow label="Allowed" count={118420} icon="✅" />
                        <ActionRow label="Blocked" count={1200} icon="🚫" />
                        <ActionRow label="Challenged" count={232} icon="🔐" />
                        <ActionRow label="Throttled" count={98} icon="⏱️" />
                        <ActionRow label="Rerouted" count={45} icon="↪️" />
                    </div>
                </div>

                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                    <h3 className="text-lg font-semibold mb-4">Configuration</h3>
                    <div className="space-y-4">
                        <ConfigRow label="Heuristics" status="enabled" />
                        <ConfigRow label="AI Classifier" status="disabled" />
                        <ConfigRow label="Challenge Mode" status="enabled" />
                        <div className="pt-4 border-t border-gray-800">
                            <h4 className="text-sm text-gray-400 mb-2">Thresholds</h4>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-green-400">Low</div>
                                    <div className="text-gray-300">0.3</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-yellow-400">Med</div>
                                    <div className="text-gray-300">0.6</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-red-400">High</div>
                                    <div className="text-gray-300">0.85</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sentry Link */}
            <a
                href="https://sentry.io/issues/?query=tag%3Amodule%3Abot-guard"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20 p-6 hover:border-purple-500/40 transition-colors"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold">View Bot Guard Issues in Sentry</h3>
                        <p className="text-sm text-gray-400 mt-1">See errors and exceptions related to bot detection</p>
                    </div>
                    <span className="text-2xl">→</span>
                </div>
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
        green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
        yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20 text-yellow-400',
        red: 'from-red-500/20 to-red-600/5 border-red-500/20 text-red-400',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-5`}>
            <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{label}</span>
                <span className="text-sm text-gray-400">{score}</span>
            </div>
            <div className="text-3xl font-bold">{count.toLocaleString()}</div>
            <div className="text-sm text-gray-400 mt-1">{percentage}% of traffic</div>
        </div>
    );
}

function ReasonBar({ rule, count, percentage }: { rule: string; count: number; percentage: number }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <code className="text-sm bg-gray-800 px-2 py-0.5 rounded">{rule}</code>
                <span className="text-sm text-gray-400">{count.toLocaleString()} ({percentage}%)</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                    style={{ width: `${percentage * 2}%` }}
                />
            </div>
        </div>
    );
}

function ActionRow({ label, count, icon }: { label: string; count: number; icon: string }) {
    return (
        <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg">
            <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span>{label}</span>
            </div>
            <span className="font-medium">{count.toLocaleString()}</span>
        </div>
    );
}

function ConfigRow({ label, status }: { label: string; status: 'enabled' | 'disabled' }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-gray-300">{label}</span>
            <span className={`text-xs px-2 py-1 rounded ${status === 'enabled'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                {status}
            </span>
        </div>
    );
}
