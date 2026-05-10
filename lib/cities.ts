export const CITY_CENTERS: Record<string, [number, number]> = {
  london: [51.5074, -0.1278],
  paris: [48.8566, 2.3522],
  barcelona: [41.3851, 2.1734],
  rome: [41.9028, 12.4964],
  amsterdam: [52.3676, 4.9041],
  tokyo: [35.6762, 139.6503],
  "new york": [40.7128, -74.006],
  dubai: [25.2048, 55.2708],
  singapore: [1.3521, 103.8198],
  sydney: [-33.8688, 151.2093],
  delhi: [28.7041, 77.1025],
};

export function cityCenter(city: string): {
  center: [number, number];
  zoom: number;
} {
  const key = city.trim().toLowerCase();
  if (CITY_CENTERS[key]) return { center: CITY_CENTERS[key], zoom: 13 };
  return { center: [20, 0], zoom: 2 };
}

export const CITY_CURRENCY: Record<string, { symbol: string; code: string }> = {
  london: { symbol: "£", code: "GBP" },
  paris: { symbol: "€", code: "EUR" },
  barcelona: { symbol: "€", code: "EUR" },
  rome: { symbol: "€", code: "EUR" },
  amsterdam: { symbol: "€", code: "EUR" },
  tokyo: { symbol: "¥", code: "JPY" },
  "new york": { symbol: "$", code: "USD" },
  dubai: { symbol: "AED", code: "AED" },
  singapore: { symbol: "S$", code: "SGD" },
  sydney: { symbol: "A$", code: "AUD" },
  delhi: { symbol: "₹", code: "INR" },
};

export const CITY_BUDGET_RANGES: Record<
  string,
  {
    budget: string;
    mid: string;
    comfort: string;
  }
> = {
  london: {
    budget: "Under £50/day",
    mid: "£50–£150/day",
    comfort: "£150+/day",
  },
  paris: { budget: "Under €60/day", mid: "€60–€180/day", comfort: "€180+/day" },
  barcelona: {
    budget: "Under €40/day",
    mid: "€40–€120/day",
    comfort: "€120+/day",
  },
  rome: { budget: "Under €45/day", mid: "€45–€130/day", comfort: "€130+/day" },
  amsterdam: {
    budget: "Under €60/day",
    mid: "€60–€180/day",
    comfort: "€180+/day",
  },
  tokyo: {
    budget: "Under ¥5000/day",
    mid: "¥5000–¥15000/day",
    comfort: "¥15000+/day",
  },
  "new york": {
    budget: "Under $60/day",
    mid: "$60–$200/day",
    comfort: "$200+/day",
  },
  dubai: {
    budget: "Under AED180/day",
    mid: "AED180–500/day",
    comfort: "AED500+/day",
  },
  singapore: {
    budget: "Under S$60/day",
    mid: "S$60–S$180/day",
    comfort: "S$180+/day",
  },
  sydney: {
    budget: "Under A$70/day",
    mid: "A$70–A$200/day",
    comfort: "A$200+/day",
  },
  delhi: {
    budget: "Under ₹1500/day",
    mid: "₹1500–₹3000/day",
    comfort: "₹3000+/day",
  },
};

export function getBudgetRanges(city: string) {
  return (
    CITY_BUDGET_RANGES[city.trim().toLowerCase()] ?? {
      budget: "Under £50/day",
      mid: "£50–£150/day",
      comfort: "£150+/day",
    }
  );
}

export function getCurrency(city: string): { symbol: string; code: string } {
  return (
    CITY_CURRENCY[city.trim().toLowerCase()] ?? { symbol: "$", code: "USD" }
  );
}
