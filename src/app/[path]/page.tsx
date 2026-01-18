import { AuthView } from '@neondatabase/auth/react';

export const dynamicParams = false;

export default async function AuthPage({ params, searchParams }: {
    params: Promise<{ path: string }>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { path } = await params;
    const { redirectTo } = await searchParams;

    return (
        <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6 min-h-screen">
            <AuthView
                path={path}
                {...(redirectTo && typeof redirectTo === 'string' ? { redirectTo } : {})}
            />
        </main>
    );
}
