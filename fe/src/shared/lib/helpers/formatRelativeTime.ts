import { formatDistanceToNowStrict } from "date-fns";

const formatRelativeTime = (dateString: string | Date) => {
    if (!dateString) return "-";

    const distance = formatDistanceToNowStrict(new Date(dateString));

    const [value, unit] = distance.split(" ");

    const unitMap: Record<string, string> = {
        second: "s",
        seconds: "s",
        minute: "m",
        minutes: "m",
        hour: "h",
        hours: "h",
        day: "d",
        days: "d",
        month: "mo",
        months: "mo",
        year: "y",
        years: "y",
    };

    return `${value}${unitMap[unit] || unit}`;
};

export default formatRelativeTime