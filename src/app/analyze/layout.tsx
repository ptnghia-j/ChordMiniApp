export const metadata = {
  title: 'Chord Analysis - Chord Recognition App',
  description: 'Analyze audio to detect chords and beats',
}

export default function AnalyzeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="analyze-layout">
      {children}
    </div>
  )
}
