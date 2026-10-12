import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const LandscapeExperience = lazy(() => import('@/components/LandscapeExperience'));
export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Living Landscape 3D — The Golden Canopy' },
    { name: 'description', content: 'Explore a living 3D landscape: a golden-green tree, sunlit rolling hills, forested valleys and misty blue mountains.' },
    { property: 'og:title', content: 'Living Landscape 3D — The Golden Canopy' },
    { property: 'og:description', content: 'An interactive mountain landscape, rendered in real time. Orbit, zoom, and discover a quieter perspective.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Index,
});

function Index() {
  const fallback = <div className="scene-loading" role="status"><p>Preparing your landscape…</p></div>;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><LandscapeExperience /></Suspense></ClientOnly>;
}
