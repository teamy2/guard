'use client';

import { useState, useEffect } from 'react';
import type { GlobalConfig, Backend, RoutePolicy, LoadBalancerStrategy } from '@/config/schema';

type Tab = 'view' | 'builder' | 'json';

const STRATEGIES: LoadBalancerStrategy[] = [
    'weighted-round-robin',
    'latency-aware',
    'health-aware',
    'sticky',
    'random',
];

const BOT_ACTIONS = ['allow', 'challenge', 'throttle', 'block', 'reroute'] as const;
const KEY_TYPES = ['ip', 'subnet', 'session', 'endpoint', 'composite'] as const;

function createDefaultConfig(): GlobalConfig {
    const now = new Date().toISOString();
    return {
        version: '1.0.0',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        backends: [],
        policies: [],
        defaultRateLimit: {
            enabled: true,
            windowMs: 60000,
            maxRequests: 100,
            keyType: 'ip',
            subnetMask: 24,
            retryAfterMs: 60000,
        },
        defaultBotGuard: {
            enabled: true,
            thresholds: { low: 0.3, medium: 0.6, high: 0.85 },
            actions: { low: 'allow', medium: 'challenge', high: 'block' },
            useAiClassifier: false,
            aiTimeoutMs: 50,
        },
        defaultStrategy: 'weighted-round-robin',
        telemetrySampleRate: 0.1,
        challengePageUrl: '/challenge',
    };
}

function createDefaultBackend(): Backend {
    return {
        id: `backend-${Date.now()}`,
        name: 'New Backend',
        url: 'https://api.example.com',
        weight: 100,
        healthEndpoint: '/health',
        enabled: true,
    };
}

function createDefaultPolicy(backendIds: string[]): RoutePolicy {
    return {
        id: `policy-${Date.now()}`,
        name: 'New Policy',
        priority: 0,
        pathPattern: '/**',
        strategy: 'weighted-round-robin',
        backendIds: backendIds,
        enabled: true,
    };
}

export default function PoliciesPage() {
    const [config, setConfig] = useState<GlobalConfig>(createDefaultConfig());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('view');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [apiKey, setApiKey] = useState('');

    useEffect(() => {
        // Initial load (public or cached check)
        // fetchConfig();
    }, []);

    const fetchConfig = async (key?: string) => {
        setLoading(true);
        setError('');
        try {
            const headers: Record<string, string> = {};
            if (key) {
                headers['Authorization'] = `Bearer ${key}`;
            }

            const res = await fetch('/api/admin/config', { headers });

            if (!res.ok) {
                if (res.status === 401) {
                    throw new Error('Unauthorized: Please provide a valid Admin API Key');
                }
                throw new Error(`Failed to load config: ${res.statusText}`);
            }

            const data = await res.json();
            if (data.config) {
                setConfig(data.config);
                setSuccess('Configuration loaded successfully');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load config');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!apiKey) {
            setError('API key is required to save');
            return;
        }

        setError('');
        setSuccess('');
        setSaving(true);

        try {
            const toSave = {
                ...config,
                updatedAt: new Date().toISOString(),
            };

            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(toSave),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccess('Configuration saved successfully!');
                setConfig(toSave);
            } else {
                setError(data.error || 'Failed to save configuration');
            }
        } catch (e) {
            setError('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    // Backend management
    const addBackend = () => {
        setConfig(prev => ({
            ...prev,
            backends: [...prev.backends, createDefaultBackend()],
        }));
    };

    const removeBackend = (id: string) => {
        setConfig(prev => ({
            ...prev,
            backends: prev.backends.filter(b => b.id !== id),
            policies: prev.policies.map(p => ({
                ...p,
                backendIds: p.backendIds.filter(bid => bid !== id),
            })),
        }));
    };

    const updateBackend = (id: string, updates: Partial<Backend>) => {
        setConfig(prev => ({
            ...prev,
            backends: prev.backends.map(b =>
                b.id === id ? { ...b, ...updates } : b
            ),
        }));
    };

    // Policy management
    const addPolicy = () => {
        setConfig(prev => ({
            ...prev,
            policies: [...prev.policies, createDefaultPolicy(prev.backends.map(b => b.id))],
        }));
    };

    const removePolicy = (id: string) => {
        setConfig(prev => ({
            ...prev,
            policies: prev.policies.filter(p => p.id !== id),
        }));
    };

    const updatePolicy = (id: string, updates: Partial<RoutePolicy>) => {
        setConfig(prev => ({
            ...prev,
            policies: prev.policies.map(p =>
                p.id === id ? { ...p, ...updates } : p
            ),
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Policies
                    </h1>
                    <p className="text-gray-400 mt-1">Manage route policies and configuration</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Admin API Key"
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 w-48"
                        />
                        <button
                            onClick={() => fetchConfig(apiKey)}
                            disabled={loading || !apiKey}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Load
                        </button>
                    </div>

                    <div className="h-6 w-px bg-gray-800 mx-1"></div>

                    <span className="text-sm text-gray-400">
                        v<code className="bg-gray-800 px-2 py-0.5 rounded">{config.version}</code>
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${config.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                        {config.status}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900/50 p-1 rounded-lg w-fit">
                {(['view', 'builder', 'json'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
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

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
            ) : (
                <>
                    {activeTab === 'view' && <ViewTab config={config} />}
                    {activeTab === 'builder' && (
                        <BuilderTab
                            config={config}
                            setConfig={setConfig}
                            addBackend={addBackend}
                            removeBackend={removeBackend}
                            updateBackend={updateBackend}
                            addPolicy={addPolicy}
                            removePolicy={removePolicy}
                            updatePolicy={updatePolicy}
                        />
                    )}
                    {activeTab === 'json' && (
                        <JsonTab config={config} setConfig={setConfig} />
                    )}

                    {/* Save Section - shown in builder and json tabs */}
                    {(activeTab === 'builder' || activeTab === 'json') && (
                        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 flex items-center gap-4">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter ADMIN_API_KEY"
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving || !apiKey}
                                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                            >
                                {saving ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ================== VIEW TAB ==================
function ViewTab({ config }: { config: GlobalConfig }) {
    return (
        <div className="space-y-6">
            <Section title="Backends">
                {config.backends.length === 0 ? (
                    <p className="text-gray-500 text-sm">No backends configured</p>
                ) : (
                    <div className="space-y-2">
                        {config.backends.map(b => (
                            <div key={b.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <StatusDot enabled={b.enabled} />
                                    <div>
                                        <div className="font-medium">{b.name}</div>
                                        <div className="text-sm text-gray-400">{b.url}</div>
                                    </div>
                                </div>
                                <span className="text-sm text-gray-400">Weight: {b.weight}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Policies">
                {config.policies.length === 0 ? (
                    <p className="text-gray-500 text-sm">No policies configured</p>
                ) : (
                    <div className="space-y-3">
                        {config.policies.map(p => (
                            <div key={p.id} className="p-3 bg-gray-800/30 rounded-lg">
                                <div className="flex items-center gap-3 mb-2">
                                    <StatusDot enabled={p.enabled} />
                                    <span className="font-medium">{p.name}</span>
                                    <code className="text-xs bg-gray-700 px-2 py-0.5 rounded">{p.pathPattern}</code>
                                    <span className="text-xs text-gray-500">Priority: {p.priority}</span>
                                </div>
                                <div className="text-sm text-gray-400">
                                    Strategy: {p.strategy} • Backends: {p.backendIds.join(', ') || 'none'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}

// ================== BUILDER TAB ==================
interface BuilderProps {
    config: GlobalConfig;
    setConfig: React.Dispatch<React.SetStateAction<GlobalConfig>>;
    addBackend: () => void;
    removeBackend: (id: string) => void;
    updateBackend: (id: string, updates: Partial<Backend>) => void;
    addPolicy: () => void;
    removePolicy: (id: string) => void;
    updatePolicy: (id: string, updates: Partial<RoutePolicy>) => void;
}

function BuilderTab({
    config,
    setConfig,
    addBackend,
    removeBackend,
    updateBackend,
    addPolicy,
    removePolicy,
    updatePolicy,
}: BuilderProps) {
    return (
        <div className="space-y-6">
            {/* Global Settings */}
            <Section title="Global Settings">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Input
                        label="Version"
                        value={config.version}
                        onChange={(v) => setConfig(prev => ({ ...prev, version: v }))}
                    />
                    <Select
                        label="Status"
                        value={config.status}
                        options={['draft', 'active']}
                        onChange={(v) => setConfig(prev => ({ ...prev, status: v as 'draft' | 'active' }))}
                    />
                    <Select
                        label="Default Strategy"
                        value={config.defaultStrategy}
                        options={STRATEGIES}
                        onChange={(v) => setConfig(prev => ({ ...prev, defaultStrategy: v as LoadBalancerStrategy }))}
                    />
                    <Input
                        label="Telemetry Sample Rate"
                        type="number"
                        value={String(config.telemetrySampleRate)}
                        onChange={(v) => setConfig(prev => ({ ...prev, telemetrySampleRate: parseFloat(v) || 0.1 }))}
                    />
                </div>
            </Section>

            {/* Backends */}
            <Section
                title="Backends"
                action={<AddButton onClick={addBackend} label="Add Backend" />}
            >
                {config.backends.length === 0 ? (
                    <p className="text-gray-500 text-sm">No backends. Click &quot;Add Backend&quot; to create one.</p>
                ) : (
                    <div className="space-y-4">
                        {config.backends.map(backend => (
                            <div key={backend.id} className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                                <div className="flex justify-between mb-3">
                                    <span className="font-medium">{backend.name || 'Unnamed'}</span>
                                    <button
                                        onClick={() => removeBackend(backend.id)}
                                        className="text-red-400 hover:text-red-300 text-sm"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <Input
                                        label="ID"
                                        value={backend.id}
                                        onChange={(v) => updateBackend(backend.id, { id: v })}
                                    />
                                    <Input
                                        label="Name"
                                        value={backend.name}
                                        onChange={(v) => updateBackend(backend.id, { name: v })}
                                    />
                                    <Input
                                        label="URL"
                                        value={backend.url}
                                        onChange={(v) => updateBackend(backend.id, { url: v })}
                                    />
                                    <Input
                                        label="Weight"
                                        type="number"
                                        value={String(backend.weight)}
                                        onChange={(v) => updateBackend(backend.id, { weight: parseInt(v) || 1 })}
                                    />
                                    <Input
                                        label="Health Endpoint"
                                        value={backend.healthEndpoint}
                                        onChange={(v) => updateBackend(backend.id, { healthEndpoint: v })}
                                    />
                                    <Checkbox
                                        label="Enabled"
                                        checked={backend.enabled}
                                        onChange={(v) => updateBackend(backend.id, { enabled: v })}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Policies */}
            <Section
                title="Policies"
                action={<AddButton onClick={addPolicy} label="Add Policy" />}
            >
                {config.policies.length === 0 ? (
                    <p className="text-gray-500 text-sm">No policies. Click &quot;Add Policy&quot; to create one.</p>
                ) : (
                    <div className="space-y-4">
                        {config.policies.map(policy => (
                            <div key={policy.id} className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                                <div className="flex justify-between mb-3">
                                    <span className="font-medium">{policy.name || 'Unnamed'}</span>
                                    <button
                                        onClick={() => removePolicy(policy.id)}
                                        className="text-red-400 hover:text-red-300 text-sm"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <Input
                                        label="ID"
                                        value={policy.id}
                                        onChange={(v) => updatePolicy(policy.id, { id: v })}
                                    />
                                    <Input
                                        label="Name"
                                        value={policy.name}
                                        onChange={(v) => updatePolicy(policy.id, { name: v })}
                                    />
                                    <Input
                                        label="Path Pattern"
                                        value={policy.pathPattern}
                                        onChange={(v) => updatePolicy(policy.id, { pathPattern: v })}
                                    />
                                    <Input
                                        label="Priority"
                                        type="number"
                                        value={String(policy.priority)}
                                        onChange={(v) => updatePolicy(policy.id, { priority: parseInt(v) || 0 })}
                                    />
                                    <Select
                                        label="Strategy"
                                        value={policy.strategy}
                                        options={STRATEGIES}
                                        onChange={(v) => updatePolicy(policy.id, { strategy: v as LoadBalancerStrategy })}
                                    />
                                    <Checkbox
                                        label="Enabled"
                                        checked={policy.enabled}
                                        onChange={(v) => updatePolicy(policy.id, { enabled: v })}
                                    />
                                </div>
                                <div className="mt-3">
                                    <label className="block text-xs text-gray-400 mb-1">Backends</label>
                                    <div className="flex flex-wrap gap-2">
                                        {config.backends.map(b => (
                                            <label key={b.id} className="flex items-center gap-1.5 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={policy.backendIds.includes(b.id)}
                                                    onChange={(e) => {
                                                        const newIds = e.target.checked
                                                            ? [...policy.backendIds, b.id]
                                                            : policy.backendIds.filter(id => id !== b.id);
                                                        updatePolicy(policy.id, { backendIds: newIds });
                                                    }}
                                                    className="rounded bg-gray-700 border-gray-600"
                                                />
                                                {b.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Default Rate Limit */}
            <Section title="Default Rate Limit">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Checkbox
                        label="Enabled"
                        checked={config.defaultRateLimit.enabled}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultRateLimit: { ...prev.defaultRateLimit, enabled: v }
                        }))}
                    />
                    <Input
                        label="Window (ms)"
                        type="number"
                        value={String(config.defaultRateLimit.windowMs)}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultRateLimit: { ...prev.defaultRateLimit, windowMs: parseInt(v) || 60000 }
                        }))}
                    />
                    <Input
                        label="Max Requests"
                        type="number"
                        value={String(config.defaultRateLimit.maxRequests)}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultRateLimit: { ...prev.defaultRateLimit, maxRequests: parseInt(v) || 100 }
                        }))}
                    />
                    <Select
                        label="Key Type"
                        value={config.defaultRateLimit.keyType}
                        options={[...KEY_TYPES]}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultRateLimit: { ...prev.defaultRateLimit, keyType: v as typeof KEY_TYPES[number] }
                        }))}
                    />
                </div>
            </Section>

            {/* Default Bot Guard */}
            <Section title="Default Bot Guard">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Checkbox
                        label="Enabled"
                        checked={config.defaultBotGuard.enabled}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: { ...prev.defaultBotGuard, enabled: v }
                        }))}
                    />
                    <Checkbox
                        label="Use AI Classifier"
                        checked={config.defaultBotGuard.useAiClassifier}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: { ...prev.defaultBotGuard, useAiClassifier: v }
                        }))}
                    />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                    <Input
                        label="Low Threshold"
                        type="number"
                        value={String(config.defaultBotGuard.thresholds.low)}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                thresholds: { ...prev.defaultBotGuard.thresholds, low: parseFloat(v) || 0.3 }
                            }
                        }))}
                    />
                    <Input
                        label="Medium Threshold"
                        type="number"
                        value={String(config.defaultBotGuard.thresholds.medium)}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                thresholds: { ...prev.defaultBotGuard.thresholds, medium: parseFloat(v) || 0.6 }
                            }
                        }))}
                    />
                    <Input
                        label="High Threshold"
                        type="number"
                        value={String(config.defaultBotGuard.thresholds.high)}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                thresholds: { ...prev.defaultBotGuard.thresholds, high: parseFloat(v) || 0.85 }
                            }
                        }))}
                    />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                    <Select
                        label="Low Action"
                        value={config.defaultBotGuard.actions.low}
                        options={[...BOT_ACTIONS]}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                actions: { ...prev.defaultBotGuard.actions, low: v as typeof BOT_ACTIONS[number] }
                            }
                        }))}
                    />
                    <Select
                        label="Medium Action"
                        value={config.defaultBotGuard.actions.medium}
                        options={[...BOT_ACTIONS]}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                actions: { ...prev.defaultBotGuard.actions, medium: v as typeof BOT_ACTIONS[number] }
                            }
                        }))}
                    />
                    <Select
                        label="High Action"
                        value={config.defaultBotGuard.actions.high}
                        options={[...BOT_ACTIONS]}
                        onChange={(v) => setConfig(prev => ({
                            ...prev,
                            defaultBotGuard: {
                                ...prev.defaultBotGuard,
                                actions: { ...prev.defaultBotGuard.actions, high: v as typeof BOT_ACTIONS[number] }
                            }
                        }))}
                    />
                </div>
            </Section>
        </div>
    );
}

// ================== JSON TAB ==================
function JsonTab({
    config,
    setConfig
}: {
    config: GlobalConfig;
    setConfig: React.Dispatch<React.SetStateAction<GlobalConfig>>;
}) {
    const [text, setText] = useState(JSON.stringify(config, null, 2));
    const [parseError, setParseError] = useState('');

    useEffect(() => {
        setText(JSON.stringify(config, null, 2));
    }, [config]);

    const handleChange = (value: string) => {
        setText(value);
        try {
            const parsed = JSON.parse(value);
            setConfig(parsed);
            setParseError('');
        } catch {
            setParseError('Invalid JSON');
        }
    };

    return (
        <div className="space-y-4">
            {parseError && (
                <div className="text-red-400 text-sm">{parseError}</div>
            )}
            <textarea
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                className="w-full h-[500px] bg-gray-800 border border-gray-700 rounded-lg p-4 font-mono text-sm focus:outline-none focus:border-blue-500 resize-none"
                spellCheck={false}
            />
        </div>
    );
}

// ================== COMPONENTS ==================
function Section({
    title,
    children,
    action
}: {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{title}</h3>
                {action}
            </div>
            {children}
        </div>
    );
}

function Input({
    label,
    value,
    onChange,
    type = 'text'
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
}) {
    return (
        <div>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
        </div>
    );
}

function Select({
    label,
    value,
    options,
    onChange
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </div>
    );
}

function Checkbox({
    label,
    checked,
    onChange
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600"
            />
            {label}
        </label>
    );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors"
        >
            <span className="text-lg leading-none">+</span>
            {label}
        </button>
    );
}

function StatusDot({ enabled }: { enabled: boolean }) {
    return (
        <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
    );
}
