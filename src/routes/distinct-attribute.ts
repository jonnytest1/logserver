import { withPool } from '../database'
import { extendWithReplacement, generateForDays } from '../table-schema'
import { flatMapFulfilled } from '../util/flat-map-fulfilled'

export async function distinctAttribute(url, req, res) {
    const headers = req.headers as {
        "unique-attr"?: string
    }
    if (!headers['unique-attr'] || typeof headers['unique-attr'] != "string") {
        throw new Error("missing attr key")
    }
    let sql
    let params: Array<string> = []
    if (headers['unique-attr'] == "application") {
        sql = "SELECT DISTINCT application FROM LOG_TABLE"
    } else if (headers['unique-attr'] == "severity") {
        sql = "SELECT DISTINCT severity FROM LOG_TABLE"
    } else {
        sql = `SELECT DISTINCT LOG_ATTRIBUTES_TABLE.value
            FROM LOG_ATTRIBUTES_TABLE
                                WHERE LOG_ATTRIBUTES_TABLE.\`key\`= ?
            `
        params.push(headers['unique-attr'])
    }

    await withPool(async pool => {
        const promises = generateForDays(7, async dateStr => {
            const connection = await pool.getConnection()
            extendWithReplacement(connection)
            try {
                const results = await connection.queryReplaced<Array<Record<string, string>>>(dateStr, sql, params)
                return results.map(el => el[Object.keys(el)[0]])
            } finally {
                connection.end()
            }
        })

        const results = await Promise.allSettled(promises)
        const merged = flatMapFulfilled(results)
        const unique = new Set(merged)
        res.write(JSON.stringify([...unique]))
        res.end()
    })



}