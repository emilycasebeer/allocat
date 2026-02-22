/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['@supabase/supabase-js'],
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: '*' },
                ],
            },
        ]
    },
}

module.exports = nextConfig
