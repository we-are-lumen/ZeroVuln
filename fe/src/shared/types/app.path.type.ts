import { APP_PATH } from "../constants/app-path";

type NestedValue<T> = T extends string
    ? T
    : T extends object
    ? NestedValue<T[keyof T]>
    : never;

export type AppPath = NestedValue<typeof APP_PATH>