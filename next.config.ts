import type { NextConfig } from "next";

// Media uploads go browser -> MinIO via presigned URLs, so server actions only carry small forms.
const nextConfig: NextConfig = {};

export default nextConfig;
