'use client';

import { useState, useEffect } from 'react';
import type { GlobalConfig, Backend, RoutePolicy, LoadBalancerStrategy } from '@/config/schema';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

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
    const [selectedDomain, setSelectedDomain] = useState<string>('');
    const [domains, setDomains] = useState<string[]>([]);
    const [config, setConfig] = useState<GlobalConfig>(createDefaultConfig());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Fetch user domains on mount
    useEffect(() => {
        fetch('/internal/api/admin/domains')
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

    // Fetch config when domain changes
    useEffect(() => {
        if (selectedDomain) {
            fetchConfig();
        }
    }, [selectedDomain]);

    const fetchConfig = async () => {
        if (!selectedDomain) {
            return;
        }

        setLoading(true);
        setError('');
        try {
            const domainParam = `?domain=${encodeURIComponent(selectedDomain)}`;
            const res = await fetch(`/internal/api/admin/config${domainParam}`);

            if (!res.ok) {
                if (res.status === 401) {
                    throw new Error('Unauthorized: Please sign in');
                }
                if (res.status === 403) {
                    throw new Error('You do not have access to this domain');
                }
                throw new Error(`Failed to load config: ${res.statusText}`);
            }

            const data = await res.json();
            if (data.config) {
                setConfig(data.config);
                setSuccess('Configuration loaded successfully');
            } else {
                // If no config exists, create a default one for this domain
                const defaultConfig = createDefaultConfig();
                defaultConfig.domain = selectedDomain;
                setConfig(defaultConfig);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load config');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setError('');
        setSuccess('');
        setSaving(true);

        try {
            if (!selectedDomain) {
            setError('Please select a domain');
            setSaving(false);
            return;
        }

        const toSave = {
                ...config,
                domain: selectedDomain,
                updatedAt: new Date().toISOString(),
            };

            const res = await fetch('/internal/api/admin/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
                    <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
                    <p className="text-muted-foreground mt-1">Manage route policies and configuration</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => fetchConfig()}
                            disabled={loading}
                            variant="secondary"
                        >
                            Reload
                        </Button>
                    </div>

                    <div className="h-6 w-px bg-border mx-1"></div>

                    <span className="text-sm text-muted-foreground">
                        v<code className="bg-muted px-2 py-0.5 rounded">{config.version}</code>
                    </span>
                    <Badge variant={config.status === 'active' ? 'default' : 'secondary'}>
                        {config.status}
                    </Badge>
                </div>
            </div>

            {/* Status Messages */}
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {success && (
                <Alert className="bg-green-500/10 text-green-500 border-green-500/20">
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            {/* Domain Selector */}
            <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <Label htmlFor="domain-select" className="text-sm font-medium">Domain:</Label>
                    <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                        <SelectTrigger id="domain-select" className="w-[250px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {domains.length === 0 ? (
                                <SelectItem value="" disabled>No domains available</SelectItem>
                            ) : (
                                domains.map(domain => (
                                    <SelectItem key={domain} value={domain}>
                                        {domain}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                    {selectedDomain 
                        ? `Configuring settings for ${selectedDomain}`
                        : 'Please select a domain to configure'
                    }
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                </div>
            ) : (
                <Tabs defaultValue="view" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="view">View</TabsTrigger>
                        <TabsTrigger value="builder">Builder</TabsTrigger>
                        <TabsTrigger value="json">JSON</TabsTrigger>
                    </TabsList>

                    <TabsContent value="view" className="space-y-4">
                        <ViewTab config={config} />
                    </TabsContent>

                    <TabsContent value="builder" className="space-y-4">
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
                        <SaveSection saving={saving} handleSave={handleSave} />
                    </TabsContent>

                    <TabsContent value="json" className="space-y-4">
                        <JsonTab config={config} setConfig={setConfig} />
                        <SaveSection saving={saving} handleSave={handleSave} />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

function SaveSection({ saving, handleSave }: any) {
    return (
        <Card>
            <CardContent className="pt-6 flex items-center gap-4">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
            </CardContent>
        </Card>
    );
}

// ================== VIEW TAB ==================
function ViewTab({ config }: { config: GlobalConfig }) {
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Backends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {config.backends.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No backends configured</p>
                    ) : (
                        config.backends.map(b => (
                            <div key={b.id} className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Badge variant={b.enabled ? "default" : "secondary"} className={b.enabled ? "bg-green-500 hover:bg-green-600" : ""}>
                                        {b.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                    <div>
                                        <div className="font-medium">{b.name}</div>
                                        <div className="text-sm text-muted-foreground">{b.url}</div>
                                    </div>
                                </div>
                                <span className="text-sm text-muted-foreground">Weight: {b.weight}</span>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Policies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {config.policies.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No policies configured</p>
                    ) : (
                        <div className="space-y-3">
                            {config.policies.map(p => (
                                <div key={p.id} className="p-4 border rounded-lg">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Badge variant={p.enabled ? "default" : "secondary"} className={p.enabled ? "bg-green-500 hover:bg-green-600" : ""}>
                                            {p.enabled ? "Enabled" : "Disabled"}
                                        </Badge>
                                        <span className="font-medium">{p.name}</span>
                                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{p.pathPattern}</code>
                                        <span className="text-xs text-muted-foreground">Priority: {p.priority}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Strategy: {p.strategy} • Backends: {p.backendIds.join(', ') || 'none'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
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
            <Card>
                <CardHeader>
                    <CardTitle>Global Settings</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <InputWrapper label="Domain">
                            <Input
                                value={config.domain || selectedDomain || 'Not set'}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Set via domain selector above
                            </p>
                        </InputWrapper>
                        <InputWrapper label="Version">
                            <Input
                                value={config.version}
                                onChange={(e) => setConfig(prev => ({ ...prev, version: e.target.value }))}
                            />
                        </InputWrapper>
                        <InputWrapper label="Status">
                            <Select
                                value={config.status}
                                onValueChange={(v) => setConfig(prev => ({ ...prev, status: v as 'draft' | 'active' }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                </SelectContent>
                            </Select>
                        </InputWrapper>
                        <InputWrapper label="Default Strategy">
                            <Select
                                value={config.defaultStrategy}
                                onValueChange={(v) => setConfig(prev => ({ ...prev, defaultStrategy: v as LoadBalancerStrategy }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STRATEGIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </InputWrapper>
                        <InputWrapper label="Telemetry Sample Rate">
                            <Input
                                type="number"
                                value={String(config.telemetrySampleRate)}
                                onChange={(e) => setConfig(prev => ({ ...prev, telemetrySampleRate: parseFloat(e.target.value) || 0.1 }))}
                            />
                        </InputWrapper>
                    </div>
                </CardContent>
            </Card>

            {/* Backends */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Backends</CardTitle>
                    <Button onClick={addBackend} variant="outline" size="sm">Add Backend</Button>
                </CardHeader>
                <CardContent>
                    {config.backends.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No backends. Click "Add Backend" to create one.</p>
                    ) : (
                        <div className="space-y-4">
                            {config.backends.map(backend => (
                                <div key={backend.id} className="p-4 border rounded-lg space-y-4 relative">
                                    <div className="flex justify-between items-start">
                                        <span className="font-medium text-sm text-muted-foreground">Backend Configuration</span>
                                        <Button
                                            onClick={() => removeBackend(backend.id)}
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8"
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        <InputWrapper label="ID">
                                            <Input
                                                value={backend.id}
                                                onChange={(e) => updateBackend(backend.id, { id: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Name">
                                            <Input
                                                value={backend.name}
                                                onChange={(e) => updateBackend(backend.id, { name: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="URL">
                                            <Input
                                                value={backend.url}
                                                onChange={(e) => updateBackend(backend.id, { url: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Weight">
                                            <Input
                                                type="number"
                                                value={String(backend.weight)}
                                                onChange={(e) => updateBackend(backend.id, { weight: parseInt(e.target.value) || 1 })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Health Endpoint">
                                            <Input
                                                value={backend.healthEndpoint}
                                                onChange={(e) => updateBackend(backend.id, { healthEndpoint: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <div className="flex items-end h-full pb-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`enabled-${backend.id}`}
                                                    checked={backend.enabled}
                                                    onCheckedChange={(c) => updateBackend(backend.id, { enabled: c as boolean })}
                                                />
                                                <Label htmlFor={`enabled-${backend.id}`}>Enabled</Label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Policies */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Policies</CardTitle>
                    <Button onClick={addPolicy} variant="outline" size="sm">Add Policy</Button>
                </CardHeader>
                <CardContent>
                    {config.policies.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No policies. Click "Add Policy" to create one.</p>
                    ) : (
                        <div className="space-y-4">
                            {config.policies.map(policy => (
                                <div key={policy.id} className="p-4 border rounded-lg space-y-4">
                                    <div className="flex justify-between items-start">
                                        <span className="font-medium text-sm text-muted-foreground">Policy Configuration</span>
                                        <Button
                                            onClick={() => removePolicy(policy.id)}
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8"
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        <InputWrapper label="ID">
                                            <Input
                                                value={policy.id}
                                                onChange={(e) => updatePolicy(policy.id, { id: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Name">
                                            <Input
                                                value={policy.name}
                                                onChange={(e) => updatePolicy(policy.id, { name: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Path Pattern">
                                            <Input
                                                value={policy.pathPattern}
                                                onChange={(e) => updatePolicy(policy.id, { pathPattern: e.target.value })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Priority">
                                            <Input
                                                type="number"
                                                value={String(policy.priority)}
                                                onChange={(e) => updatePolicy(policy.id, { priority: parseInt(e.target.value) || 0 })}
                                            />
                                        </InputWrapper>
                                        <InputWrapper label="Strategy">
                                            <Select
                                                value={policy.strategy}
                                                onValueChange={(v) => updatePolicy(policy.id, { strategy: v as LoadBalancerStrategy })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STRATEGIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </InputWrapper>
                                        <div className="flex items-end h-full pb-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`enabled-${policy.id}`}
                                                    checked={policy.enabled}
                                                    onCheckedChange={(c) => updatePolicy(policy.id, { enabled: c as boolean })}
                                                />
                                                <Label htmlFor={`enabled-${policy.id}`}>Enabled</Label>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3">
                                        <Label className="mb-2 block text-xs">Backends</Label>
                                        <div className="flex flex-wrap gap-4">
                                            {config.backends.map(b => (
                                                <div key={b.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`policy-${policy.id}-backend-${b.id}`}
                                                        checked={policy.backendIds.includes(b.id)}
                                                        onCheckedChange={(checked) => {
                                                            const newIds = checked
                                                                ? [...policy.backendIds, b.id]
                                                                : policy.backendIds.filter(id => id !== b.id);
                                                            updatePolicy(policy.id, { backendIds: newIds });
                                                        }}
                                                    />
                                                    <Label htmlFor={`policy-${policy.id}-backend-${b.id}`}>{b.name}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Default Rate Limit */}
            <Card>
                <CardHeader>
                    <CardTitle>Default Rate Limit</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center space-x-2 h-full pt-6">
                            <Checkbox
                                id="rl-enabled"
                                checked={config.defaultRateLimit.enabled}
                                onCheckedChange={(v) => setConfig(prev => ({
                                    ...prev,
                                    defaultRateLimit: { ...prev.defaultRateLimit, enabled: v as boolean }
                                }))}
                            />
                            <Label htmlFor="rl-enabled">Enabled</Label>
                        </div>
                        <InputWrapper label="Window (ms)">
                            <Input
                                type="number"
                                value={String(config.defaultRateLimit.windowMs)}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    defaultRateLimit: { ...prev.defaultRateLimit, windowMs: parseInt(e.target.value) || 60000 }
                                }))}
                            />
                        </InputWrapper>
                        <InputWrapper label="Max Requests">
                            <Input
                                type="number"
                                value={String(config.defaultRateLimit.maxRequests)}
                                onChange={(e) => setConfig(prev => ({
                                    ...prev,
                                    defaultRateLimit: { ...prev.defaultRateLimit, maxRequests: parseInt(e.target.value) || 100 }
                                }))}
                            />
                        </InputWrapper>
                        <InputWrapper label="Key Type">
                            <Select
                                value={config.defaultRateLimit.keyType}
                                onValueChange={(v) => setConfig(prev => ({
                                    ...prev,
                                    defaultRateLimit: { ...prev.defaultRateLimit, keyType: v as typeof KEY_TYPES[number] }
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {KEY_TYPES.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </InputWrapper>
                    </div>
                </CardContent>
            </Card>

            {/* Default Bot Guard */}
            <Card>
                <CardHeader>
                    <CardTitle>Default Bot Guard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex gap-6">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="bg-enabled"
                                checked={config.defaultBotGuard.enabled}
                                onCheckedChange={(v) => setConfig(prev => ({
                                    ...prev,
                                    defaultBotGuard: { ...prev.defaultBotGuard, enabled: v as boolean }
                                }))}
                            />
                            <Label htmlFor="bg-enabled">Enabled</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="bg-ai"
                                checked={config.defaultBotGuard.useAiClassifier}
                                onCheckedChange={(v) => setConfig(prev => ({
                                    ...prev,
                                    defaultBotGuard: { ...prev.defaultBotGuard, useAiClassifier: v as boolean }
                                }))}
                            />
                            <Label htmlFor="bg-ai">Use AI Classifier</Label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label>Thresholds</Label>
                        <div className="grid grid-cols-3 gap-3">
                            <InputWrapper label="Low">
                                <Input
                                    type="number"
                                    value={String(config.defaultBotGuard.thresholds.low)}
                                    onChange={(e) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            thresholds: { ...prev.defaultBotGuard.thresholds, low: parseFloat(e.target.value) || 0.3 }
                                        }
                                    }))}
                                />
                            </InputWrapper>
                            <InputWrapper label="Medium">
                                <Input
                                    type="number"
                                    value={String(config.defaultBotGuard.thresholds.medium)}
                                    onChange={(e) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            thresholds: { ...prev.defaultBotGuard.thresholds, medium: parseFloat(e.target.value) || 0.6 }
                                        }
                                    }))}
                                />
                            </InputWrapper>
                            <InputWrapper label="High">
                                <Input
                                    type="number"
                                    value={String(config.defaultBotGuard.thresholds.high)}
                                    onChange={(e) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            thresholds: { ...prev.defaultBotGuard.thresholds, high: parseFloat(e.target.value) || 0.85 }
                                        }
                                    }))}
                                />
                            </InputWrapper>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label>Actions</Label>
                        <div className="grid grid-cols-3 gap-3">
                            <InputWrapper label="Low">
                                <Select
                                    value={config.defaultBotGuard.actions.low}
                                    onValueChange={(v) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            actions: { ...prev.defaultBotGuard.actions, low: v as typeof BOT_ACTIONS[number] }
                                        }
                                    }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {BOT_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </InputWrapper>
                            <InputWrapper label="Medium">
                                <Select
                                    value={config.defaultBotGuard.actions.medium}
                                    onValueChange={(v) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            actions: { ...prev.defaultBotGuard.actions, medium: v as typeof BOT_ACTIONS[number] }
                                        }
                                    }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {BOT_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </InputWrapper>
                            <InputWrapper label="High">
                                <Select
                                    value={config.defaultBotGuard.actions.high}
                                    onValueChange={(v) => setConfig(prev => ({
                                        ...prev,
                                        defaultBotGuard: {
                                            ...prev.defaultBotGuard,
                                            actions: { ...prev.defaultBotGuard.actions, high: v as typeof BOT_ACTIONS[number] }
                                        }
                                    }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {BOT_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </InputWrapper>
                        </div>
                    </div>
                </CardContent>
            </Card>
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
        <Card>
            <CardHeader>
                <CardTitle>JSON Editor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {parseError && (
                    <Alert variant="destructive">
                        <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                )}
                <Textarea
                    value={text}
                    onChange={(e) => handleChange(e.target.value)}
                    className="font-mono h-[500px]"
                    spellCheck={false}
                />
            </CardContent>
        </Card>
    );
}

function InputWrapper({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}
