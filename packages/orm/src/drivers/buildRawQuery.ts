import { Knex } from "knex";
import { opToFn } from "../EntityGraphQLFilter";
import { isDefined } from "../EntityManager";
import { ColumnCondition, ParsedExpressionFilter, ParsedFindQuery, ParsedTable, RawCondition } from "../QueryParser";
import { kq, kqDot } from "../keywords";
import { assertNever, fail } from "../utils";
import QueryBuilder = Knex.QueryBuilder;

/**
 * Transforms `ParsedFindQuery` into a raw SQL string.
 *
 * In theory this should be implemented within each Driver, but the logic will be largely
 * the same for different dbs.
 */
export function buildRawQuery(
  parsed: ParsedFindQuery,
  settings: { limit?: number; offset?: number },
): { sql: string; bindings: readonly any[] } {
  const { limit, offset } = settings;

  // If we're doing o2m joins, add a `DISTINCT` clause to avoid duplicates
  const needsDistinct = parsed.tables.some((t) => t.join === "outer" && t.distinct !== false);

  let sql = "";
  const bindings: any[] = [];

  if (parsed.cte) {
    sql += parsed.cte.sql + " ";
    bindings.push(...parsed.cte.bindings);
  }

  sql += "SELECT ";
  parsed.selects.forEach((s, i) => {
    const maybeDistinct = i === 0 && needsDistinct ? "DISTINCT " : "";
    const maybeComma = i === parsed.selects.length - 1 ? "" : ", ";
    sql += maybeDistinct + s + maybeComma;
  });

  // Make sure the primary is first
  const primary = parsed.tables.find((t) => t.join === "primary")!;
  sql += ` FROM ${as(primary)}`;
  // Then the joins
  for (const t of parsed.tables) {
    switch (t.join) {
      case "inner":
        sql += ` JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
        break;
      case "outer":
        sql += ` LEFT OUTER JOIN ${as(t)} ON ${t.col1} = ${t.col2}`;
        break;
      case "primary":
        // ignore
        break;
      default:
        assertNever(t);
    }
  }

  if (parsed.lateralJoins) {
    sql += " " + parsed.lateralJoins.joins.join("\n");
    bindings.push(...parsed.lateralJoins.bindings);
  }

  if (parsed.condition) {
    const where = buildWhereClause(parsed.condition, true);
    if (where) {
      sql += " WHERE " + where[0];
      bindings.push(...where[1]);
    }
  }

  // If we're doing "select distinct" for o2m joins, then all order bys must be selects
  // if (needsDistinct) {
  //   query.select(`${alias}.${column}`);
  // }
  if (parsed.orderBys.length > 0) {
    sql += " ORDER BY " + parsed.orderBys.map((ob) => kqDot(ob.alias, ob.column) + " " + ob.order).join(", ");
  }

  if (limit) {
    sql += ` LIMIT ?`;
    bindings.push(limit);
  }
  if (offset) {
    sql += ` OFFSET ?`;
    bindings.push(offset);
  }

  return { sql, bindings };
}

/** Returns a tuple of `["cond AND (cond OR cond)", bindings]`. */
function buildWhereClause(exp: ParsedExpressionFilter, topLevel = false): [string, any[]] | undefined {
  const tuples = exp.conditions
    .map((c) => {
      return c.kind === "exp"
        ? buildWhereClause(c)
        : c.kind === "column"
          ? buildCondition(c)
          : c.kind === "raw"
            ? buildRawCondition(c)
            : fail(`Invalid condition ${c}`);
    })
    .filter(isDefined);
  // If we don't have any conditions to combine, just return undefined;
  if (tuples.length === 0) return undefined;
  // Wrap/join the sql strings together first, and then flatten the bindings.
  let sql = tuples.map(([sql]) => sql).join(` ${exp.op.toUpperCase()} `);
  if (!topLevel) sql = `(${sql})`;
  return [sql, tuples.flatMap(([, bindings]) => bindings)];
}

function buildRawCondition(raw: RawCondition): [string, any[]] {
  if (raw.bindings.length > 0) {
    throw new Error("Not implemented");
  }
  return [raw.condition, []];
}

/** Returns a tuple of `["column op ?"`, bindings]`. */
function buildCondition(cc: ColumnCondition): [string, any[]] {
  const { alias, column, cond } = cc;
  const columnName = kqDot(alias, column);
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "nlike":
    case "ilike":
    case "nilike":
    case "contains":
    case "containedBy":
    case "overlaps": {
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${columnName} ${fn} ?`, [cond.value]];
    }
    case "noverlaps":
    case "ncontains": {
      const fn = (opToFn as any)[cond.kind.substring(1)] ?? fail(`Invalid operator ${cond.kind}`);
      return [`NOT (${columnName} ${fn} ?)`, [cond.value]];
    }
    case "is-null":
      return [`${columnName} IS NULL`, []];
    case "not-null":
      return [`${columnName} IS NOT NULL`, []];
    case "in":
      return [`${columnName} = ANY(?)`, [cond.value]];
    case "nin":
      return [`${columnName} != ALL(?)`, [cond.value]];
    case "between":
      return [`${columnName} BETWEEN ? AND ?`, cond.value];
    default:
      assertNever(cond);
  }
}

const as = (t: ParsedTable) => `${kq(t.table)} AS ${kq(t.alias)}`;
