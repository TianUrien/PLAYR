import { Header } from '@/components'
import { HomeFeed } from '@/components/home/HomeFeed'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-2xl mx-auto px-4 md:px-6 pt-24 pb-24">
        <HomeFeed />
      </main>
    </div>
  )
}
