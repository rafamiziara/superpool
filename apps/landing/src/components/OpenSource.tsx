import { SectionHeading } from '@/components/SectionHeading'
import { GitHubIcon } from '@/components/Navigation'

interface RepoStats {
  stars: number
  forks: number
}

async function getRepoStats(): Promise<RepoStats | null> {
  try {
    const res = await fetch('https://api.github.com/repos/rm30-dev/superpool', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data: { stargazers_count?: number; forks_count?: number } = await res.json()
    if (typeof data.stargazers_count !== 'number' || typeof data.forks_count !== 'number') return null
    return { stars: data.stargazers_count, forks: data.forks_count }
  } catch {
    return null
  }
}

const treeLines = [
  'superpool/',
  '├── apps/',
  '│   ├── mobile/      # React Native · Expo',
  '│   └── landing/     # this page',
  '└── packages/',
  '    ├── contracts/   # Solidity · Hardhat',
  '    ├── backend/     # Firebase Functions',
  '    └── ui, types, design, assets',
]

export async function OpenSource() {
  const stats = await getRepoStats()

  return (
    <section id="open-source" className="relative border-t border-hairline-soft bg-abyss py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              eyebrow="Open source"
              title="Every line of it, in the open."
              description="Contracts, backend, mobile app and this page live in one public monorepo under the MIT license. Read it, fork it, break it on testnet."
            />

            <dl data-reveal className="mt-9 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="font-mono text-[0.625rem] tracking-widest text-mist-dim uppercase">Stars</dt>
                <dd className="mt-1 font-mono text-2xl font-bold text-foam">{stats ? stats.stars : '—'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[0.625rem] tracking-widest text-mist-dim uppercase">Forks</dt>
                <dd className="mt-1 font-mono text-2xl font-bold text-foam">{stats ? stats.forks : '—'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[0.625rem] tracking-widest text-mist-dim uppercase">License</dt>
                <dd className="mt-1 font-mono text-2xl font-bold text-foam">MIT</dd>
              </div>
            </dl>

            <a
              data-reveal
              href="https://github.com/rm30-dev/superpool"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-foam px-7 py-3.5 font-display text-sm font-semibold text-abyss transition-all duration-300 hover:bg-white hover:shadow-[0_0_40px_rgba(233,241,252,0.25)]"
            >
              <GitHubIcon className="h-4.5 w-4.5" />
              Star the repo
            </a>
          </div>

          {/* Terminal card */}
          <div data-reveal className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-lumen/5 blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-2xl border border-hairline bg-deep shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-hairline-soft px-5 py-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-mist-dim/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-mist-dim/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-mist-dim/40" />
                <span className="ml-3 font-mono text-[0.625rem] tracking-widest text-mist-dim uppercase">terminal</span>
              </div>
              <div className="space-y-1 p-6 font-mono text-[0.8rem] leading-relaxed">
                <p className="text-mist">
                  <span className="text-lumen">$</span> git clone https://github.com/rm30-dev/superpool.git
                </p>
                <p className="text-mist">
                  <span className="text-lumen">$</span> pnpm install
                </p>
                <div className="pt-3 text-mist-dim">
                  {treeLines.map((line) => (
                    <p key={line} className="whitespace-pre">
                      {line}
                    </p>
                  ))}
                </div>
                <p className="pt-3 text-mist">
                  <span className="text-lumen">$</span>{' '}
                  <span className="animate-caret inline-block h-4 w-2 translate-y-0.5 bg-lumen" aria-hidden="true" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
