'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import HCaptcha from '@hcaptcha/react-hcaptcha';

function ChallengeForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const returnUrl = searchParams.get('return') || '/';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [token, setToken] = useState<string>('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            setError('Please complete the security check.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/challenge/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeResponse: token,
                    returnUrl,
                }),
                redirect: 'manual', // Don't follow redirects automatically
            });

            if (response.ok) {
                // Check if response is a redirect
                if (response.status === 302 || response.status === 307) {
                    const location = response.headers.get('Location');
                    if (location) {
                        // Follow the server redirect
                        window.location.href = location;
                        return;
                    }
                }
                
                // Fallback: try to get redirect URL from response body
                const data = await response.json().catch(() => null);
                if (data?.redirectUrl) {
                    window.location.href = data.redirectUrl;
                } else {
                    // Last resort: redirect to return URL
                    window.location.href = returnUrl;
                }
            } else {
                // Error response
                const data = await response.json().catch(() => ({ error: 'Verification failed' }));
                setError(data.error || 'Verification failed. Please try again.');
                setLoading(false);
            }
        } catch (err) {
            console.error('[Challenge] Error:', err);
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md w-full">
            <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-8 text-center">
                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <span className="text-3xl">🔐</span>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-white mb-2">
                    Security Check
                </h1>
                <p className="text-gray-400 mb-6">
                    Please verify that you are human to continue
                </p>

                {/* Challenge */}
                <div className="bg-gray-800/50 rounded-xl p-6 mb-6">
                    <p className="text-sm text-gray-400 mb-4">
                        Our system detected unusual activity from your connection.
                        This is a protective measure to ensure security.
                    </p>

                    {/* hCaptcha widget */}
                    <div className="flex justify-center mb-4">
                        <HCaptcha
                            sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || ''}
                            onVerify={(token) => {
                                setToken(token);
                                setError('');
                            }}
                            onError={() => setError('hCaptcha failed to load. Please refresh.')}
                            onExpire={() => setToken('')}
                            theme="dark"
                        />
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4">
                        {error}
                    </div>
                )}

                {/* Submit */}
                <form onSubmit={handleSubmit}>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Verifying...
                            </span>
                        ) : (
                            'Verify & Continue'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <p className="text-xs text-gray-500 mt-6">
                    This check helps us protect against automated abuse and ensure the security of our service.
                </p>
            </div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="max-w-md w-full">
            <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-8 text-center">
                <div className="animate-pulse">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-700" />
                    <div className="h-6 bg-gray-700 rounded mb-4" />
                    <div className="h-4 bg-gray-700 rounded w-3/4 mx-auto" />
                </div>
            </div>
        </div>
    );
}

export default function ChallengePage() {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <Suspense fallback={<LoadingFallback />}>
                <ChallengeForm />
            </Suspense>
        </div>
    );
}
