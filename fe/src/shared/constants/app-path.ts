export const APP_PATH = {
    landing: '/',
    dashboard: {
        index: '/dashboard',
        codeGen: '/dashboard/code-gen',
        analyze: '/dashboard/analyze',
        audit: '/dashboard/audit',
        profile: '/dashboard/profile'
    },
    admin: {
        index: '/admin',
        contractCatalog: '/admin/contract-catalog',
        treasury: '/admin/treasury'
    }
} as const
