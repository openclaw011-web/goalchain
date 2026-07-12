'use client';

export function MarketCardSkeleton() {
  return (
    <div className="glass-card p-5 animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="skeleton h-5 w-20" />
        <div className="skeleton h-5 w-16" />
      </div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col items-center gap-2">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-4 w-12" />
        </div>
        <div className="skeleton h-6 w-16" />
        <div className="flex flex-col items-center gap-2">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-4 w-12" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
      <div className="flex justify-between pt-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-4 w-20" />
      </div>
    </div>
  );
}

export function MatchScoreSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-5 w-16" />
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="skeleton h-12 w-12 rounded-full" />
          <div className="skeleton h-6 w-20" />
        </div>
        <div className="skeleton h-10 w-24" />
        <div className="flex items-center gap-3">
          <div className="skeleton h-12 w-12 rounded-full" />
          <div className="skeleton h-6 w-20" />
        </div>
      </div>
      <div className="skeleton h-4 w-48 mx-auto" />
    </div>
  );
}

export function OddsChartSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="skeleton h-6 w-36" />
        <div className="skeleton h-6 w-20" />
      </div>
      <div className="skeleton h-[300px] rounded-lg" />
    </div>
  );
}

export function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 animate-pulse">
      <div className="skeleton h-6 w-8" />
      <div className="skeleton h-10 w-10 rounded-full" />
      <div className="flex-1">
        <div className="skeleton h-4 w-32 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
      <div className="skeleton h-4 w-20" />
      <div className="skeleton h-4 w-16" />
      <div className="skeleton h-4 w-16" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="skeleton h-10 w-48" />
      <div className="skeleton h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
