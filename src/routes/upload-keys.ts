import type { IncomingMessage, ServerResponse } from 'http';
import { withPool } from '../database';
import { extendWithReplacement, generateForDays, getTableNames } from '../table-schema';
import { flatMapFulfilled } from '../util/flat-map-fulfilled';
import { loadAttributes } from '../load-attributes';
import type { LogData } from '../types';
import { jsonStringify } from '../util/json-stringify';
import type { PoolConnection } from 'mariadb';

export async function uploadKeys(url: URL, req: IncomingMessage, res: ServerResponse) {

    const app = url.searchParams.get("app")
    if (!app) {
        res.writeHead(400).end()
        return
    }

    const sql = `SELECT * FROM LOG_TABLE 
            WHERE message = 'startup log' AND application = ?
            ORDER BY \`index\` DESC
            LIMIT 1`;

    await withPool(async pool => {

        extendWithReplacement(pool)
        const promises = generateForDays(7, async dateStr => {
            const connection = await pool.getConnection()
            extendWithReplacement(connection)
            try {
                const results = await connection.queryReplaced<Array<LogData>>(dateStr, sql, [app])
                await loadAttributes(pool, results, dateStr)
                return results
            } finally {
                connection.end()
            }
        })

        const results = await Promise.allSettled(promises)
        const merged = flatMapFulfilled(results)

        let latest: LogData = merged[0]
        for (let i = 1; i < merged.length; i++) {
            if (merged[i].index > latest.index) {
                latest = merged[i]
            }
        }

        let day = -6
        while (!latest) {
            day--
            const names = getTableNames(day)
            const poolConneciton: PoolConnection = await pool.getConnection()
            extendWithReplacement(poolConneciton)
            try {
                const results = await poolConneciton.queryReplaced<Array<LogData>>(names, sql, [app])
                await loadAttributes(pool, results, names)


                latest = results[0]
            } finally {
                poolConneciton.end()
            }

        }


        res.write(jsonStringify(latest))
        res.end()
    })

}