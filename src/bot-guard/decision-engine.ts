import type { RequestFeatures, BotScoringResult, BotGuardConfig } from '@/config/schema';
import { evaluateBotScore, checkAllowBlockLists } from './heuristics';

/**
 * AI Classifier response type
 */
export interface AIClassifierResponse {
    probability: number;
    categories: string[];
    explanation: string;
}

/**
 * Configuration for AI classifier
 */
interface AIClassifierConfig {
    url: string;
    apiKey: string;
    timeoutMs: number;
}

/**
 * Call the optional AI classifier with strict timeout
 * Always falls back to null on any error/timeout
 */
async function callAIClassifier(
    featureSummary: Record<string, unknown>,
    config: AIClassifierConfig
): Promise<AIClassifierResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const response = await fetch(config.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
            },
            body: JSON.stringify(featureSummary),
            signal: controller.signal,
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        
        // Python API returns { bot_score: float, is_bot: bool }
        const botScore = data.bot_score ?? 0;
        const isBot = data.is_bot ?? false;
        
        return {
            probability: botScore,
            categories: isBot ? ['bot'] : ['human'],
            explanation: `AI classifier score: ${botScore.toFixed(3)}`,
        };
    } catch {
        // Timeout or network error - fail silently
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Create feature summary matching Python API RequestFeatures model
 * Matches ai-service/main.py: RequestFeatures(url: str, method: str = "GET", user_agent: str = "")
 */
function createAIFeatureSummary(features: RequestFeatures): Record<string, unknown> {
    return {
        url: features.path,
        method: features.method,
        user_agent: features.userAgent,
    };
}

/**
 * Main decision engine entry point
 * Combines heuristics with optional AI classification
 */
export async function makeDecision(
    features: RequestFeatures,
    config: BotGuardConfig,
    options: {
        ipAllowlist?: string[];
        ipBlocklist?: string[];
        aiConfig?: AIClassifierConfig;
    } = {}
): Promise<BotScoringResult> {
    // 1. Check allow/block lists first (fast path)
    const listResult = checkAllowBlockLists(
        features.ipHash,
        options.ipAllowlist,
        options.ipBlocklist
    );

    if (listResult === 'allow') {
        return {
            score: 0,
            bucket: 'low',
            decision: 'allow',
            reasons: [{ rule: 'allowlist', weight: 0, triggered: true, explanation: 'IP in allowlist' }],
        };
    }

    if (listResult === 'block') {
        return {
            score: 1,
            bucket: 'high',
            decision: 'block',
            reasons: [{ rule: 'blocklist', weight: 0, triggered: true, explanation: 'IP in blocklist' }],
        };
    }

    // 2. Run heuristics-based scoring
    const heuristicResult = evaluateBotScore(features, config);
    console.log('[DecisionEngine] Heuristic result:', {
        score: heuristicResult.score,
        triggered: heuristicResult.reasons.filter(r => r.triggered).map(r => r.rule)
    });

    // 3. Optionally enhance with AI classifier
    if (config.useAiClassifier && options.aiConfig) {
        console.log('[DecisionEngine] AI classification enabled');
        const featureSummary = createAIFeatureSummary(features);
        const aiResult = await callAIClassifier(featureSummary, options.aiConfig);

        console.log('[DecisionEngine] AI raw response:', aiResult);

        if (aiResult) {
            // Blend AI result with heuristics (AI weighted at 40%)
            const blendedScore = heuristicResult.score * 0.6 + aiResult.probability * 0.4;
            console.log('[DecisionEngine] Blended score:', blendedScore, '(Heuristic:', heuristicResult.score, 'AI:', aiResult.probability, ')');

            return {
                ...heuristicResult,
                score: blendedScore,
                bucket: blendedScore >= config.thresholds.high ? 'high'
                    : blendedScore >= config.thresholds.medium ? 'medium'
                        : 'low',
                decision: blendedScore >= config.thresholds.high ? config.actions.high
                    : blendedScore >= config.thresholds.medium ? config.actions.medium
                        : config.actions.low,
                aiResult,
            };
        } else {
            console.log('[DecisionEngine] AI call returned null/failed, using heuristic score');
        }
    }

    // 4. Return heuristics-only result
    return heuristicResult;
}

/**
 * Quick sync evaluation (no AI) for hot path
 */
export function evaluateSync(
    features: RequestFeatures,
    config: BotGuardConfig,
    options: {
        ipAllowlist?: string[];
        ipBlocklist?: string[];
    } = {}
): BotScoringResult {
    // Check allow/block lists first
    const listResult = checkAllowBlockLists(
        features.ipHash,
        options.ipAllowlist,
        options.ipBlocklist
    );

    if (listResult === 'allow') {
        return {
            score: 0,
            bucket: 'low',
            decision: 'allow',
            reasons: [{ rule: 'allowlist', weight: 0, triggered: true, explanation: 'IP in allowlist' }],
        };
    }

    if (listResult === 'block') {
        return {
            score: 1,
            bucket: 'high',
            decision: 'block',
            reasons: [{ rule: 'blocklist', weight: 0, triggered: true, explanation: 'IP in blocklist' }],
        };
    }

    return evaluateBotScore(features, config);
}
