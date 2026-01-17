'use client';

import { useState, useEffect } from 'react';
import type { GlobalConfig } from '@/config/schema';

export default function PoliciesPage() {
    const [config, setConfig] = useState<GlobalConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [jsonText, setJsonText] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [apiKey, setApiKey] = useState('');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/admin/config');
            const data = await res.json();
            setConfig(data.config);
            setJsonText(JSON.stringify(data.config, null, 2));
            setLoading(false);
        } catch {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!apiKey) {
            setError('API key is required');
            return;
        }

        setError('');
        setSuccess('');
        setSaving(true);

        try {
            // Parse and validate JSON
            const parsed = JSON.parse(jsonText);

            // Update timestamps
            parsed.updatedAt = new Date().toISOString();
            if (!parsed.createdAt) {
                parsed.createdAt = parsed.updatedAt;
            }

            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(parsed),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccess('Configuration saved successfully!');
                setConfig(parsed);
                setEditing(false);
            } else {
                setError(data.error || 'Failed to save configuration');
            }
        } catch (e) {
            setError(e instanceof SyntaxError ? 'Invalid JSON syntax' : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleFormat = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setJsonText(JSON.stringify(parsed, null, 2));
            setError('');
        } catch {
            setError('Invalid JSON - cannot format');
        }
    };

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
                    {/* Editor Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setEditing(false)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!editing
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:text-white'
                                    }`}
                            >
                                View
                            </button>
                            <button
                                onClick={() => setEditing(true)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${editing
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:text-white'
                                    }`}
                            >
                                Edit JSON
                            </button>
                        </div>

                        {editing && (
                            <button
                                onClick={handleFormat}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                            >
                                Format JSON
                            </button>
                        )}
                    </div>

                    {/* Status Messages */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3">
                            {success}
                        </div>
                    )}

                    {editing ? (
                        /* JSON Editor */
                        <div className="space-y-4">
                            {/* API Key Input */}
                            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                                <label className="block text-sm text-gray-400 mb-2">
                                    Admin API Key (required to save)
                                </label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="Enter your ADMIN_API_KEY"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* JSON Editor */}
                            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                                <textarea
                                    value={jsonText}
                                    onChange={(e) => setJsonText(e.target.value)}
                                    className="w-full h-[500px] bg-gray-800 border border-gray-700 rounded-lg p-4 font-mono text-sm focus:outline-none focus:border-blue-500 resize-none"
                                    spellCheck={false}
                                />
                            </div>

                            {/* Save Button */}
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setEditing(false);
                                        setJsonText(JSON.stringify(config, null, 2));
                                        setError('');
                                    }}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* View Mode */
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
                        </>
                    )}
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
