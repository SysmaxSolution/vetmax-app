export default function TriageLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-16 bg-white border-b border-slate-200" />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 bg-slate-200 rounded" />
          <div className="h-6 w-36 bg-slate-200 rounded-full" />
        </div>

        {/* Patient card skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="h-8 w-48 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
          <div className="border-t border-slate-200 pt-4">
            <div className="h-4 w-40 bg-slate-200 rounded" />
          </div>
        </div>

        {/* Vitals card skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="h-6 w-32 bg-slate-200 rounded mb-6" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
                <div className="h-10 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Voice area skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="h-6 w-40 bg-slate-200 rounded mb-4" />
          <div className="h-24 bg-slate-100 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
