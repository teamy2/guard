'use client';

import { useState, useEffect } from 'react';
import type { GlobalConfig } from '@/config/schema';

export default function PoliciesPage() {
    const [config, setConfig] = useState<GlobalConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/config')
            .then(res => res.json())
            .then(data => {
                setConfig(data.config);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Policies
                    </h1>
                    <p className="text-gray-400 mt-1">Manage route policies and configuration</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">
                        Version: <code className="bg-gray-800 px-2 py-0.5 rounded">{config?.version || 'N/A'}</code>
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${config?.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                        {config?.status || 'loading'}
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
            ) : (
                <>
                    {/* Backends */}
                    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                        <h3 className="text-lg font-semibold mb-4">Backends</h3>
                        <div className="space-y-3">
                            {config?.backends.map((backend) => (
                                <div key={backend.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${backend.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                                        <div>
                                            <div className="font-medium">{backend.name}</div>
                                            <div className="text-sm text-gray-400">{backend.url}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-gray-400">Weight: {backend.weight}</span>
                                        <span className={`text-xs px-2 py-1 rounded ${backend.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
                                            }`}>
                                            {backend.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Route Policies */}
                    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                        <h3 className="text-lg font-semibold mb-4">Route Policies</h3>
                        <div className="space-y-4">
                            {config?.policies.map((policy) => (
                                <div key={policy.id} className="border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${policy.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                                            <span className="font-medium">{policy.name}</span>
                                            <code className="text-xs bg-gray-800 px-2 py-0.5 rounded">{policy.pathPattern}</code>
                                        </div>
                                        <span className="text-sm text-gray-400">Priority: {policy.priority}</span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                        <div className="bg-gray-800/50 rounded p-2">
                                            <div className="text-gray-500 text-xs">Strategy</div>
                                            <div className="mt-1">{policy.strategy}</div>
                                        </div>
                                        <div className="bg-gray-800/50 rounded p-2">
                                            <div className="text-gray-500 text-xs">Rate Limit</div>
                                            <div className="mt-1">{policy.rateLimit?.enabled ? 'Enabled' : 'Disabled'}</div>
                                        </div>
                                        <div className="bg-gray-800/50 rounded p-2">
                                            <div className="text-gray-500 text-xs">Bot Guard</div>
                                            <div className="mt-1">{policy.botGuard?.enabled ? 'Enabled' : 'Disabled'}</div>
                                        </div>
                                        <div className="bg-gray-800/50 rounded p-2">
                                            <div className="text-gray-500 text-xs">Backends</div>
                                            <div className="mt-1">{policy.backendIds.length} configured</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Default Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                            <h3 className="text-lg font-semibold mb-4">Default Rate Limit</h3>
                            <div className="space-y-2 text-sm">
                                <SettingRow label="Window" value={`${config?.defaultRateLimit.windowMs || 60000}ms`} />
                                <SettingRow label="Max Requests" value={String(config?.defaultRateLimit.maxRequests || 100)} />
                                <SettingRow label="Key Type" value={config?.defaultRateLimit.keyType || 'ip'} />
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                            <h3 className="text-lg font-semibold mb-4">Default Bot Guard</h3>
                            <div className="space-y-2 text-sm">
                                <SettingRow label="Enabled" value={config?.defaultBotGuard.enabled ? 'Yes' : 'No'} />
                                <SettingRow label="AI Classifier" value={config?.defaultBotGuard.useAiClassifier ? 'Yes' : 'No'} />
                                <SettingRow label="Low Threshold" value={String(config?.defaultBotGuard.thresholds.low || 0.3)} />
                            </div>
                        </div>
                    </div>

                    {/* Info */}
                    <div className="bg-blue-500/10 rounded-xl border border-blue-500/20 p-6">
                        <h3 className="font-semibold text-blue-400 mb-2">💡 Policy Editor</h3>
                        <p className="text-sm text-gray-400">
                            To edit policies, use the Admin API with your API key.
                            See the documentation for examples of creating and updating configurations.
                        </p>
                        <div className="mt-4">
                            <code className="block bg-gray-900 rounded p-3 text-xs overflow-x-auto">
                                curl -X POST /api/admin/config \<br />
                                &nbsp;&nbsp;-H "Authorization: Bearer YOUR_API_KEY" \<br />
                                &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                                &nbsp;&nbsp;-d '@config.json'
                            </code>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function SettingRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-gray-400">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}
