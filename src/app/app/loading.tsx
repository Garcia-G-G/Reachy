import { MonoEyebrow } from '@/components/editorial';

// Editorial skeleton shown while the (app) shell loads. Plain CSS pulse on
// rule-thin lines so we don't ship shadcn skeleton bg-shimmer (which doesn't
// match the magazine aesthetic).
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1080px] space-y-12 p-12">
      <MonoEyebrow as="div">— Loading edition</MonoEyebrow>
      <div className="space-y-4">
        <div className="h-12 w-3/4 animate-pulse bg-paper-2" />
        <div className="h-4 w-1/2 animate-pulse bg-paper-2" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-32 animate-pulse border border-rule" />
        <div className="h-32 animate-pulse border border-rule" />
      </div>
    </div>
  );
}
