import { Database } from "bun:sqlite";
import { buildRecoveryContext } from "./src/sync/recoveryContext";
import type { StoredMessage } from "./src/store/types";

const db = new Database("/home/huynq/.hapi/hapi.db", { readonly: true });

const sessionId = "550f5c7e-424c-4ac6-b581-7c85a3d832f1";

const rows = db.query(`
    SELECT id, session_id, content, created_at, seq, local_id, invoked_at
    FROM messages
    WHERE session_id = ?
    ORDER BY seq
`).all(sessionId) as any[];

console.log(`Total messages in session: ${rows.length}`);

const messages: StoredMessage[] = rows.map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    createdAt: row.created_at,
    seq: row.seq,
    localId: row.local_id,
    invokedAt: row.invoked_at,
}));

const ctx = buildRecoveryContext(messages);
if (ctx) {
    console.log(`\n--- Recovery Context (${ctx.length} chars) ---`);
    console.log(ctx.substring(0, 2000));
    if (ctx.length > 2000) {
        console.log(`\n... (${ctx.length - 2000} more chars)`);
    }
} else {
    console.log("\nRecovery context is NULL!");
}

db.close();
