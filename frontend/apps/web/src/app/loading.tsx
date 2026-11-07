const SKELETON_ITEMS = ["skel-1", "skel-2", "skel-3", "skel-4", "skel-5", "skel-6"];

export default function Loading() {
  return (
    <div className="p-6 space-y-8 animate-fade-in">
      {/* Hero skeleton */}
      <div className="w-full h-[400px] bg-[#141414] rounded-lg animate-skeleton border border-[#262626]" />

      {/* Section 1 skeleton */}
      <div className="space-y-4">
        <div className="h-6 w-48 bg-[#141414] rounded-lg animate-skeleton" />
        <div className="flex gap-4 overflow-hidden">
          {SKELETON_ITEMS.map((id) => (
            <div key={id} className="flex-shrink-0 w-[200px] space-y-3">
              <div className="aspect-video bg-[#141414] rounded-lg animate-skeleton" />
              <div className="h-4 w-3/4 bg-[#141414] rounded animate-skeleton" />
              <div className="h-3 w-1/2 bg-[#141414] rounded animate-skeleton" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 skeleton */}
      <div className="space-y-4">
        <div className="h-6 w-36 bg-[#141414] rounded-lg animate-skeleton" />
        <div className="flex gap-4 overflow-hidden">
          {SKELETON_ITEMS.map((id) => (
            <div key={`s2-${id}`} className="flex-shrink-0 w-[200px] space-y-3">
              <div className="aspect-video bg-[#141414] rounded-lg animate-skeleton" />
              <div className="h-4 w-3/4 bg-[#141414] rounded animate-skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
