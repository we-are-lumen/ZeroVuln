import { APP_PATH } from "@/shared/constants/app-path";
import { AppPath } from "@/shared/types/app.path.type";

interface NavItem {
    href: AppPath,
    label: string
}

export const navItems: NavItem[] = [
    {
        href: APP_PATH.dashboard.index,
        label: 'Dashboard'
    },
    {
        href: APP_PATH.dashboard.codeGen,
        label: 'Code Gen'
    },
    {
        href: APP_PATH.dashboard.analyze,
        label: 'Analyze'
    },
    {
        href: APP_PATH.dashboard.audit,
        label: 'Audit'
    },
]