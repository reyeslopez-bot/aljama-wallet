const nextConfig = {
    productionBrowserSourceMaps: true,
    headers: async () => [
        {
            source: "/(.*)",
            headers: [
                {
                    key: "Cache-Control",
                    value: "no-store, no-cache, must-revalidate, proxy-revalidate",
                },
            ],
        },
    ],
};

export default nextConfig;

