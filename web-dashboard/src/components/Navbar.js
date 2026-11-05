'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/app/LogoutButton';

export default function Navbar() {
  const pathname = usePathname();
  const isDashboard = pathname === '/';
  const isImport = pathname?.startsWith('/import');

  return (
    <header className="w-full border-b border-zinc-800/80 bg-[#0c0c0e]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl xl:max-w-[1540px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center font-bold text-xs shadow-sm">
              G
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-white">
                GMaps LeadGen
              </span>
              <span className="hidden md:inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-400 border border-zinc-700/80">
                Cloud + AI
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 border-l border-zinc-800 pl-2.5 sm:pl-4">
            <Link
              href="/"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDashboard
                  ? 'text-zinc-950 bg-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/import"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isImport
                  ? 'text-zinc-950 bg-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
              }`}
            >
              Import JSON
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <a
            href="/gmaps-leadgen-extension.zip"
            download="gmaps-leadgen-extension.zip"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-colors"
            title="Download file ZIP ekstensi Chrome"
          >
            <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Ekstensi Chrome</span>
          </a>

          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

