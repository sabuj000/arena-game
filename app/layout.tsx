import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arena Reflex',
  description: 'A reaction game built on the fictional Arena API, with a TypeScript SDK and an in-browser sandbox.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <h1>Arena Reflex</h1>
          <p className="muted">A demo game for the fictional Arena API</p>
        </header>
        {children}
        <footer className="foot">
          <p>
            Arena is a fictional API. This game calls a sandbox that runs in your browser, using the key <code>sk_test_arena_reflex</code>. A real game would call Arena from
            its server and keep secret keys out of the browser. Docs: <a href="https://github.com/sabuj000/arena-docs">arena-docs</a>.
          </p>
        </footer>
      </body>
    </html>
  )
}
