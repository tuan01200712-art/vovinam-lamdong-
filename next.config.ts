import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Xuất ra web tĩnh (thư mục out/): deploy được lên Vercel, Netlify, Cloudflare Pages, IIS, nginx...
  output: "export",
  // /hv/abc/ → out/hv/abc/index.html, chạy được trên mọi web server.
  trailingSlash: true,
  // Ảnh đã được script import nén sẵn sang WebP.
  images: { unoptimized: true },
};

export default nextConfig;
