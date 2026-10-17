import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const LandscapeExperience = lazy(() => import('@/components/LandscapeExperience'));
export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Living Landscape 3D — Nature Treasure Adventure' },
    { name: 'description', content: 'Explore rolling hills, blue water and reachable mountains. Drive toy cars, fly from the airfield and bring seven hidden treasures home.' },
    { property: 'og:title', content: 'Living Landscape 3D — Nature Treasure Adventure' },
    { property: 'og:description', content: 'A playful 3D nature adventure with an expanding world, toy vehicles and seven hidden treasures.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Index,
});

function Index() {
  const fallback = <div className="scene-loading" role="status"><p>Preparing your landscape…</p></div>;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><LandscapeExperience /></Suspense></ClientOnly>;
}
