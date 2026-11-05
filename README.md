# Rolling Hills Viewer

Create a polished, functional web app called Living Landscape 3D: an interactive real-time 3D recreation of my reference image, showing a bright yellow-green broad-canopy tree on a sunlit rolling green hill, dark forested valley slopes, and distant misty blue mountains under a deep blue sky. Build an actual Three.js scene using React + TypeScript, preferably @react-three/fiber and @react-three/drei, not a static image or flat billboard. Create 3D terrain with rolling hills, layered mountain ridges with atmospheric fog, a detailed tree with a branching dark trunk and many small lime-yellow foliage clusters, realistic sunlight and long shadows. It must look dimensional from all sides. Use instancing/procedural geometry for performance. Make the default camera match the reference composition with the tree centered in the lower-middle and blue mountains/sky above.

Provide working OrbitControls: drag to rotate freely through 360 degrees, scroll/pinch to zoom, pan, smooth damping, responsive resize, touch and mobile support. Add a restrained translucent dark toolbar with Reset View, Auto Rotate toggle, Zoom In, Zoom Out, and Fullscreen buttons; make each functional. Add subtle instructions “Drag to rotate · Scroll to zoom · Pinch to explore”, accessible focus states, loading and WebGL error handling. Use cinematic natural greens/blues and warm sunlight. Optimize for smooth browser performance. Implement the actual scene, test for TypeScript/runtime errors, and do not pretend it is a 3D scene if it is only an image.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rolling-hills-viewer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a9b95285-ff24-44ce-be3d-944a3b4ed6f9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
