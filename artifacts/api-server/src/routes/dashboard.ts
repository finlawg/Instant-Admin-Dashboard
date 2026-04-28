import { Router, type IRouter } from "express";
import pg from "pg";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  ConnectDbBody,
  ConnectDbResponse,
  CreateRowBody,
  CreateRowQueryParams,
  CreateRowResponse,
  DeleteRowBody,
  DeleteRowQueryParams,
  DeleteRowResponse,
  ListColumnsQueryParams,
  ListColumnsResponse,
  ListConnectionsResponse,
  ListRowsQueryParams,
  ListRowsResponse,
  ListTablesQueryParams,
  ListTablesResponse,
  UpdateRowBody,
  UpdateRowQueryParams,
  UpdateRowResponse,
} from "@workspace/api-zod";
import {
  databaseConnectionsTable,
  db,
  queryHistoryTable,
  rowChangeHistoryTable,
  savedQueriesTable,
  type DatabaseConnection,
  type QueryHistory,
  type RowChangeHistory,
  type SavedQuery,
} from "@workspace/db";
import { decryptText, encryptText } from "../lib/security";
import { requireUser } from "../lib/session";

const { Pool } = pg;
const router: IRouter = Router();

const connectionPathParams = z.object({ connectionId: z.coerce.number().int().positive() });
const exportPathParams = z.object({
  connectionId: z.coerce.number().int().positive(),
  table: z.string().min(1),
});
const queryIdPathParams = z.object({ queryId: z.coerce.number().int().positive() });
const updateConnectionBody = z.object({
  name: z.string().trim().min(1).optional(),
  readOnly: z.boolean().optional(),
});
const savedQueryBody = z.object({
  connectionId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  sql: z.string().trim().min(1),
});
const historyQueryParams = z.object({ connectionId: z.coerce.number().int().positive() });
const exportQueryParams = z.object({
  search: z.string().optional(),
  filterColumn: z.string().optional(),
  filterValue: z.string().optional(),
  sortColumn: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

type ColumnInfo = {
  name: string;
  dataType: string;
  nullable: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
};

type RowFilterParams = {
  search?: string;
  filterColumn?: string;
  filterValue?: string;
};

type RowSortParams = {
  sortColumn?: string;
  sortDir?: "asc" | "desc";
};

function savedConnection(connection: DatabaseConnection) {
  return {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    databaseName: connection.databaseName,
    readOnly: connection.readOnly,
    createdAt: connection.createdAt.toISOString(),
  };
}

function savedQuery(query: SavedQuery) {
  return {
    id: query.id,
    connectionId: query.connectionId,
    name: query.name,
    sql: query.sql,
    createdAt: query.createdAt.toISOString(),
  };
}

function queryHistory(item: QueryHistory) {
  return {
    id: item.id,
    connectionId: item.connectionId,
    action: item.action,
    sql: item.sql,
    status: item.status,
    error: item.error,
    createdAt: item.createdAt.toISOString(),
  };
}

function rowChangeHistory(item: RowChangeHistory) {
  return {
    id: item.id,
    connectionId: item.connectionId,
    tableName: item.tableName,
    action: item.action,
    primaryKey: item.primaryKey,
    before: item.before,
    after: item.after,
    createdAt: item.createdAt.toISOString(),
  };
}

function parseTableName(table: string) {
  const parts = decodeURIComponent(table).split(".");
  if (parts.length === 1) {
    return { schema: "public", table: parts[0] };
  }
  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  }
  throw new Error("Invalid table name");
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error("Invalid identifier");
  }
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function qualifiedTableName(table: string) {
  const parts = parseTableName(table);
  return `${quoteIdentifier(parts.schema)}.${quoteIdentifier(parts.table)}`;
}

function normalizeValue(value: unknown) {
  return value === "" ? null : value;
}

function assertWritable(connection: DatabaseConnection) {
  if (connection.readOnly) {
    throw new Error("This connection is in read-only mode");
  }
}

function assertReadOnlySql(sql: string) {
  const normalized = sql.trim();
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Saved queries can only run read-only SELECT statements");
  }
  if (/;\s*\S/.test(normalized)) {
    throw new Error("Only one SQL statement can be run at a time");
  }
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  return [columns.map(escapeCsv).join(","), ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(","))].join("\n");
}

async function withExternalPool<T>(
  connection: DatabaseConnection,
  callback: (pool: pg.Pool) => Promise<T>,
) {
  const pool = new Pool({
    connectionString: decryptText(connection.encryptedConnectionString),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function getConnection(req: Parameters<typeof requireUser>[0], res: Parameters<typeof requireUser>[1], connectionId: number) {
  const user = await requireUser(req, res);
  if (!user) {
    return null;
  }
  const connections = await db
    .select()
    .from(databaseConnectionsTable)
    .where(
      and(
        eq(databaseConnectionsTable.id, connectionId),
        eq(databaseConnectionsTable.userId, user.id),
      ),
    )
    .limit(1);
  const connection = connections[0];
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return null;
  }
  return connection;
}

async function logQuery(connection: DatabaseConnection, action: string, sql: string, status: "success" | "error", error?: unknown) {
  await db.insert(queryHistoryTable).values({
    userId: connection.userId,
    connectionId: connection.id,
    action,
    sql,
    status,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  });
}

async function logRowChange(
  connection: DatabaseConnection,
  tableName: string,
  action: string,
  primaryKey: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await db.insert(rowChangeHistoryTable).values({
    userId: connection.userId,
    connectionId: connection.id,
    tableName,
    action,
    primaryKey,
    before,
    after,
  });
}

async function listColumns(pool: pg.Pool, table: string): Promise<ColumnInfo[]> {
  const parts = parseTableName(table);
  const result = await pool.query(
    `
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
           AND tc.table_name = kcu.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_primary_key
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `,
    [parts.schema, parts.table],
  );
  return result.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    nullable: row.is_nullable === "YES",
    hasDefault: row.column_default !== null,
    isPrimaryKey: Boolean(row.is_primary_key),
  }));
}

async function ensureTable(pool: pg.Pool, table: string) {
  const columns = await listColumns(pool, table);
  if (columns.length === 0) {
    throw new Error("Table not found or has no columns");
  }
  return columns;
}

function primaryWhere(primaryKey: Record<string, unknown>, columns: ColumnInfo[], startIndex = 1) {
  const validNames = new Set(columns.map((column) => column.name));
  const entries = Object.entries(primaryKey).filter(([key]) => validNames.has(key));
  if (entries.length === 0) {
    throw new Error("Primary key is required");
  }
  return {
    clause: entries
      .map(([key], index) => `${quoteIdentifier(key)} = $${startIndex + index}`)
      .join(" AND "),
    values: entries.map(([, value]) => normalizeValue(value)),
  };
}

function buildRowsFilter(params: RowFilterParams, columns: ColumnInfo[]) {
  const values: string[] = [];
  const clauses: string[] = [];
  const columnNames = new Set(columns.map((column) => column.name));
  const search = params.search?.trim();
  const filterColumn = params.filterColumn?.trim();
  const filterValue = params.filterValue?.trim();

  if (filterColumn && filterValue) {
    if (!columnNames.has(filterColumn)) {
      throw new Error("Filter column was not found in this table");
    }
    values.push(`%${filterValue}%`);
    clauses.push(`${quoteIdentifier(filterColumn)}::text ILIKE $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    const placeholder = `$${values.length}`;
    clauses.push(
      `(${columns
        .map((column) => `${quoteIdentifier(column.name)}::text ILIKE ${placeholder}`)
        .join(" OR ")})`,
    );
  }

  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildRowsSort(params: RowSortParams, columns: ColumnInfo[]) {
  if (!params.sortColumn) return "";
  if (!columns.some((column) => column.name === params.sortColumn)) {
    throw new Error("Sort column was not found in this table");
  }
  const dir = params.sortDir === "desc" ? "DESC" : "ASC";
  return `ORDER BY ${quoteIdentifier(params.sortColumn)} ${dir}`;
}

// Connection Test
router.post("/connections/test", async (req, res, next) => {
  try {
    const { connectionString } = req.body;
    
    if (!connectionString) {
      res.status(400).json({ error: "Connection string is required" });
      return;
    }

    // Test the connection by creating a temporary client
    const client = new pg.Client(connectionString);
    
    try {
      await client.connect();
      
      // Run a simple test query
      const result = await client.query('SELECT version()');
      
      await client.end();
      
      res.json({ 
        success: true, 
        message: "Connection successful",
        database: result.rows[0]?.version || "PostgreSQL database"
      });
    } catch (connectError) {
      // Ensure client is closed even if connection fails
      try {
        await client.end();
      } catch (endError) {
        // Ignore cleanup errors
      }
      
      res.status(400).json({ 
        success: false, 
        error: "Connection failed",
        message: connectError?.message || "Unable to connect to database"
      });
    }
  } catch (error) {
    next(error);
  }
});

// Connections
router.get("/connections", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }
    const connections = await db
      .select()
      .from(databaseConnectionsTable)
      .where(eq(databaseConnectionsTable.userId, user.id))
      .orderBy(desc(databaseConnectionsTable.createdAt));
    res.json(ListConnectionsResponse.parse(connections.map(savedConnection)));
  } catch (error) {
    next(error);
  }
});

router.patch("/connections/:connectionId", async (req, res, next) => {
  try {
    const params = connectionPathParams.parse(req.params);
    const body = updateConnectionBody.parse(req.body);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;

    const updates: Partial<typeof databaseConnectionsTable.$inferInsert> = {};
    if (body.name) updates.name = body.name;
    if (typeof body.readOnly === "boolean") updates.readOnly = body.readOnly;

    const updated = await db
      .update(databaseConnectionsTable)
      .set(updates)
      .where(eq(databaseConnectionsTable.id, connection.id))
      .returning();

    res.json(ConnectDbResponse.parse(savedConnection(updated[0] ?? connection)));
  } catch (error) {
    next(error);
  }
});

router.post("/connect-db", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }
    const body = ConnectDbBody.parse(req.body);
    const parsedUrl = new URL(body.connectionString);
    if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
      res.status(400).json({ error: "Only PostgreSQL connection strings are supported" });
      return;
    }
    const pool = new Pool({
      connectionString: body.connectionString,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000,
      max: 1,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query("SELECT 1");
    } finally {
      await pool.end();
    }
    const databaseName = parsedUrl.pathname.replace(/^\//, "") || "postgres";
    const name = body.name?.trim() || `${parsedUrl.hostname}/${databaseName}`;
    const inserted = await db
      .insert(databaseConnectionsTable)
      .values({
        userId: user.id,
        name,
        host: parsedUrl.hostname,
        databaseName,
        encryptedConnectionString: encryptText(body.connectionString),
        readOnly: body.readOnly ?? false,
      })
      .returning();
    const connection = inserted[0];
    if (!connection) {
      throw new Error("Failed to save connection");
    }
    res.json(ConnectDbResponse.parse(savedConnection(connection)));
  } catch (error) {
    next(error);
  }
});

router.get("/tables", async (req, res, next) => {
  try {
    const params = ListTablesQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    const data = await withExternalPool(connection, async (pool) => {
      const result = await pool.query(
        `
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_type = 'BASE TABLE'
            AND table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name
        `,
      );
      return result.rows.map((row) => `${row.table_schema}.${row.table_name}`);
    });
    res.json(ListTablesResponse.parse({ tables: data }));
  } catch (error) {
    next(error);
  }
});

router.get("/table-stats", async (req, res, next) => {
  try {
    const params = ListTablesQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;
    const tables = await withExternalPool(connection, async (pool) => {
      const result = await pool.query(
        `
          SELECT n.nspname AS schema_name, c.relname AS table_name, GREATEST(c.reltuples::bigint, 0) AS row_count
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          ORDER BY row_count DESC, n.nspname, c.relname
          LIMIT 20
        `,
      );
      return result.rows.map((row) => ({
        table: `${row.schema_name}.${row.table_name}`,
        rowCount: Number(row.row_count),
      }));
    });
    res.json({ tables });
  } catch (error) {
    next(error);
  }
});

router.get("/columns", async (req, res, next) => {
  try {
    const params = ListColumnsQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    const columns = await withExternalPool(connection, (pool) =>
      ensureTable(pool, params.table),
    );
    res.json(ListColumnsResponse.parse({ table: params.table, columns }));
  } catch (error) {
    next(error);
  }
});

router.get("/rows", async (req, res, next) => {
  try {
    const params = ListRowsQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    const data = await withExternalPool(connection, async (pool) => {
      const columns = await ensureTable(pool, params.table);
      const filter = buildRowsFilter(params, columns);
      const sort = buildRowsSort(params, columns);
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
      const offset = (page - 1) * pageSize;
      const rowsSql = `SELECT * FROM ${qualifiedTableName(params.table)} ${filter.clause} ${sort} LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}`;
      const countSql = `SELECT COUNT(*)::int AS total_count FROM ${qualifiedTableName(params.table)} ${filter.clause}`;
      const [result, count] = await Promise.all([
        pool.query(rowsSql, [...filter.values, pageSize, offset]),
        pool.query(countSql, filter.values),
      ]);
      await logQuery(connection, "list_rows", rowsSql, "success");
      return { columns, rows: result.rows, totalCount: Number(count.rows[0]?.total_count ?? 0), page, pageSize };
    });
    res.json(
      ListRowsResponse.parse({
        table: params.table,
        columns: data.columns,
        rows: data.rows,
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/connections/:connectionId/tables/:table/export", async (req, res, next) => {
  const params = exportPathParams.parse(req.params);
  let connection: DatabaseConnection | null = null;
  let sqlForLog = "export_csv";
  try {
    const query = exportQueryParams.parse(req.query);
    connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;
    const csv = await withExternalPool(connection, async (pool) => {
      const columns = await ensureTable(pool, params.table);
      const filter = buildRowsFilter(query, columns);
      const sort = buildRowsSort(query, columns);
      sqlForLog = `SELECT * FROM ${qualifiedTableName(params.table)} ${filter.clause} ${sort}`;
      const result = await pool.query(sqlForLog, filter.values);
      return toCsv(columns.map((column) => column.name), result.rows);
    });
    await logQuery(connection, "export_csv", sqlForLog, "success");
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${parseTableName(params.table).table}.csv"`);
    res.send(csv);
  } catch (error) {
    if (connection) await logQuery(connection, "export_csv", sqlForLog, "error", error);
    next(error);
  }
});

router.post("/create", async (req, res, next) => {
  try {
    const params = CreateRowQueryParams.parse(req.query);
    const body = CreateRowBody.parse(req.body);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    assertWritable(connection);
    const row = await withExternalPool(connection, async (pool) => {
      const columns = await ensureTable(pool, params.table);
      const columnNames = new Set(columns.map((column) => column.name));
      const entries = Object.entries(body.values).filter(([key]) => columnNames.has(key));
      let result: pg.QueryResult;
      let sql: string;
      if (entries.length === 0) {
        sql = `INSERT INTO ${qualifiedTableName(params.table)} DEFAULT VALUES RETURNING *`;
        result = await pool.query(sql);
      } else {
        const names = entries.map(([key]) => quoteIdentifier(key)).join(", ");
        const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
        const values = entries.map(([, value]) => normalizeValue(value));
        sql = `INSERT INTO ${qualifiedTableName(params.table)} (${names}) VALUES (${placeholders}) RETURNING *`;
        result = await pool.query(sql, values);
      }
      await logQuery(connection, "create_row", sql, "success");
      return result.rows[0];
    });
    await logRowChange(connection, params.table, "create", null, null, row);
    res.json(CreateRowResponse.parse({ row }));
  } catch (error) {
    next(error);
  }
});

router.patch("/update", async (req, res, next) => {
  try {
    const params = UpdateRowQueryParams.parse(req.query);
    const body = UpdateRowBody.parse(req.body);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    assertWritable(connection);
    const resultData = await withExternalPool(connection, async (pool) => {
      const columns = await ensureTable(pool, params.table);
      const columnNames = new Set(columns.map((column) => column.name));
      const entries = Object.entries(body.values).filter(([key]) => columnNames.has(key));
      if (entries.length === 0) {
        throw new Error("No valid columns to update");
      }
      const values = entries.map(([, value]) => normalizeValue(value));
      const where = primaryWhere(body.primaryKey, columns, values.length + 1);
      const beforeWhere = primaryWhere(body.primaryKey, columns);
      const beforeResult = await pool.query(
        `SELECT * FROM ${qualifiedTableName(params.table)} WHERE ${beforeWhere.clause}`,
        beforeWhere.values,
      );
      const assignments = entries
        .map(([key], index) => `${quoteIdentifier(key)} = $${index + 1}`)
        .join(", ");
      const sql = `UPDATE ${qualifiedTableName(params.table)} SET ${assignments} WHERE ${where.clause} RETURNING *`;
      const result = await pool.query(sql, [...values, ...where.values]);
      if (!result.rows[0]) {
        throw new Error("Row not found");
      }
      await logQuery(connection, "update_row", sql, "success");
      return { before: beforeResult.rows[0] ?? null, after: result.rows[0] };
    });
    await logRowChange(connection, params.table, "update", body.primaryKey, resultData.before, resultData.after);
    res.json(UpdateRowResponse.parse({ row: resultData.after }));
  } catch (error) {
    next(error);
  }
});

router.delete("/delete", async (req, res, next) => {
  try {
    const params = DeleteRowQueryParams.parse(req.query);
    const body = DeleteRowBody.parse(req.body);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }
    assertWritable(connection);
    const deletedRow = await withExternalPool(connection, async (pool) => {
      const columns = await ensureTable(pool, params.table);
      const where = primaryWhere(body.primaryKey, columns);
      const sql = `DELETE FROM ${qualifiedTableName(params.table)} WHERE ${where.clause} RETURNING *`;
      const result = await pool.query(sql, where.values);
      if (!result.rows[0]) {
        throw new Error("Row not found");
      }
      await logQuery(connection, "delete_row", sql, "success");
      return result.rows[0];
    });
    await logRowChange(connection, params.table, "delete", body.primaryKey, deletedRow, null);
    res.json(DeleteRowResponse.parse({ success: true }));
  } catch (error) {
    next(error);
  }
});

router.get("/saved-queries", async (req, res, next) => {
  try {
    const params = historyQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;
    const queries = await db
      .select()
      .from(savedQueriesTable)
      .where(
        and(
          eq(savedQueriesTable.userId, connection.userId),
          eq(savedQueriesTable.connectionId, connection.id),
        ),
      )
      .orderBy(desc(savedQueriesTable.createdAt));
    res.json(queries.map(savedQuery));
  } catch (error) {
    next(error);
  }
});

router.post("/saved-queries", async (req, res, next) => {
  try {
    const body = savedQueryBody.parse(req.body);
    const connection = await getConnection(req, res, body.connectionId);
    if (!connection) return;
    assertReadOnlySql(body.sql);
    const inserted = await db
      .insert(savedQueriesTable)
      .values({
        userId: connection.userId,
        connectionId: connection.id,
        name: body.name,
        sql: body.sql,
      })
      .returning();
    res.json(savedQuery(inserted[0]));
  } catch (error) {
    next(error);
  }
});

router.delete("/saved-queries/:queryId", async (req, res, next) => {
  try {
    const params = queryIdPathParams.parse(req.params);
    const user = await requireUser(req, res);
    if (!user) return;
    await db
      .delete(savedQueriesTable)
      .where(and(eq(savedQueriesTable.id, params.queryId), eq(savedQueriesTable.userId, user.id)));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/saved-queries/:queryId/run", async (req, res, next) => {
  let connection: DatabaseConnection | null = null;
  let sqlForLog = "saved_query";
  try {
    const params = queryIdPathParams.parse(req.params);
    const user = await requireUser(req, res);
    if (!user) return;
    const queries = await db
      .select()
      .from(savedQueriesTable)
      .where(and(eq(savedQueriesTable.id, params.queryId), eq(savedQueriesTable.userId, user.id)))
      .limit(1);
    const query = queries[0];
    if (!query) {
      res.status(404).json({ error: "Saved query not found" });
      return;
    }
    connection = await getConnection(req, res, query.connectionId);
    if (!connection) return;
    assertReadOnlySql(query.sql);
    sqlForLog = query.sql;
    const result = await withExternalPool(connection, async (pool) => pool.query(query.sql));
    await logQuery(connection, "run_saved_query", query.sql, "success");
    res.json({ columns: result.fields.map((field) => field.name), rows: result.rows });
  } catch (error) {
    if (connection) await logQuery(connection, "run_saved_query", sqlForLog, "error", error);
    next(error);
  }
});

router.get("/query-history", async (req, res, next) => {
  try {
    const params = historyQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;
    const history = await db
      .select()
      .from(queryHistoryTable)
      .where(and(eq(queryHistoryTable.userId, connection.userId), eq(queryHistoryTable.connectionId, connection.id)))
      .orderBy(desc(queryHistoryTable.createdAt))
      .limit(50);
    res.json(history.map(queryHistory));
  } catch (error) {
    next(error);
  }
});

router.get("/row-change-history", async (req, res, next) => {
  try {
    const params = historyQueryParams.parse(req.query);
    const connection = await getConnection(req, res, params.connectionId);
    if (!connection) return;
    const history = await db
      .select()
      .from(rowChangeHistoryTable)
      .where(and(eq(rowChangeHistoryTable.userId, connection.userId), eq(rowChangeHistoryTable.connectionId, connection.id)))
      .orderBy(desc(rowChangeHistoryTable.createdAt))
      .limit(50);
    res.json(history.map(rowChangeHistory));
  } catch (error) {
    next(error);
  }
});

// SQL Editor Query Endpoint
router.post("/connections/:connectionId/query", async (req, res, next) => {
  let connection: DatabaseConnection | undefined;
  let sqlForLog = "";
  
  try {
    const params = connectionPathParams.parse(req.params);
    const body = z.object({ sql: z.string().trim().min(1) }).parse(req.body);
    
    connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }

    sqlForLog = body.sql;
    
    // Execute the query
    const result = await withExternalPool(connection, async (pool) => {
      return pool.query(body.sql);
    });
    
    await logQuery(connection, "sql_editor", sqlForLog, "success");
    
    // Return results in the expected format
    res.json({
      columns: result.fields.map((field) => field.name),
      rows: result.rows,
      rowCount: result.rows.length,
    });
  } catch (error) {
    if (connection) await logQuery(connection, "sql_editor", sqlForLog, "error", error);
    next(error);
  }
});

// CSV Import Endpoint
router.post("/connections/:connectionId/tables/:table/import-csv", async (req, res, next) => {
  let connection: DatabaseConnection | undefined;
  
  try {
    const params = z.object({
      connectionId: z.coerce.number().int().positive(),
      table: z.string().min(1),
    }).parse(req.params);
    
    const body = z.object({
      headers: z.array(z.string()),
      rows: z.array(z.record(z.string())),
    }).parse(req.body);
    
    connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }

    // Check if connection is read-only
    if (connection.readOnly) {
      res.status(403).json({ error: "Cannot import data to read-only connection" });
      return;
    }

    const qualifiedTable = params.table.includes('.') 
      ? params.table 
      : `public.${params.table}`;

    // Get table schema to map CSV headers to actual column names
    const tableInfo = await withExternalPool(connection, async (pool) => {
      const result = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [
        params.table.includes('.') ? params.table.split('.')[0] : 'public',
        params.table.includes('.') ? params.table.split('.')[1] : params.table
      ]);
      return result.rows;
    });

    // Create mapping from CSV headers (case-insensitive) to actual column names
    const columnMapping: Record<string, string> = {};
    const tableColumns = tableInfo.map(col => col.column_name.toLowerCase());
    
    body.headers.forEach(csvHeader => {
      const csvHeaderLower = csvHeader.toLowerCase().trim();
      // Find exact or partial match
      const matchingColumn = tableColumns.find(tableCol => 
        tableCol === csvHeaderLower || 
        tableCol.includes(csvHeaderLower) || 
        csvHeaderLower.includes(tableCol)
      );
      if (matchingColumn) {
        // Get the actual column name (case-sensitive)
        const actualColumn = tableInfo.find(col => col.column_name.toLowerCase() === matchingColumn)?.column_name;
        if (actualColumn) {
          columnMapping[csvHeader] = actualColumn;
        }
      }
    });

    if (Object.keys(columnMapping).length === 0) {
      res.status(400).json({ 
        error: "No CSV headers could be mapped to table columns",
        availableColumns: tableInfo.map(col => col.column_name),
        csvHeaders: body.headers
      });
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each row
    for (let rowIndex = 0; rowIndex < body.rows.length; rowIndex++) {
      const row = body.rows[rowIndex];
      try {
        // Map CSV data to actual table columns
        const mappedData: Record<string, any> = {};
        Object.entries(columnMapping).forEach(([csvHeader, tableColumn]) => {
          mappedData[tableColumn] = row[csvHeader] || null;
        });

        const columns = Object.keys(mappedData);
        const values = Object.values(mappedData);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        
        const sql = `INSERT INTO ${qualifiedTable} (${columns.join(', ')}) VALUES (${placeholders})`;
        
        await withExternalPool(connection, async (pool) => {
          return pool.query(sql, values);
        });
        
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push(`Row ${rowIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // Log the failed query
        await logQuery(connection, "import_csv", `INSERT INTO ${qualifiedTable} ...`, "error", error);
      }
    }

    // Log the successful import
    await logQuery(connection, "import_csv", `Imported ${successCount} rows into ${qualifiedTable}`, "success");
    
    res.json({
      successCount,
      errorCount,
      errors: errors.slice(0, 10), // Return first 10 errors
      columnMapping,
      availableColumns: tableInfo.map(col => col.column_name),
    });
  } catch (error) {
    if (connection) await logQuery(connection, "import_csv", "CSV import failed", "error", error);
    next(error);
  }
});

// SQL Import Endpoint
router.post("/connections/:connectionId/execute-sql", async (req, res, next) => {
  let connection: DatabaseConnection | undefined;
  let sqlForLog = "";
  
  try {
    const params = connectionPathParams.parse(req.params);
    const body = z.object({ sql: z.string().trim().min(1) }).parse(req.body);
    
    connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }

    // Check if connection is read-only for write operations
    const isWriteOperation = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i.test(body.sql);
    if (connection.readOnly && isWriteOperation) {
      res.status(403).json({ error: "Cannot execute write operations on read-only connection" });
      return;
    }

    sqlForLog = body.sql;
    
    // Execute the SQL script
    const result = await withExternalPool(connection, async (pool) => {
      return pool.query(body.sql);
    });
    
    await logQuery(connection, "sql_import", sqlForLog, "success");
    
    // Return success message
    res.json({
      message: "SQL script executed successfully",
      rowsAffected: result.rowCount,
      result: result.rows,
    });
  } catch (error) {
    if (connection) await logQuery(connection, "sql_import", sqlForLog, "error", error);
    next(error);
  }
});

// Table Structure Endpoint
router.get("/connections/:connectionId/tables/:table/structure", async (req, res, next) => {
  let connection: DatabaseConnection | undefined;
  
  try {
    const params = z.object({
      connectionId: z.coerce.number().int().positive(),
      table: z.string().min(1),
    }).parse(req.params);
    
    connection = await getConnection(req, res, params.connectionId);
    if (!connection) {
      return;
    }

    const qualifiedTable = params.table.includes('.') 
      ? params.table 
      : `public.${params.table}`;

    // Get table columns with primary key info
    const columnsResult = await withExternalPool(connection, async (pool) => {
      return pool.query(`
        SELECT 
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          COALESCE(pk.constraint_type, '') as constraint_type
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu 
          ON c.column_name = kcu.column_name 
          AND c.table_schema = kcu.table_schema 
          AND c.table_name = kcu.table_name
        LEFT JOIN information_schema.table_constraints pk 
          ON kcu.constraint_name = pk.constraint_name 
          AND pk.constraint_type = 'PRIMARY KEY'
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `, [
        params.table.includes('.') ? params.table.split('.')[0] : 'public',
        params.table.includes('.') ? params.table.split('.')[1] : params.table
      ]);
    });

    // Get indexes
    const indexesResult = await withExternalPool(connection, async (pool) => {
      return pool.query(`
        SELECT 
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE schemaname = $1 AND tablename = $2
        ORDER BY indexname
      `, [
        params.table.includes('.') ? params.table.split('.')[0] : 'public',
        params.table.includes('.') ? params.table.split('.')[1] : params.table
      ]);
    });

    // Get foreign keys
    const foreignKeysResult = await withExternalPool(connection, async (pool) => {
      return pool.query(`
        SELECT 
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = $1 
          AND tc.table_name = $2
      `, [
        params.table.includes('.') ? params.table.split('.')[0] : 'public',
        params.table.includes('.') ? params.table.split('.')[1] : params.table
      ]);
    });

    // Format the response
    const columns = columnsResult.rows.map(col => ({
      column_name: col.column_name,
      data_type: col.data_type,
      is_nullable: col.is_nullable,
      column_default: col.column_default,
      is_primary_key: col.constraint_type === 'PRIMARY KEY'
    }));

    const indexes = indexesResult.rows.map(idx => ({
      indexname: idx.indexname,
      indexdef: idx.indexdef,
      indisunique: idx.indexdef.includes('UNIQUE')
    }));

    const foreignKeys = foreignKeysResult.rows.map(fk => ({
      column_name: fk.column_name,
      foreign_table_name: fk.foreign_table_name,
      foreign_column_name: fk.foreign_column_name
    }));

    res.json({
      columns,
      indexes,
      foreignKeys
    });
  } catch (error) {
    if (connection) await logQuery(connection, "table_structure", "Failed to load table structure", "error", error);
    next(error);
  }
});

export default router;
