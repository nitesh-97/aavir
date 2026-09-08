/** @type {import('next').NextConfig} */
const nextConfig = {
  // Uploaded .glb/.usdz files are served from /public/uploads by the storage driver.
  async headers() {
    return [
      {
        // WebXR + camera access require a secure context; these keep the AR
        // session from being blocked by the default permissions policy.
        source: "/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self), xr-spatial-tracking=(self)" }],
      },
    ];
  },
};

export default nextConfig;
