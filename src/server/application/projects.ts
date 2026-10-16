import { getDb, type Database, type Row } from "../infrastructure/database";
import { managementCounts, programDay } from "../../shared/management-signals";
type Counts = {
  total: number;
  accepted: number;
  blocked: number;
  percentage: number | null;
  done: number;
  active: number;
  overdue: number;
  withoutForecast: number;
};
export type ProjectSummary = Row &
  Counts & {
    domains: Row[];
    areas: Row[];
    squads: Row[];
    featureCount: number;
    workstreams: (Row & Counts)[];
  };
export async function projectPortfolio(
  userId: string,
  database: Database = getDb(),
): Promise<{ asOf: string; items: ProjectSummary[] }> {
  return database.transaction(async (tx) => {
    const programs = await tx.query(
      "SELECT p.* FROM portfolio.programs p WHERE EXISTS(SELECT 1 FROM iam.memberships m WHERE m.program_id=p.id AND m.user_id=$1 AND (m.expires_at IS NULL OR m.expires_at>now())) ORDER BY p.name",
      [userId],
    );
    const read = async (table: string) =>
      tx.query(
        `SELECT r.* FROM ${table} r WHERE EXISTS(SELECT 1 FROM iam.memberships m WHERE m.program_id=r.program_id AND m.user_id=$1 AND (m.expires_at IS NULL OR m.expires_at>now()))`,
        [userId],
      );
    const asOf = new Date().toISOString();
    const deliverables = await read("delivery.deliverables"),
      capabilities = await read("portfolio.capabilities"),
      workstreams = await read("portfolio.workstreams"),
      domains = await read("portfolio.domains"),
      areas = await read("portfolio.areas"),
      squads = await read("portfolio.squads");
    return {
      asOf,
      items: programs.map((p) => {
        const ds = deliverables.filter((d) => d.program_id === p.id);
        const rollup = (items: typeof deliverables) =>
          managementCounts(items, programDay(asOf, p.timezone));
        return {
          ...p,
          ...rollup(ds),
          featureCount: capabilities.filter((c) => c.program_id === p.id)
            .length,
          domains: domains.filter((d) => d.program_id === p.id),
          areas: areas.filter((d) => d.program_id === p.id),
          squads: squads.filter((d) => d.program_id === p.id),
          workstreams: workstreams
            .filter((w) => w.program_id === p.id)
            .map((w) => ({
              ...w,
              ...rollup(ds.filter((d) => d.workstream_id === w.id)),
            })),
        };
      }),
    };
  });
}
