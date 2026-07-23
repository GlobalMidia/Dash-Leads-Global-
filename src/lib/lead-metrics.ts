import type { Lead, LeadStatus } from "@/types/lead";

export type DashboardFilters = {
  query: string;
  origin: string;
  status: "all" | LeadStatus;
  startDate: string;
  endDate: string;
};

export function filterLeads(leads: Lead[], filters: DashboardFilters) {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("pt-BR");
  const start = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00`)
    : null;
  const end = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999`)
    : null;

  return leads.filter((lead) => {
    const enteredAt = new Date(lead.enteredAt);
    const matchesQuery =
      !normalizedQuery ||
      [lead.name, lead.company, lead.email, lead.phone, lead.origin].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
      );

    return (
      matchesQuery &&
      (filters.origin === "all" || lead.origin === filters.origin) &&
      (filters.status === "all" || lead.status === filters.status) &&
      (!start || enteredAt >= start) &&
      (!end || enteredAt <= end)
    );
  });
}

export function summarizeLeads(leads: Lead[]) {
  const count = (status: LeadStatus) =>
    leads.filter((lead) => lead.status === status).length;
  const qualified = count("qualified");
  const closed = count("closed");
  const total = leads.length;

  return {
    total,
    pending: count("pending"),
    attended: count("attended"),
    qualified,
    disqualified: count("disqualified"),
    closed,
    conversionRate: total ? Math.round((closed / total) * 100) : 0,
    qualificationRate: total
      ? Math.round(((qualified + closed) / total) * 100)
      : 0,
  };
}

export function groupByOrigin(leads: Lead[]) {
  const counts = new Map<string, number>();
  leads.forEach((lead) => counts.set(lead.origin, (counts.get(lead.origin) ?? 0) + 1));

  return [...counts.entries()]
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin));
}

export function groupByDay(leads: Lead[], numberOfDays = 11) {
  const latestDate =
    leads.length > 0
      ? new Date(
          Math.max(...leads.map((lead) => new Date(lead.enteredAt).getTime())),
        )
      : new Date();
  latestDate.setHours(0, 0, 0, 0);

  return Array.from({ length: numberOfDays }, (_, index) => {
    const date = new Date(latestDate);
    date.setDate(latestDate.getDate() - (numberOfDays - index - 1));
    const dateKey = date.toISOString().slice(0, 10);

    return {
      date: dateKey,
      label: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }).format(date),
      total: leads.filter((lead) => lead.enteredAt.slice(0, 10) === dateKey)
        .length,
    };
  });
}
