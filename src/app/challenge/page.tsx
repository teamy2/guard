'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ChallengePage() {
    const searchParams = useSearchParams();
    const returnPath = searchParams.get('return') || '/';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/challenge/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeResponse: 'human-verified',
                    returnPath,
                }),
            });

            if (response.ok) {
                window.location.href = returnPath;
            } else {
                setError('Verification failed. Please try again.');
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
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

                        {/* In production, integrate with hCaptcha/Turnstile here */}
                        <div className="h-24 bg-gray-700/50 rounded-lg flex items-center justify-center mb-4">
                            <span className="text-gray-500 text-sm">
                                [CAPTCHA Widget - Integrate hCaptcha/Turnstile]
                            </span>
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
        </div>
    );
}
