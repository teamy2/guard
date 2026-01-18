import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Navigation */}
            <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-8">
                            <Link href="/dashboard" className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                                    <Shield className="w-5 h-5 text-primary-foreground" />
                                </div>
                                <span className="font-semibold text-lg">The Guard</span>
                            </Link>

                            <div className="hidden md:flex items-center gap-1">
                                <NavLink href="/dashboard">Overview</NavLink>
                                <NavLink href="/dashboard/bots">Bot Guard</NavLink>
                                <NavLink href="/dashboard/backends">Backends</NavLink>
                                <NavLink href="/dashboard/policies">Policies</NavLink>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <a
                                href="https://sentry.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                                <SentryIcon />
                                Sentry
                            </a>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href}>
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                {children}
            </Button>
        </Link>
    );
}

function SentryIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 72 66" fill="currentColor">
            <path d="M29 2.26a4.67 4.67 0 0 0-8 0L14.42 13.53A32.21 32.21 0 0 1 32.17 40.19H27.55A27.68 27.68 0 0 0 12.09 17.47L6 28a15.92 15.92 0 0 1 9.23 12.17H4.62A.76.76 0 0 1 4 39.06l2.94-5a10.74 10.74 0 0 0-3.36-1.9l-2.91 5a4.54 4.54 0 0 0 1.69 6.24A4.66 4.66 0 0 0 4.62 44h14.73a.76.76 0 0 1 .76.76v.13a.75.75 0 0 1-.13.42L17.05 51H4.62a4.54 4.54 0 0 0-4.43 5.52 4.48 4.48 0 0 0 2.16 2.82L24.31 43A36.58 36.58 0 0 1 0 0z" />
        </svg>
    );
}
