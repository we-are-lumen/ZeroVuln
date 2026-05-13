import { APP_PATH } from "@/shared/constants/app-path";
import { AppPath } from "@/shared/types/app.path.type";

interface NavItem {
    href: AppPath,
    label: string
}

export const navItems: NavItem[] = [
    {
        href: APP_PATH.admin.index,
        label: 'Review'
    },
    {
        href: APP_PATH.admin.contractCatalog,
        label: 'Catalog'
    },
    {
        href: APP_PATH.admin.treasury,
        label: 'Treasury'
    },
]
