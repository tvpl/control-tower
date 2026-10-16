type Row = Record<string, any>;
/** Calendar dates in the program timezone. Today is not overdue; DONE is execution complete, independently of acceptance. */
export function programDay(asOf: string, timezone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(asOf));
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function isOverdue(d: Row, today: string) {
  return (
    !!d.forecast_date &&
    d.forecast_date.slice(0, 10) < today &&
    d.execution_status !== "DONE" &&
    d.execution_status !== "CANCELLED"
  );
}
export function managementCounts(ds: Row[], today: string) {
  const items = [...new Map(ds.map((d) => [d.id, d])).values()];
  return {
    total: items.length,
    accepted: items.filter((d) => d.accepted).length,
    done: items.filter((d) => d.execution_status === "DONE").length,
    active: items.filter((d) => d.execution_status === "IN_PROGRESS").length,
    blocked: items.filter((d) => d.execution_status === "BLOCKED").length,
    overdue: items.filter((d) => isOverdue(d, today)).length,
    withoutForecast: items.filter((d) => !d.forecast_date).length,
    percentage: items.length
      ? Math.round(
          (items.filter((d) => d.accepted).length / items.length) * 100,
        )
      : null,
  };
}
